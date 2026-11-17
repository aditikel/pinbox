"use server";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase";
import { key } from "@/lib/normalize";

const refresh = () => { revalidatePath("/companies"); revalidatePath("/home"); revalidatePath("/pipeline"); };
const KINDS = ["Coffee chat", "Call", "Email", "Event"];
const missingColumn = (code?: string) => code === "42703" || code === "PGRST204";

export type TouchState = { error?: string; ok?: number };

/** Add (no id) or edit (with id) a touchpoint. Type "Other" takes the user's own words. */
export async function saveTouchpoint(_: TouchState, form: FormData): Promise<TouchState> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Log in again." };

  const id = String(form.get("id") ?? "") || null;
  const company = String(form.get("company") ?? "").trim();
  const person = String(form.get("person") ?? "").trim();
  const happened_on = String(form.get("date") ?? "");
  if (!company || !person || !/^\d{4}-\d{2}-\d{2}$/.test(happened_on)) return { error: "Company, person and date are required." };
  const picked = String(form.get("kind") ?? "");
  const other = String(form.get("kind_other") ?? "").trim().slice(0, 40);
  const kind = KINDS.includes(picked) ? picked : other || "Other";

  const row = {
    company, company_key: key(company), person, kind, happened_on,
    person_role: String(form.get("person_role") ?? "").trim().slice(0, 120),
    notes: String(form.get("notes") ?? "").trim().slice(0, 2000),
    referral: form.get("referral") === "on",
    contact: String(form.get("contact") ?? "").trim().slice(0, 200),
  };
  const write = (r: Partial<typeof row>) => id
    ? supabase.from("touchpoints").update(r).eq("id", id)
    : supabase.from("touchpoints").insert({ user_id: user.id, ...r });

  let { error } = await write(row);
  if (missingColumn(error?.code)) {
    // Contact info needs migration 004. Save the rest until then.
    const { contact: _c, ...old } = row;
    ({ error } = await write(old));
  }
  if (error) return { error: error.code === "42P01" ? "Touchpoints need a one-time database update (supabase/migrations/002_companies.sql)." : "Couldn't save. Try again." };
  refresh();
  return { ok: Date.now() };
}

export async function deleteTouchpoint(id: string) {
  const supabase = await serverClient();
  await supabase.from("touchpoints").delete().eq("id", id);
  refresh();
}

export type CompanyState = { error?: string; note?: string; ok?: number };

/**
 * Edit company info: rename the company (moves its applications and touchpoints; renaming to a company that
 * already exists merges the two, e.g. "FTI" into "FTI Consulting"), and edit each contact's name, role and contact info.
 * form: key (current company_key), name, contacts (JSON [{old, name, role, contact}]).
 */
export async function updateCompany(_: CompanyState, form: FormData): Promise<CompanyState> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Log in again." };

  const oldKey = String(form.get("key") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const newKey = key(name);
  if (!oldKey || !name || !newKey) return { error: "Company name is required." };
  let contacts: { old: string; name: string; role: string; contact: string }[] = [];
  try { contacts = JSON.parse(String(form.get("contacts") ?? "[]")); } catch { return { error: "Couldn't read the contacts. Try again." }; }

  // 1. Rename / merge. Applications move one by one: if the other company already has the same role, that one stays.
  let kept = 0;
  const { data: apps } = await supabase.from("applications").select("id,edited_fields").eq("company_key", oldKey);
  for (const a of apps ?? []) {
    const edited = [...new Set([...((a.edited_fields as string[]) ?? []), "company"])];
    const { error } = await supabase.from("applications").update({ company: name, company_key: newKey, edited_fields: edited }).eq("id", a.id);
    if (error?.code === "23505") kept++;
    else if (error) return { error: "Couldn't rename. Try again." };
  }
  await supabase.from("touchpoints").update({ company: name, company_key: newKey }).eq("company_key", oldKey);
  if (newKey !== oldKey) {
    const { data: fav } = await supabase.from("company_favorites").select("company_key").eq("company_key", oldKey);
    if (fav?.length) {
      await supabase.from("company_favorites").upsert({ user_id: user.id, company_key: newKey }, { ignoreDuplicates: true });
      await supabase.from("company_favorites").delete().eq("company_key", oldKey);
    }
  }

  // 2. Contacts live on touchpoints: update every touchpoint with that person at this company.
  for (const c of contacts) {
    const person = String(c.name ?? "").trim().slice(0, 120);
    if (!person || !c.old) continue;
    const u = { person, person_role: String(c.role ?? "").trim().slice(0, 120), contact: String(c.contact ?? "").trim().slice(0, 200) };
    const target = () => supabase.from("touchpoints").update(u).eq("company_key", newKey).ilike("person", c.old.replace(/[\\%_]/g, "\\$&"));
    const { error } = await target();
    if (missingColumn(error?.code)) {
      const { contact: _c, ...old } = u;
      await supabase.from("touchpoints").update(old).eq("company_key", newKey).ilike("person", c.old.replace(/[\\%_]/g, "\\$&"));
    }
  }

  refresh();
  return { ok: Date.now(), note: kept ? `${kept} role(s) already existed at ${name}, so those stayed under the old name.` : undefined };
}

export async function setFavorite(companyKey: string, favorite: boolean) {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  if (favorite) await supabase.from("company_favorites").upsert({ user_id: user.id, company_key: companyKey }, { ignoreDuplicates: true });
  else await supabase.from("company_favorites").delete().eq("company_key", companyKey);
  refresh();
}

/** Delete a company: its applications (and their emails go on the ignore list), touchpoints and favorite. */
export async function deleteCompany(companyKey: string) {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: apps } = await supabase.from("applications").select("id").eq("company_key", companyKey);
  const ids = (apps ?? []).map((a) => a.id);
  if (ids.length) {
    const { data: evs } = await supabase.from("events").select("gmail_thread_id").in("application_id", ids).not("gmail_thread_id", "is", null);
    const ignore = (evs ?? []).map((e) => ({ user_id: user.id, external_id: e.gmail_thread_id as string }));
    if (ignore.length) await supabase.from("ignored_items").upsert(ignore, { onConflict: "user_id,external_id", ignoreDuplicates: true });
    await supabase.from("applications").delete().in("id", ids);
  }
  await supabase.from("touchpoints").delete().eq("company_key", companyKey);
  await supabase.from("company_favorites").delete().eq("company_key", companyKey);
  refresh();
}
