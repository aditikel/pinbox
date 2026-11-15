"use server";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase";
import { key } from "@/lib/normalize";

const refresh = () => { revalidatePath("/companies"); revalidatePath("/home"); revalidatePath("/pipeline"); };
const KINDS = ["Coffee chat", "Call", "Email", "Event", "Other"];

export type TouchState = { error?: string; ok?: number };

export async function addTouchpoint(_: TouchState, form: FormData): Promise<TouchState> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Log in again." };

  const company = String(form.get("company") ?? "").trim();
  const person = String(form.get("person") ?? "").trim();
  const happened_on = String(form.get("date") ?? "");
  if (!company || !person || !/^\d{4}-\d{2}-\d{2}$/.test(happened_on)) return { error: "Company, person and date are required." };
  const kind = KINDS.includes(String(form.get("kind"))) ? String(form.get("kind")) : "Coffee chat";

  const { error } = await supabase.from("touchpoints").insert({
    user_id: user.id, company, company_key: key(company), person, kind, happened_on,
    person_role: String(form.get("person_role") ?? "").trim().slice(0, 120),
    notes: String(form.get("notes") ?? "").trim().slice(0, 500),
    referral: form.get("referral") === "on",
  });
  if (error) return { error: error.code === "42P01" ? "Touchpoints need a one-time database update (supabase/migrations/002_companies.sql)." : "Couldn't save. Try again." };
  refresh();
  return { ok: Date.now() };
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
