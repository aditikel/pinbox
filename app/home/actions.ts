"use server";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase";
import { priorityFor } from "@/lib/ingest";

const refresh = () => { revalidatePath("/home"); revalidatePath("/pipeline"); };

export async function completeAction(id: string) {
  const supabase = await serverClient();
  await supabase.from("actions").update({ done: true }).eq("id", id); // RLS limits this to the user's own rows
  refresh();
}

export type TodoState = { error?: string; ok?: number };

/**
 * Add (no id) or edit (with id) a to-do on the Daily Agenda. Priority "auto" follows the due date;
 * high/med/low is the user's own choice and is kept (priority_manual, migration 004).
 */
export async function saveTodo(_: TodoState, form: FormData): Promise<TodoState> {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Log in again." };

  const id = String(form.get("id") ?? "") || null;
  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const due = String(form.get("due") ?? "");
  const pick = String(form.get("priority") ?? "auto");
  if (!title) return { error: "Write the task first." };
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "Pick a valid due date." };

  const manual = ["high", "med", "low"].includes(pick);
  const priority = manual ? pick : due ? priorityFor(due) : "med";
  const row = { title, due: due || null, priority, priority_manual: manual };

  let { error } = id
    ? await supabase.from("actions").update(row).eq("id", id)
    : await supabase.from("actions").insert({ user_id: user.id, ...row });
  if (error?.code === "42703" || error?.code === "PGRST204") {
    // priority_manual needs migration 004; save without it until then.
    const { priority_manual: _m, ...old } = row;
    ({ error } = id ? await supabase.from("actions").update(old).eq("id", id) : await supabase.from("actions").insert({ user_id: user.id, ...old }));
  }
  if (error) return { error: "Couldn't save. Try again." };
  refresh();
  return { ok: Date.now() };
}

export async function deleteTodo(id: string) {
  const supabase = await serverClient();
  await supabase.from("actions").delete().eq("id", id);
  refresh();
}
