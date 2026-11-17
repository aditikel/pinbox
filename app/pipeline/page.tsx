import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";
import { Stage } from "@/components/Stage";
import { Sidebar, displayName } from "@/components/Sidebar";
import { PipelineView, type Row } from "./PipelineView";
import "../app.css";
import "./pipeline.css";

export default async function Pipeline() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // resume_id needs migration 003 and notes needs 004; fall back to the older columns until they're run.
  // Newest first: that is the table's order (starred rows are a filter, not pinned to the top).
  const appCols = "id,company,role,status,next_action,deadline,starred,created_at";
  const load = (cols: string) => supabase.from("applications").select(cols).order("created_at", { ascending: false });
  let notesReady = true;
  let appsRes = await load(appCols + ",resume_id,notes");
  if (appsRes.error) { notesReady = false; appsRes = await load(appCols + ",resume_id"); }
  if (appsRes.error) appsRes = await load(appCols);
  const apps = (appsRes.data ?? []) as unknown as Array<{ id: string; company: string; role: string; status: string; next_action: string | null; deadline: string | null; starred: boolean; resume_id?: string | null; notes?: string }>;
  const google = (user.identities ?? []).some((i) => i.provider === "google");

  const [{ data: actions }, { data: events }, { data: resumeRows }] = await Promise.all([
    supabase.from("actions").select("application_id,title,due").eq("done", false).order("due", { ascending: true, nullsFirst: false }),
    supabase.from("events").select("application_id,gmail_thread_id,occurred_at").not("application_id", "is", null).not("gmail_thread_id", "is", null).order("occurred_at", { ascending: false }),
    supabase.from("resumes").select("id,label,is_default").order("uploaded_at", { ascending: false }),
  ]);
  const resumes = (resumeRows ?? []).map((r) => ({ id: r.id, label: r.label, isDefault: r.is_default }));

  // Next action / deadline: what the user typed, else the earliest open to-do. Link: the latest Gmail thread.
  const firstAction = new Map<string, { title: string; due: string | null }>();
  for (const a of actions ?? []) if (a.application_id && !firstAction.has(a.application_id)) firstAction.set(a.application_id, a);
  const lastThread = new Map<string, string>();
  for (const e of events ?? []) if (!lastThread.has(e.application_id!)) lastThread.set(e.application_id!, e.gmail_thread_id!);

  const rows: Row[] = apps.map((a) => {
    const act = firstAction.get(a.id);
    return {
      id: a.id, company: a.company, role: a.role, status: a.status, starred: a.starred,
      next_action: a.next_action, deadline: a.deadline,
      shownNext: a.next_action ?? act?.title ?? null,
      shownDue: a.deadline ?? act?.due ?? null,
      thread: lastThread.get(a.id) ?? null,
      resume_id: a.resume_id ?? null,
      notes: a.notes ?? "",
    };
  });

  return (
    <Stage>
      <Sidebar current="pipeline" name={displayName(user)} />
      <PipelineView rows={rows} resumes={resumes} notesReady={notesReady} google={google} />
    </Stage>
  );
}
