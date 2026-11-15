import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";
import { Stage } from "@/components/Stage";
import { Sidebar, displayName } from "@/components/Sidebar";
import { buildCompanies, type TouchIn } from "@/lib/companies";
import { CompaniesView } from "./CompaniesView";
import "../app.css";
import "../pipeline/pipeline.css";
import "./companies.css";

export default async function Companies() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [apps, events, touches, favs, actions] = await Promise.all([
    supabase.from("applications").select("id,company,company_key,role,status,created_at"),
    supabase.from("events").select("application_id,category,occurred_at,gmail_thread_id").not("application_id", "is", null),
    supabase.from("touchpoints").select("id,company,company_key,person,person_role,kind,happened_on,notes,referral"),
    supabase.from("company_favorites").select("company_key"),
    supabase.from("actions").select("application_id,due").eq("done", false),
  ]);

  // Touchpoints and favorites need migration 002. Without it the page still works from applications and emails.
  const needsMigration = !!(touches.error || favs.error);
  const companies = buildCompanies(
    apps.data ?? [], events.data ?? [], (touches.data ?? []) as TouchIn[],
    (favs.data ?? []).map((f) => f.company_key), actions.data ?? [],
  );

  return (
    <Stage>
      <Sidebar current="companies" name={displayName(user)} />
      <CompaniesView companies={companies} needsMigration={needsMigration} />
    </Stage>
  );
}
