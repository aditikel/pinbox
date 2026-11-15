// Pure rules for turning one classified email into database changes. No I/O here, so it can be unit tested.
import { key } from "./normalize";

export type Category = "applied" | "oa" | "interview_invite" | "scheduling" | "offer" | "rejection" | "coffee_chat" | "not_recruiting";
export type Classified = { category: Category; company: string; role: string; deadline: string | null; confidence: number };
export type ExistingApp = { id: string; role_key: string; status: string; deadline: string | null; edited_fields: string[] };

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

/** Pick the application this email belongs to: same company and role, or the company's only application when the email names no role. */
export function match(apps: ExistingApp[], roleKey: string): ExistingApp | null {
  const exact = apps.find((a) => a.role_key === roleKey);
  if (exact) return exact;
  if (!roleKey && apps.length === 1) return apps[0];
  if (roleKey) { const blank = apps.find((a) => a.role_key === ""); if (blank) return blank; }
  return null;
}

/**
 * apps = this user's applications at the same company_key.
 * emailDay = YYYY-MM-DD the email was received.
 */
export function plan(r: Classified, apps: ExistingApp[], emailDay: string): Plan {
  if (r.category === "not_recruiting" || r.confidence < MIN_CONFIDENCE || !r.company.trim()) return { kind: "skip" };
  const next = STATUS[r.category];
  const deadline = isDate(r.deadline) && (r.category === "oa" || r.category === "offer") ? r.deadline : null;
  const ck = key(r.company), rk = key(r.role);
  const existing = match(apps, rk);

  const update: Record<string, string> = {};
  if (existing) {
    const locked = new Set(existing.edited_fields ?? []); // user edits win over sync
    const forward = next === "Rejected" ? existing.status !== "Rejected" : RANK.indexOf(next) > RANK.indexOf(existing.status) && existing.status !== "Rejected";
    if (forward && !locked.has("status")) update.status = next;
    if (deadline && deadline !== existing.deadline && !locked.has("deadline")) update.deadline = deadline;
    if (!existing.role_key && rk && !locked.has("role")) { update.role = r.role.trim(); update.role_key = rk; }
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
    create: existing ? null : {
      company: r.company.trim(), company_key: ck, role: r.role.trim(), role_key: rk, status: next, deadline,
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
