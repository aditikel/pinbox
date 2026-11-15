import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";
import { Stage } from "@/components/Stage";
import { Sidebar, displayName } from "@/components/Sidebar";
import { ResumesView, type ResumeCard } from "./ResumesView";
import "../app.css";
import "../pipeline/pipeline.css";
import "./resumes.css";

export default async function Resumes() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [res, apps] = await Promise.all([
    supabase.from("resumes").select("id,label,is_default,uploaded_at").order("uploaded_at", { ascending: false }),
    supabase.from("applications").select("resume_id"),
  ]);
  const needsMigration = !!res.error || !!apps.error;

  // Applications with no resume chosen use the default one.
  const unassigned = (apps.data ?? []).filter((a) => !a.resume_id).length;
  const cards: ResumeCard[] = (res.data ?? []).map((r) => ({
    id: r.id, label: r.label, isDefault: r.is_default, uploadedAt: r.uploaded_at,
    apps: (apps.data ?? []).filter((a) => a.resume_id === r.id).length + (r.is_default ? unassigned : 0),
  }));

  return (
    <Stage>
      <Sidebar current="resumes" name={displayName(user)} />
      <ResumesView resumes={cards} owner={displayName(user)} needsMigration={needsMigration} />
    </Stage>
  );
}
