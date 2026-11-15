"use server";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase";
import { key } from "@/lib/normalize";
import { match, mergeCsv, type CsvRow, type MergeTarget } from "@/lib/ingest";
import { STATUSES } from "@/lib/statuses";

export type EntryState = { error?: string; ok?: number };

const refresh = () => { revalidatePath("/home"); revalidatePath("/pipeline"); };
const dupMsg = (company: string, role: string) => `${company}${role ? ` · ${role}` : ""} is already in your pipeline.`;

/**
 * Add (no id) or edit (with id) an application from the Add/Edit entry dialog.
 * Every field the user sets is recorded in edited_fields, so sync never overwrites it.
 */
export async function saveEntry(_: EntryState, form: FormData): Promise<EntryState> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Log in again." };

  const id = String(form.get("id") ?? "") || null;
  const company = String(form.get("company") ?? "").trim();
  const role = String(form.get("role") ?? "").trim();
  const status = (STATUSES as readonly string[]).includes(String(form.get("status"))) ? String(form.get("status")) : "Applied";
  const next = String(form.get("next") ?? "").trim() || null;
  const deadline = String(form.get("deadline") ?? "") || null;
  if (!company) return { error: "Company is required." };

  const fields: Record<string, string | null> = { company, company_key: key(company), role, role_key: key(role), status, next_action: next, deadline };
  // Only sent when the user has resumes (the dialog hides the field otherwise). Empty = use the default resume.
  if (form.has("resume")) fields.resume_id = String(form.get("resume")) || null;
  let appId = id;

  if (id) {
    const { data: before } = await supabase.from("applications").select("company,role,status,next_action,deadline,edited_fields").eq("id", id).single<Record<string, any>>();
    if (!before) return { error: "That entry no longer exists." };
    const changed = ["company", "role", "status", "next_action", "deadline"].filter((f) => (before[f] ?? null) !== (fields[f] || null));
    const edited = [...new Set([...((before.edited_fields as string[]) ?? []), ...changed])];
    const { error } = await supabase.from("applications").update({ ...fields, edited_fields: edited }).eq("id", id);
    if (error) return { error: error.code === "23505" ? dupMsg(company, role) : "Couldn't save. Try again." };
  } else {
    const edited = ["company", "role", "status", next && "next_action", deadline && "deadline"].filter(Boolean) as string[];
    const { data, error } = await supabase.from("applications").insert({
      user_id: user.id, ...fields, source: "manual", edited_fields: edited,
      date_applied: status === "Networking" ? null : new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (error) return { error: error.code === "23505" ? dupMsg(company, role) : "Couldn't save. Try again." };
    appId = data.id;
  }

  // A next action with a deadline goes on the agenda (once). Rejections never create actions.
  if (appId && next && deadline && status !== "Rejected") {
    const { data: open } = await supabase.from("actions").select("id").eq("application_id", appId).eq("title", next).eq("done", false).limit(1);
    if (!open?.length) await supabase.from("actions").insert({ user_id: user.id, application_id: appId, title: next, due: deadline, priority: "med" });
  }
  refresh();
  return { ok: Date.now() };
}

export async function setStar(id: string, starred: boolean) {
  const supabase = await serverClient();
  await supabase.from("applications").update({ starred }).eq("id", id);
  refresh();
}

/** Delete an application. Its Gmail threads go on the ignore list so sync never brings it back. */
export async function deleteEntry(id: string) {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: evs } = await supabase.from("events").select("gmail_thread_id").eq("application_id", id).not("gmail_thread_id", "is", null);
  const ignore = (evs ?? []).map((e) => ({ user_id: user.id, external_id: e.gmail_thread_id as string }));
  if (ignore.length) await supabase.from("ignored_items").upsert(ignore, { onConflict: "user_id,external_id", ignoreDuplicates: true });
  await supabase.from("applications").delete().eq("id", id); // events and actions cascade
  refresh();
}

export type ImportState = { error?: string; added?: number; merged?: number; skipped?: number; ok?: number };

