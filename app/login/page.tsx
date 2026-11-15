"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase-browser";
import "./login.css";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = browserClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email, password,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
          });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up") return setMsg("Check your email to confirm your account, then log in.");
    router.push("/start");
    router.refresh();
  }

  async function google() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: SCOPES,
        // offline + consent make Google return a refresh token for background sync;
        // select_account always shows the account picker so users can switch Gmail accounts
        queryParams: { access_type: "offline", prompt: "select_account consent" },
      },
    });
    if (error) { setBusy(false); setMsg(error.message); }
  }

  return (
    <main className="auth">
      <img className="logo" src="/pinbox-logo.png" alt="Pinbox" />
      <form className="box" onSubmit={submit}>
        <div className="seg">
          <button type="button" className={mode === "in" ? "on" : ""} onClick={() => setMode("in")}>log in</button>
          <button type="button" className={mode === "up" ? "on" : ""} onClick={() => setMode("up")}>sign up</button>
        </div>
        <h1>Welcome to Pinbox!</h1>
        <p>Log in or sign up to begin.</p>
        <label htmlFor="em">email</label>
        <input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="pw">password</label>
        <input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="button" className="fg" onClick={async () => {
          if (!email) return setMsg("Enter your email first.");
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` });
          setMsg(error ? error.message : "Password reset email sent.");
        }}>forgot password?</button>
        <button className="ct" disabled={busy}>continue</button>
        <div className="or"><span>or sign in with</span></div>
        <button type="button" className="gb" onClick={google} disabled={busy}>
          <img src="/google-g.png" alt="" width={26} height={26} /> Google
        </button>
        {msg && <p role="status" className="msg">{msg}</p>}
      </form>
    </main>
  );
}
