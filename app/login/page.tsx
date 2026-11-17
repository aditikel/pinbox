"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase-browser";
import { googleOptions } from "@/lib/google-oauth";
import { Stage } from "@/components/Stage";
import "../app.css";
import "../onboard.css";
import "./login.css";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = browserClient();

  // Google sign-in sets busy and leaves the page; if the user comes back with
  // the browser's Back button, the page is restored from the back/forward cache
  // with busy still true, which leaves both buttons disabled. Reset it.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) setBusy(false); };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

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
      options: googleOptions(location.origin),
    });
    if (error) { setBusy(false); setMsg(error.message); }
  }

  return (
    <Stage>
      <div className="ob">
        <img className="wv" src="/figma/waves.svg" alt="" />
        <img className="lg lg-d" src="/figma/pinbox-logo.svg" alt="Pinbox" />
        <img className="lg lg-l" src="/figma/pinbox-logo-light.svg" alt="Pinbox" />
        <form className="card" onSubmit={submit}>
          <div className="seg" role="group" aria-label="Log in or sign up">
            <button type="button" className={mode === "in" ? "on" : ""} aria-pressed={mode === "in"} onClick={() => setMode("in")}>log in</button>
            <button type="button" className={mode === "up" ? "on" : ""} aria-pressed={mode === "up"} onClick={() => setMode("up")}>sign up</button>
          </div>
          <h1 className="t" style={{ left: 777, top: 203, font: "500 36px/1.2 var(--bd)" }}>Welcome to Pinbox!</h1>
          <p className="t" style={{ left: 777, top: 253, font: "300 24px/1.2 var(--bd)" }}>Log in or sign up to begin.</p>
          <label className="t lbl" htmlFor="em" style={{ top: 293 }}>email</label>
          <input className="fld" id="em" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ top: 323 }} />
          <label className="t lbl" htmlFor="pw" style={{ top: 386 }}>password</label>
          <input className="fld" id="pw" type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} style={{ top: 416 }} />
          <button type="button" className="fg" onClick={async () => {
            if (!email) return setMsg("Enter your email first.");
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback` });
            setMsg(error ? error.message : "Password reset email sent.");
          }}>forgot password?</button>
          <button className="btn" disabled={busy} style={{ left: 777, top: 509 }}>continue</button>
          <div className="or"><span>or sign in with</span></div>
          <button type="button" className="btn dk" onClick={google} disabled={busy} style={{ left: 777, top: 594, fontSize: 16 }}>
            <img src="/figma/google-g.png" alt="" width={28} height={28} /> Google
          </button>
          {msg && <p role="status" className="msg" style={{ left: 777, top: 652, width: 390 }}>{msg}</p>}
        </form>
      </div>
    </Stage>
  );
}