/**
 * CSV import: columns are matched by header name (company, role, status, next action, deadline, date applied).
 * Rows that match an application already in Pinbox (from the Gmail backfill or an earlier import) are merged
 * into it with mergeCsv (lib/ingest.ts) instead of being duplicated or skipped.
 */
export async function importCsv(_: ImportState, form: FormData): Promise<ImportState> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Log in again." };
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a .csv file." };
  if (file.size > 2_000_000) return { error: "That file is over 2 MB." };

  const rows = parseCsv(await file.text());
  const head = (rows.shift() ?? []).map((h) => h.toLowerCase().trim());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const ix = { company: col("company"), role: col("role", "position", "title"), status: col("status", "stage"), next: col("next"), deadline: col("deadline", "due"), applied: col("applied", "date") };
  if (ix.company < 0) return { error: "No “company” column found in the first row." };

  const { data: existing, error: readError } = await supabase.from("applications")
    .select("id,company_key,role,role_key,status,deadline,next_action,date_applied,edited_fields");
  if (readError) return { error: "Import failed. Couldn't read your pipeline." };
  const byCompany = new Map<string, MergeTarget[]>();
  for (const a of (existing ?? []) as (MergeTarget & { company_key: string })[]) {
    byCompany.set(a.company_key, [...(byCompany.get(a.company_key) ?? []), a]);
  }

  const seen = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; u: Record<string, unknown> }[] = [];
  let unchanged = 0;
  for (const r of rows) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const company = get(ix.company), role = get(ix.role);
    if (!company) continue;
    const ck = key(company), rk = key(role);
    if (seen.has(ck + "|" + rk)) { unchanged++; continue; } // repeated row in the same file
    seen.add(ck + "|" + rk);
    const row: CsvRow = {
      company, role,
      status: STATUSES.find((s) => s.toLowerCase() === get(ix.status).toLowerCase()) ?? (/interview/i.test(get(ix.status)) ? "Interview" : "Applied"),
      next_action: get(ix.next) || null, deadline: toDay(get(ix.deadline)), date_applied: toDay(get(ix.applied)),
    };

    const target = match(byCompany.get(ck) ?? [], rk);
    if (target) {
      const u = mergeCsv(row, target);
      Object.assign(target, u); // keeps later rows in this file merging against the latest values
      if (target.id && Object.keys(u).length) updates.push({ id: target.id, u });
      else unchanged++; // nothing new, or folded into a row this same file is adding
      continue;
    }
    const created = {
      user_id: user.id, company, company_key: ck, role, role_key: rk, status: row.status, next_action: row.next_action,
      deadline: row.deadline, date_applied: row.date_applied, source: "csv",
      edited_fields: ["company", "role", "status", row.next_action && "next_action", row.deadline && "deadline"].filter(Boolean) as string[],
    };
    inserts.push(created);
    // Later rows for the same company can merge into this one instead of creating a near-duplicate.
    byCompany.set(ck, [...(byCompany.get(ck) ?? []), created as unknown as MergeTarget]); // no id yet: merges edit the insert itself
  }

  let added = 0;
  if (inserts.length) {
    const { data, error } = await supabase.from("applications")
      .upsert(inserts, { onConflict: "user_id,company_key,role_key", ignoreDuplicates: true }).select("id");
    if (error) return { error: "Import failed. Check the file and try again." };
    added = data?.length ?? 0;
    unchanged += inserts.length - added;
  }
  let merged = 0;
  for (const { id, u } of updates) {
    const { error } = await supabase.from("applications").update(u).eq("id", id);
    if (!error) merged++;
  }
  refresh();
  return { ok: Date.now(), added, merged, skipped: unchanged };
}

function toDay(s: string): string | null {
  if (!s || !/\d/.test(s)) return null; // a date needs at least a day number ("garbage" would otherwise parse as Jan 1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const withYear = /\d{4}/.test(s) ? s : `${s} ${new Date().getFullYear()}`;
  const d = new Date(withYear);
  return isNaN(+d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Small RFC 4180 parser: quoted fields, escaped quotes, commas and newlines inside quotes.
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some((x) => x.trim())) out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) out.push(row);
  return out;
}
