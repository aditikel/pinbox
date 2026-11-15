import { NextResponse } from "next/server";
import { serverClient, adminClient } from "@/lib/supabase";
import { encrypt } from "@/lib/crypto";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect(`${origin}/login`);

  const supabase = await serverClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return NextResponse.redirect(`${origin}/login?error=auth`);

  // Google only returns the refresh token on this first exchange. Save it encrypted.
  const refresh = data.session.provider_refresh_token;
  if (refresh) {
    try {
      const { error: saveError } = await adminClient().from("google_tokens").upsert({
        user_id: data.session.user.id,
        refresh_token_enc: encrypt(refresh),
        updated_at: new Date().toISOString(),
      });
      if (saveError) throw new Error(saveError.message);
    } catch (e: any) {
      // Never log the token itself. A failed save would otherwise only show up later as "Gmail isn't connected".
      console.error("google_tokens save failed:", e?.message);
      return NextResponse.redirect(`${origin}/start?gmail=save_failed`);
    }
  }
  return NextResponse.redirect(`${origin}/start`);
}
