import { notFound, redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";
import { Stage } from "@/components/Stage";
import { Sidebar, displayName } from "@/components/Sidebar";
import { ResumeDetail } from "./ResumeDetail";
import "../../app.css";
import "../../pipeline/pipeline.css";
import "../resumes.css";

export default async function Resume({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: r } = await supabase.from("resumes").select("id,label,storage_path,is_default,uploaded_at").eq("id", id).maybeSingle();
  if (!r) notFound();

  // Short-lived links to the private file: one to view inline, one to download with a friendly name.
  const bucket = supabase.storage.from("resumes");
  const [view, download, apps] = await Promise.all([
    bucket.createSignedUrl(r.storage_path, 3600),
    bucket.createSignedUrl(r.storage_path, 3600, { download: `${r.label.replace(/[^\w .-]/g, "")}.pdf` }),
    supabase.from("applications").select("id,company,role,status").eq("resume_id", r.id).order("created_at", { ascending: false }),
  ]);

  return (
    <Stage>
      <Sidebar current="resumes" name={displayName(user)} />
      <ResumeDetail
        id={r.id} label={r.label} isDefault={r.is_default} uploadedAt={r.uploaded_at}
        viewUrl={view.data?.signedUrl ?? null} downloadUrl={download.data?.signedUrl ?? null}
        apps={apps.data ?? []}
      />
    </Stage>
  );
}
