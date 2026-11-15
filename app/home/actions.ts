"use server";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase";

export async function completeAction(id: string) {
  const supabase = await serverClient();
  await supabase.from("actions").update({ done: true }).eq("id", id); // RLS limits this to the user's own rows
  revalidatePath("/home");
  revalidatePath("/pipeline");
}
