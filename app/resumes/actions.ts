"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";

const refresh = () => { revalidatePath("/resumes", "layout"); revalidatePath("/pipeline"); };

/** Called after the browser has uploaded the PDF to storage. Records it in the library. */
export async function createResume(input: { path: string; label: string; size: number }): Promise<{ error?: string; id?: string }> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Log in again." };
  if (!input.path.startsWith(`${user.id}/`) || !input.path.endsWith(".pdf")) return { error: "Upload failed. Try again." };

  const label = input.label.trim().slice(0, 80) || "Resume";
  const { count } = await supabase.from("resumes").select("id", { count: "exact", head: true });
  const { data, error } = await supabase.from("resumes")
    .insert({ user_id: user.id, label, storage_path: input.path, size_bytes: input.size, is_default: !count }) // the first resume becomes the default
    .select("id").single();
  if (error) {
    await supabase.storage.from("resumes").remove([input.path]);
    return { error: "Couldn't save the resume. Try again." };
  }
  refresh();
  return { id: data.id };
}

export async function setDefaultResume(id: string) {
  const supabase = await serverClient();
  await supabase.from("resumes").update({ is_default: false }).eq("is_default", true);
  await supabase.from("resumes").update({ is_default: true }).eq("id", id);
  refresh();
}

export async function renameResume(id: string, label: string) {
  const clean = label.trim().slice(0, 80);
  if (!clean) return;
  const supabase = await serverClient();
  await supabase.from("resumes").update({ label: clean }).eq("id", id);
  refresh();
}

/** Deletes the file and the record. Applications that used it are left with no resume (resume_id set null). */
export async function deleteResume(id: string, thenGoBack = false) {
  const supabase = await serverClient();
  const { data: r } = await supabase.from("resumes").select("storage_path,is_default").eq("id", id).single();
  if (r) {
    await supabase.storage.from("resumes").remove([r.storage_path]);
    await supabase.from("resumes").delete().eq("id", id);
    if (r.is_default) { // keep a default: the most recently uploaded one
      const { data: next } = await supabase.from("resumes").select("id").order("uploaded_at", { ascending: false }).limit(1);
      if (next?.[0]) await supabase.from("resumes").update({ is_default: true }).eq("id", next[0].id);
    }
  }
  refresh();
  if (thenGoBack) redirect("/resumes");
}
