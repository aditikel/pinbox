import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";
import { StartView } from "./StartView";

// Gmail backfill is only offered to people who signed in with Google; email/password accounts get CSV import or start fresh.
export default async function Start() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const google = (user.identities ?? []).some((i) => i.provider === "google");
  return <StartView google={google} />;
}
