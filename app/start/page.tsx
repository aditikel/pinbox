import { redirect } from "next/navigation";
import { serverClient, adminClient } from "@/lib/supabase";
import { StartView } from "./StartView";

// Gmail backfill is only offered to people who signed in with Google; email/password accounts get CSV import or start fresh.
export default async function Start() {
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const google = (user.identities ?? []).some((i) => i.provider === "google");
  // Google login only asks for name and email; Gmail access is a separate consent on this page.
  // google_tokens is service-role only, so check it with the admin client (existence only, never the token).
  const { data: token } = google
    ? await adminClient().from("google_tokens").select("user_id").eq("user_id", user.id).maybeSingle()
    : { data: null };
  return <StartView google={google} connected={!!token} />;
}
