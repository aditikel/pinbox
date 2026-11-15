"use server";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase";
import { key } from "@/lib/normalize";
import { match, mergeCsv, csvStatus, touchKind, priorityFor, type CsvRow, type MergeTarget } from "@/lib/ingest";
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

export type ImportState = { error?: string; added?: number; merged?: number; skipped?: number; todos?: number; touchpoints?: number; note?: string; ok?: number };

/**
 * CSV import: columns are matched by header name (company, role, status, next action, deadline, date applied),
 * plus optional touchpoint columns (last touchpoint, contact, contact role, touchpoint type, referral, notes).
 * Rows that match an application already in Pinbox (from the Gmail backfill or an earlier import) are merged
 * into it with mergeCsv (lib/ingest.ts) instead of being duplicated or skipped.
 * A next action with a deadline becomes a to-do on the Daily Agenda (never for Rejected/Withdrawn), and a
 * last-touchpoint date with a contact becomes a touchpoint on the Companies page. Neither is ever duplicated.
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
  // Exact header names win over partial matches, so "contact role" never steals the "role" column.
  const col = (...names: string[]) => {
    const exact = head.findIndex((h) => names.includes(h));
    if (exact >= 0) return exact;
    const aboutContact = names.some((n) => /contact|touch|person/.test(n));
    return head.findIndex((h) => names.some((n) => h.includes(n)) && (aboutContact || !/contact|touch/.test(h)));
  };
  const ix = {
    company: col("company"), role: col("role", "position", "title"), status: col("status", "stage"), next: col("next action", "next"),
    deadline: col("deadline", "due"), applied: col("date applied", "applied"),
    touch: col("last touchpoint", "touchpoint", "touchpoint date"), person: col("contact", "contact name", "person"),
    personRole: col("contact role", "contact title"), kind: col("touchpoint type", "type", "kind"), referral: col("referral", "referred"), notes: col("notes", "note"),
  };
  if (ix.company < 0) return { error: "No “company” column found in the first row." };

  const { data: existing, error: readError } = await supabase.from("applications")
    .select("id,company_key,role,role_key,status,deadline,next_action,date_applied,edited_fields");
  if (readError) return { error: "Import failed. Couldn't read your pipeline." };
  const byCompany = new Map<string, MergeTarget[]>();
  for (const a of (existing ?? []) as (MergeTarget & { company_key: string })[]) {
    byCompany.set(a.company_key, [...(byCompany.get(a.company_key) ?? []), a]);
  }

  type Extra = { ck: string; target: { role_key: string }; company: string; row: CsvRow;
    touch: null | { person: string; person_role: string; kind: string; happened_on: string; referral: boolean; notes: string } };
  const extras: Extra[] = [];
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
      status: csvStatus(get(ix.status)),
      next_action: get(ix.next) || null, deadline: toDay(get(ix.deadline)), date_applied: toDay(get(ix.applied)),
    };
    const touchDay = toDay(get(ix.touch)), person = get(ix.person);
    const touch = touchDay && person ? {
      person, person_role: get(ix.personRole).slice(0, 120), kind: touchKind(get(ix.kind)), happened_on: touchDay,
      referral: /^(y|yes|true|1|referred)$/i.test(get(ix.referral)), notes: get(ix.notes).slice(0, 2000),
    } : null;

    const target = match(byCompany.get(ck) ?? [], rk);
    extras.push({ ck, target: target ?? { role_key: rk }, company, row, touch });
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

  // Ids for every application this file touched (new rows only get theirs from the database).
  const { data: idRows } = await supabase.from("applications").select("id,company_key,role_key,status");
  const appBy = new Map((idRows ?? []).map((a) => [a.company_key + "|" + a.role_key, a]));

  // To-dos: one open action per application + title.
  let todos = 0;
  const { data: openActs } = await supabase.from("actions").select("application_id,title").eq("done", false);
  const haveAct = new Set((openActs ?? []).map((a) => a.application_id + "|" + a.title.toLowerCase()));
  const newActs = [];
  for (const e of extras) {
    const app = appBy.get(e.ck + "|" + e.target.role_key);
    if (!app || !e.row.next_action || !e.row.deadline || ["Rejected", "Withdrawn"].includes(app.status)) continue;
    const k = app.id + "|" + e.row.next_action.toLowerCase();
    if (haveAct.has(k)) continue;
    haveAct.add(k);
    newActs.push({ user_id: user.id, application_id: app.id, title: e.row.next_action, due: e.row.deadline, priority: priorityFor(e.row.deadline) });
  }
  if (newActs.length) { const { error } = await supabase.from("actions").insert(newActs); if (!error) todos = newActs.length; }

  // Touchpoints: skip ones already recorded (same company, person and day). Needs migration 002.
  let touchpoints = 0, note: string | undefined;
  const wanted = extras.filter((e) => e.touch);
  if (wanted.length) {
    const { data: have, error: tpReadError } = await supabase.from("touchpoints").select("company_key,person,happened_on");
    if (tpReadError) note = "Touchpoints were skipped: run supabase/migrations/002_companies.sql first.";
    else {
      const seenTp = new Set((have ?? []).map((t) => `${t.company_key}|${t.person.toLowerCase()}|${t.happened_on}`));
      const newTps = [];
      for (const e of wanted) {
        const k = `${e.ck}|${e.touch!.person.toLowerCase()}|${e.touch!.happened_on}`;
        if (seenTp.has(k)) continue;
        seenTp.add(k);
        newTps.push({ user_id: user.id, company: e.company, company_key: e.ck, application_id: appBy.get(e.ck + "|" + e.target.role_key)?.id ?? null, ...e.touch! });
      }
      if (newTps.length) { const { error } = await supabase.from("touchpoints").insert(newTps); if (!error) touchpoints = newTps.length; else note = "Touchpoints couldn't be saved."; }
    }
  }

  refresh();
  revalidatePath("/companies");
  return { ok: Date.now(), added, merged, skipped: unchanged, todos, touchpoints, note };
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
