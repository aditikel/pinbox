// Pure rules for turning one classified email into database changes. No I/O here, so it can be unit tested.
import { key } from "./normalize";
import { STATUSES } from "./statuses";

export type Category = "applied" | "oa" | "interview_invite" | "scheduling" | "offer" | "rejection" | "coffee_chat" | "not_recruiting";
export type Classified = { category: Category; company: string; role: string; deadline: string | null; confidence: number; event_at?: string | null };
export type ExistingApp = { id: string; role_key: string; role?: string; status: string; deadline: string | null; edited_fields: string[] };

export const MIN_CONFIDENCE = 0.6;
export const STATUS: Record<string, string> = {
  applied: "Applied", oa: "OA", interview_invite: "Interview", scheduling: "Interview",
  offer: "Offer", rejection: "Rejected", coffee_chat: "Networking",
};
const RANK = ["Networking", "Applied", "OA", "Interview", "Offer"]; // forward only; Rejected always wins

export type Plan =
  | { kind: "skip" }
  | {
      kind: "apply";
      create: null | { company: string; company_key: string; role: string; role_key: string; status: string; deadline: string | null; date_applied: string | null };
      matchId: string | null;
      update: Record<string, string>;
      action: null | { title: string; due: string; priority: "high" };
    };

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Pick the application a new record (email or CSV row) belongs to, within one company:
 * same role; else the one role that contains the other ("dataScienceIntern" vs "dataScienceInternChicagoIl");
 * else the company's only application when the record names no role; else a role-less application.
 */
export function match<T extends { role_key: string }>(apps: T[], roleKey: string): T | null {
  const exact = apps.find((a) => a.role_key === roleKey);
  if (exact) return exact;
  if (roleKey) {
    const near = apps.filter((a) => a.role_key && (a.role_key.includes(roleKey) || roleKey.includes(a.role_key)));
    if (near.length === 1) return near[0];
  }
  if (!roleKey && apps.length === 1) return apps[0];
  if (roleKey) { const blank = apps.find((a) => a.role_key === ""); if (blank) return blank; }
  return null;
}

// ---- CSV import ----

/** CSV status text to a Pinbox status. Exact names first, then common wording ("OA completed", "phone screen", "ghosted"). */
export function csvStatus(s: string): string {
  const t = s.trim().toLowerCase();
  const exact = STATUSES.find((x) => x.toLowerCase() === t);
  if (exact) return exact;
  if (/withdr|declined offer|turned down/.test(t)) return "Withdrawn";
  if (/reject|not moving|no longer|unsuccessful|denied/.test(t)) return "Rejected";
  if (/offer/.test(t)) return "Offer";
  if (/interview|screen|superday|onsite|final round|round \d/.test(t)) return "Interview";
  if (/\boa\b|assessment|hackerrank|codesignal|coding challenge|take.?home|hirevue/.test(t)) return "OA";
  if (/appl|submitted|ghosted|no response|waiting/.test(t)) return "Applied";
  if (/network|coffee|chat|referr|recruit|career fair|info session|reach(ed)? out/.test(t)) return "Networking";
  return "Applied";
}

const TOUCH_KINDS = ["Coffee chat", "Call", "Email", "Event", "Other"];
export function touchKind(s: string): string {
  const t = s.trim().toLowerCase();
  return TOUCH_KINDS.find((k) => k.toLowerCase() === t) ?? (/coffee|chat/.test(t) ? "Coffee chat" : /call|phone|zoom/.test(t) ? "Call" : /mail|linkedin|message/.test(t) ? "Email" : /event|fair|session|meetup/.test(t) ? "Event" : "Other");
}

/** Overdue or due within 2 days: high; within a week: med; later: low. */
export function priorityFor(due: string, today = new Date().toISOString().slice(0, 10)): "high" | "med" | "low" {
  const days = (Date.parse(due) - Date.parse(today)) / 864e5;
  return days <= 2 ? "high" : days <= 7 ? "med" : "low";
}


export type CsvRow = { company: string; role: string; status: string; next_action: string | null; deadline: string | null; date_applied: string | null };
export type MergeTarget = ExistingApp & { role: string; next_action: string | null; date_applied: string | null };
const FINAL = ["Rejected", "Withdrawn"];

/**
 * What a CSV row changes on an application that already exists (usually one the Gmail backfill made).
 * - Fields the user edited in Pinbox (edited_fields) are never touched.
 * - Status: a final status (Rejected/Withdrawn) from either side wins; otherwise the further-along one.
 * - Next action and deadline: the CSV value wins (the user typed it); empty CSV cells keep what's there.
 * - Date applied: the earlier of the two. Role: filled in only when the application has none.
 * Returns the columns to update; edited_fields gains every field the CSV set, so later syncs keep them.
 */
