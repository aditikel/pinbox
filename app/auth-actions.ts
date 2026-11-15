"use server";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";

export async function signOut() {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect("/login");
}
