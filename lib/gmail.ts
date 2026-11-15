import { adminClient } from "./supabase";
import { decrypt } from "./crypto";

// Pre-filter: only likely recruiting mail is ever fetched in full or sent to the LLM.
const ATS = ["greenhouse.io", "lever.co", "myworkday.com", "ashbyhq.com", "icims.com", "smartrecruiters.com", "hirevue.com", "codesignal.com", "hackerrank.com", "workable.com"];
const SUBJECTS = ["thank you for applying", "application received", "assessment", "online assessment", "interview", "coffee chat", "next steps", "offer", "unfortunately", "availability"];

// since is a YYYY-MM-DD date; Gmail's after: takes YYYY/MM/DD.
export const buildQuery = (since: string) =>
  `after:${since.replace(/-/g, "/")} (from:(${ATS.join(" OR ")}) OR subject:(${SUBJECTS.map((s) => `"${s}"`).join(" OR ")})) -in:spam -in:trash`;

/** Thrown when the user has no saved Gmail token (token never saved, or revoked). /start offers "reconnect gmail". */
export class NoGoogleConnection extends Error {
  constructor(msg = "Gmail isn't connected to this account. Reconnect Gmail to backfill.") { super(msg); }
}

export async function accessTokenFor(userId: string): Promise<string> {
  const { data } = await adminClient().from("google_tokens").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  if (!data) throw new NoGoogleConnection();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: decrypt(data.refresh_token_enc),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new NoGoogleConnection("Google access expired or was revoked. Reconnect Gmail.");
  return (await res.json()).access_token;
}

const gm = (token: string, path: string) =>
  fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => {
    if (!r.ok) throw new Error(`Gmail ${r.status}`);
    return r.json();
  });

export async function listThreadIds(token: string, since: string, cap = 300): Promise<string[]> {
  const ids = new Set<string>();
  let pageToken = "";
  do {
    const q = new URLSearchParams({ q: buildQuery(since), maxResults: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const page = await gm(token, `messages?${q}`);
    (page.messages ?? []).forEach((m: any) => ids.add(m.threadId));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken && ids.size < cap);
  return [...ids].slice(0, cap);
}

// receivedAt is Gmail's own timestamp (ISO). The Date header is only shown to the classifier.
export type Slim = { threadId: string; from: string; subject: string; date: string; receivedAt: string; text: string };

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function plain(part: any): string {
  if (part.mimeType === "text/plain" && part.body?.data) return b64(part.body.data);
  return (part.parts ?? []).map(plain).join("\n");
}
// Strip quoted reply chains and cap length. The body exists only in memory.
const trim = (t: string) => t.split(/\n(?:On .+ wrote:|-{2,} ?Original Message|From: )/)[0].replace(/\s+/g, " ").slice(0, 1500);

export async function fetchSlim(token: string, threadId: string): Promise<Slim> {
  const t = await gm(token, `threads/${threadId}?format=full`);
  const msg = t.messages[t.messages.length - 1];
  const h = (n: string) => msg.payload.headers.find((x: any) => x.name.toLowerCase() === n)?.value ?? "";
  const ms = Number(msg.internalDate);
  const receivedAt = new Date(Number.isFinite(ms) && ms > 0 ? ms : Date.now()).toISOString();
  return { threadId, from: h("from"), subject: h("subject"), date: h("date"), receivedAt, text: trim(plain(msg.payload)) };
}