export function mergeCsv(row: CsvRow, app: MergeTarget): Record<string, unknown> {
  const locked = new Set(app.edited_fields ?? []);
  const u: Record<string, unknown> = {};
  const set = (field: string, value: unknown) => { if (!locked.has(field)) u[field] = value; };

  if (row.status !== app.status) {
    const csvFinal = FINAL.includes(row.status), appFinal = FINAL.includes(app.status);
    const csvAhead = csvFinal ? !appFinal : !appFinal && RANK.indexOf(row.status) > RANK.indexOf(app.status);
    if (csvAhead) set("status", row.status);
  }
  if (row.next_action && row.next_action !== app.next_action) set("next_action", row.next_action);
  if (row.deadline && row.deadline !== app.deadline) set("deadline", row.deadline);
  if (row.date_applied && (!app.date_applied || row.date_applied < app.date_applied)) set("date_applied", row.date_applied);
  if (!app.role_key && row.role.trim()) { set("role", row.role.trim()); if ("role" in u) u.role_key = key(row.role); }

  const touched = Object.keys(u).filter((f) => f !== "role_key");
  if (touched.length) u.edited_fields = [...new Set([...(app.edited_fields ?? []), ...touched])];
  return u;
}

/**
 * The classifier sometimes returns an interview stage as the role ("Final Round Interview").
 * Strip stage words; if nothing job-like is left, the email names no role.
 */
export function cleanRole(role: string): string {
  const stage = /\b((first|second|third|final|next|1st|2nd|3rd|\d+(st|nd|rd|th)?)\s+)?((round|stage)\s*\d*\s*)?(interviews?|superday|onsite|on-site|phone screen)\b|\b(round|stage)\s+\d+\b/gi;
  const left = role.replace(stage, " ").replace(/\s+/g, " ").replace(/^[\s\-–—:|,()]+|[\s\-–—:|,()]+$/g, "").trim();
  return /[a-z]{3,}/i.test(left) ? left : "";
}

const FINAL_STATUSES = ["Rejected", "Withdrawn"];
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["intern", "internship", "the", "and"].includes(w)));

/**
 * For follow-up emails (OA, interview, offer, rejection) that don't match a role exactly: pick the application they are
 * most likely about instead of creating a new one. The company's only open application; else the one whose role shares
 * the most words; else the only application. Returns null when it's genuinely ambiguous.
 */
export function followUpMatch(apps: ExistingApp[], role: string): ExistingApp | null {
  if (!apps.length) return null;
  const open = apps.filter((a) => !FINAL_STATUSES.includes(a.status));
  const pool = open.length ? open : apps;
  if (role) {
    const w = words(role);
    const scored = pool.map((a) => ({ a, n: [...words(a.role ?? "")].filter((x) => w.has(x)).length })).sort((x, y) => y.n - x.n);
    if (scored[0].n > 0 && (scored.length === 1 || scored[1].n < scored[0].n)) return scored[0].a;
  }
  return pool.length === 1 ? pool[0] : null;
}

/**
 * apps = this user's applications at the same company.
 * emailDay = YYYY-MM-DD the email was received.
 * replied = whether the student has sent a message in the thread (undefined when unknown).
 */
export function plan(r: Classified, apps: ExistingApp[], emailDay: string, replied?: boolean): Plan {
  if (r.category === "not_recruiting" || r.confidence < MIN_CONFIDENCE || !r.company.trim()) return { kind: "skip" };
  // Networking needs a two-way conversation: one-off outreach (Handshake, LinkedIn, recruiter blasts) the student never answered isn't a touchpoint.
  if (r.category === "coffee_chat" && replied === false) return { kind: "skip" };
  const next = STATUS[r.category];
  const deadline = isDate(r.deadline) && (r.category === "oa" || r.category === "offer") ? r.deadline : null;
  const role = cleanRole(r.role);
  const ck = key(r.company), rk = key(role);
  const followUp = r.category !== "applied" && r.category !== "coffee_chat";
  let existing = match(apps, rk);
  if (!existing && followUp) existing = followUpMatch(apps, role);
  // A follow-up with no role at a company with several open applications: don't invent a new role-less application.
  const ambiguous = !existing && followUp && !role && apps.length > 0;

  const update: Record<string, string> = {};
  if (existing) {
    const locked = new Set(existing.edited_fields ?? []); // user edits win over sync
    const forward = next === "Rejected" ? existing.status !== "Rejected" : RANK.indexOf(next) > RANK.indexOf(existing.status) && existing.status !== "Rejected";
    if (forward && !locked.has("status")) update.status = next;
    if (deadline && deadline !== existing.deadline && !locked.has("deadline")) update.deadline = deadline;
    if (!existing.role_key && rk && !locked.has("role")) { update.role = role; update.role_key = rk; }
  }

  // Rejections never create actions. Actions only when there is a real due date.
  const title = r.category === "oa" ? `Complete ${r.company} OA`
    : r.category === "offer" ? `Respond to ${r.company} offer`
    : r.category === "scheduling" ? `Reply to ${r.company} with availability` : null;
  const due = r.category === "scheduling" ? addDays(emailDay, 1) : deadline;
  const action = title && due ? { title, due, priority: "high" as const } : null;

  return {
    kind: "apply",
    matchId: existing?.id ?? null,
    create: existing || ambiguous ? null : {
      company: r.company.trim(), company_key: ck, role, role_key: rk, status: next, deadline,
      date_applied: next === "Networking" ? null : emailDay,
    },
    update,
    action,
  };
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
