import { NextResponse } from "next/server";
import { z } from "zod";
import { serverClient } from "@/lib/supabase";
import { accessTokenFor, listThreadIds, fetchSlim, NoGoogleConnection } from "@/lib/gmail";
import { classify, ClassifierConfigError } from "@/lib/classify";
import { plan, type ExistingApp } from "@/lib/ingest";
import { key, canon } from "@/lib/normalize";
import { MAX_BACKFILL_DAYS, DEFAULT_BACKFILL_DAYS, daysAgo } from "@/lib/backfill";

export const maxDuration = 300; // Vercel limit. Backfill is capped to fit.

const Body = z.object({ since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

const REQUIRED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY", "ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const PLACEHOLDERS = new Set(["from-google-cloud-console", "your-anthropic-key", "your-service-role-key"]); // values copied from .env.example

/**
 * Streams newline-delimited JSON so /start can show progress:
 *   {"type":"progress","scanned":12,"total":80,"found":5}
 *   {"type":"done","scanned":80,"total":80,"found":31,"failed":0,"since":"2026-09-16"}
 *   {"type":"error","error":"...","code":"connect_google"?}   (code set when Gmail isn't connected)
 * Body (optional): {"since":"YYYY-MM-DD"}, the oldest email date to read. Defaults to BACKFILL_DAYS (90) ago.
 */
export async function POST(req: Request) {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const missing = REQUIRED.filter((k) => !process.env[k] || PLACEHOLDERS.has(process.env[k]!));
  if (missing.length) return NextResponse.json({ error: `Backfill isn't set up yet. Missing in .env.local: ${missing.join(", ")}` }, { status: 500 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Start date must look like YYYY-MM-DD." }, { status: 400 });
  // One day of slack each way so a browser in another time zone isn't rejected.
  const latest = daysAgo(-1), oldest = daysAgo(MAX_BACKFILL_DAYS + 1);
  const since = parsed.data.since ?? daysAgo(Number(process.env.BACKFILL_DAYS ?? DEFAULT_BACKFILL_DAYS));
  if (isNaN(Date.parse(since)) || since > latest || since < oldest)
    return NextResponse.json({ error: `Pick a start date within the last ${MAX_BACKFILL_DAYS} days.` }, { status: 400 });
  const enc = new TextEncoder();
  const alias = new Map<string, string>(); // canon(company) -> company name already in Pinbox

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const token = await accessTokenFor(user.id);
        const ids = await listThreadIds(token, since);

        // Skip threads the user deleted, and threads already processed by an earlier run (no repeat LLM calls, no duplicate actions).
        const [{ data: ignored }, { data: seen }] = await Promise.all([
          supabase.from("ignored_items").select("external_id"),
          supabase.from("events").select("gmail_thread_id").not("gmail_thread_id", "is", null),
        ]);
        const skip = new Set([...(ignored ?? []).map((r) => r.external_id), ...(seen ?? []).map((r) => r.gmail_thread_id)]);
        const todo = ids.filter((id) => !skip.has(id));

        // Companies the user already has, by loose name, so "FTI" and "FTI Consulting" land on one company.
        const { data: known } = await supabase.from("applications").select("company,company_key");
        for (const a of known ?? []) if (!alias.has(canon(a.company))) alias.set(canon(a.company), a.company);

        let scanned = 0, found = 0, failed = 0, fatal: Error | null = null;
        send({ type: "progress", scanned, total: todo.length, found });

        // Classification runs 8 at a time; database writes run one at a time so two emails
        // about the same new company can't both create an application.
        let writes = Promise.resolve();
        const serial = (fn: () => Promise<void>) => (writes = writes.then(fn, fn));

        const queue = [...todo];
        const worker = async () => {
          for (let id = queue.shift(); id && !fatal; id = queue.shift()) {
            try {
              const slim = await fetchSlim(token, id);
              const r = await classify(slim);
              await serial(async () => {
                found += await save(user.id, id, slim.receivedAt, slim.replied, r);
              });
            } catch (e) {
              if (e instanceof ClassifierConfigError) fatal = e;
              else failed++; // skip one bad thread, keep going
            }
            scanned++;
            send({ type: "progress", scanned, total: todo.length, found });
          }
        };
        await Promise.all(Array.from({ length: 8 }, worker));
        await writes;
        if (fatal) throw fatal;
        send({ type: "done", scanned, total: todo.length, found, failed, since });
      } catch (e: any) {
        send({ type: "error", error: e?.message ?? "Backfill failed.", code: e instanceof NoGoogleConnection ? "connect_google" : undefined });
      } finally {
        ctrl.close();
      }
    },
  });

  // Store extracted fields and the thread id only. Never the body.
  async function save(userId: string, threadId: string, receivedAt: string, replied: boolean, r0: Awaited<ReturnType<typeof classify>>): Promise<number> {
    const known = r0.company.trim() ? alias.get(canon(r0.company)) : undefined;
    const r = known ? { ...r0, company: known } : r0;
    const ck = key(r.company);
    const { data: apps } = ck
      ? await supabase.from("applications").select("id,role,role_key,status,deadline,edited_fields").eq("company_key", ck)
      : { data: [] as ExistingApp[] };
    const p = plan(r, (apps ?? []) as ExistingApp[], receivedAt.slice(0, 10), replied);

    if (p.kind === "skip") {
      // Remember the thread so later runs don't pay to classify it again. No fields are kept.
      await supabase.from("events").upsert(
        { user_id: userId, category: "not_recruiting", occurred_at: receivedAt, fields: {}, confidence: r.confidence, gmail_thread_id: threadId },
        { onConflict: "user_id,gmail_thread_id" },
      );
      return 0;
    }

    let appId = p.matchId, created = 0;
    if (p.create) {
      const { data, error } = await supabase.from("applications").insert({ user_id: userId, source: "email", ...p.create }).select("id").single();
      if (error) throw new Error("Couldn't save application");
      appId = data.id; created = 1;
      alias.set(canon(p.create.company), p.create.company);
    } else if (appId && Object.keys(p.update).length) {
      await supabase.from("applications").update(p.update).eq("id", appId);
    }

    await supabase.from("events").upsert({
      user_id: userId, application_id: appId, category: r.category, occurred_at: receivedAt,
      fields: { company: r.company, role: r.role, deadline: r.deadline, event_at: validTime(r.event_at) }, confidence: r.confidence, gmail_thread_id: threadId,
    }, { onConflict: "user_id,gmail_thread_id" });

    if (p.action) await supabase.from("actions").insert({ user_id: userId, application_id: appId, ...p.action });
    return created;
  }

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

// Keep a scheduled time only if it parses; stored as UTC ISO so the home page can compare it with now.
function validTime(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
