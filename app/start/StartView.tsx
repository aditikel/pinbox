"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_BACKFILL_DAYS, DEFAULT_BACKFILL_DAYS, MAX_THREADS, daysAgo } from "@/lib/backfill";
import { browserClient } from "@/lib/supabase-browser";
import { googleOptions } from "@/lib/google-oauth";
import { importCsv, type ImportState } from "@/app/entries-actions";
import { Stage } from "@/components/Stage";
import "../app.css";
import "../onboard.css";

type Line = { type: "progress" | "done" | "error"; scanned?: number; total?: number; found?: number; failed?: number; error?: string; code?: string };

const PRESETS = [["30 days", 30], ["60 days", 60], ["90 days", 90], ["6 months", 182]] as const;
const pretty = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function StartView({ google }: { google: boolean }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [pct, setPct] = useState(0);
  const [needGoogle, setNeedGoogle] = useState(false);

  // Back from Google with a token that couldn't be saved (see /auth/callback).
  useEffect(() => {
    if (new URLSearchParams(location.search).get("gmail") === "save_failed") {
      setState("error"); setNeedGoogle(true);
      setMsg("Google signed you in, but Pinbox couldn't save Gmail access. Check the server log, then connect Gmail again.");
    }
  }, []);

  // Only Google accounts see the backfill, so reconnecting is just asking Google for consent again.
  async function connectGoogle() {
    const { error } = await browserClient().auth.signInWithOAuth({ provider: "google", options: googleOptions(location.origin) });
    if (error) { setState("error"); setMsg(error.message); }
  }

  // CSV import for accounts without Gmail. Same server action as the pipeline's "Import csv".
  const csvForm = useRef<HTMLFormElement>(null);
  const csvFile = useRef<HTMLInputElement>(null);
  const [csv, csvAction, importing] = useActionState<ImportState, FormData>(importCsv, {});
  useEffect(() => {
    if (csv.error) { setState("error"); setMsg(csv.error); }
    else if (csv.ok) router.push("/pipeline");
  }, [csv, router]);
  const [since, setSince] = useState(() => daysAgo(DEFAULT_BACKFILL_DAYS));
  const today = daysAgo(0), oldest = daysAgo(MAX_BACKFILL_DAYS);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(since) && since >= oldest && since <= today;

  async function backfill() {
    dlg.current?.close();
    setNeedGoogle(false);
    setState("running"); setPct(0); setMsg(`Searching your inbox since ${pretty(since)} for recruiting emails…`);
    try {
      const res = await fetch("/api/backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ since }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Backfill failed.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const l of lines.filter(Boolean)) {
          const ev: Line = JSON.parse(l);
          if (ev.type === "error") { if (ev.code === "connect_google") setNeedGoogle(true); throw new Error(ev.error); }
          if (ev.type === "progress") {
            setPct(ev.total ? Math.round((ev.scanned! / ev.total) * 100) : 100);
            setMsg(ev.total ? `Read ${ev.scanned} of ${ev.total} emails · found ${ev.found} applications` : "No new recruiting emails to read.");
          }
          if (ev.type === "done") { router.push(`/home?found=${ev.found}`); return; }
        }
      }
      throw new Error("Backfill stopped early. Try again; finished emails are kept.");
    } catch (e: any) {
      setState("error"); setMsg(e.message ?? "Backfill failed.");
    }
  }

  const running = state === "running";
  return (
    <Stage>
      <div className="ob">
        <img className="wv" src="/figma/waves.svg" alt="" />
        <img className="lg lg-d" src="/figma/pinbox-logo.svg" alt="Pinbox" />
        <img className="lg lg-l" src="/figma/pinbox-logo-light.svg" alt="Pinbox" />
        <h1 className="t" style={{ left: 689, top: 207, font: "500 36px/1.2 var(--hd)" }}>How would you like to begin?</h1>
        {google ? (
          <>
            <button className="btn" disabled={running} onClick={() => dlg.current?.showModal()} aria-haspopup="dialog" style={{ left: 751, top: 292 }}>{running ? "backfilling…" : "backfill gmail*"}</button>
            <p className="t note" style={{ top: 346 }}>*by pressing this option, you give permission<br />for an LLM to scrape your inbox from a date you choose</p>
          </>
        ) : (
          <form ref={csvForm} action={csvAction}>
            <input ref={csvFile} type="file" name="file" accept=".csv,text/csv" hidden onChange={() => { setMsg(""); setState("idle"); csvForm.current?.requestSubmit(); }} />
            <button type="button" className="btn" disabled={importing} style={{ left: 751, top: 292 }} onClick={() => { if (csvFile.current) { csvFile.current.value = ""; csvFile.current.click(); } }}>
              {importing ? "importing…" : "import csv*"}
            </button>
            <p className="t note" style={{ top: 346 }}>*columns: company (required), role, status, next action,<br />deadline, date applied. Sign in with Google to backfill Gmail.</p>
          </form>
        )}
        <p className="t" style={{ left: 751, width: 390, top: 380, textAlign: "center", font: "500 36px/1.2 var(--hd)" }}>or</p>
        <button className="btn" disabled={running || importing} onClick={() => router.push("/home")} style={{ left: 751, top: 436 }}>start fresh</button>
        {!google && <a className="t" href="/sample-applications.csv" download style={{ left: 751, top: 490, font: "300 15px/1.2 var(--bd)", color: "#d18951" }}>download a sample csv</a>}
        {running && (
          <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ position: "absolute", left: 751, top: 496, width: 390, height: 6, borderRadius: 3, background: "#2e2429", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#d18951", transition: "width .3s" }} />
          </div>
        )}
        {msg && <p role="status" className={`msg ${state === "error" ? "err" : ""}`} style={{ left: 751, top: google ? 512 : 518, width: 390 }}>{msg}</p>}
        {google && needGoogle && <button className="btn dk" onClick={connectGoogle} style={{ left: 751, top: 580, border: "1px solid #a34558" }}>reconnect gmail</button>}
      </div>

      <dialog ref={dlg} aria-labelledby="bf-title" style={box}>
        <style>{`dialog::backdrop{background:#000a} :root:not([data-theme="light"]) .bf-date::-webkit-calendar-picker-indicator{filter:invert(1)}`}</style>
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (valid) backfill(); }} style={{ display: "grid", gap: 12 }}>
          <h2 id="bf-title" style={{ font: "500 26px Tomorrow,sans-serif", margin: 0 }}>Backfill from when?</h2>
          <p style={{ margin: 0, fontSize: 15 }}>Pinbox reads recruiting emails from this date up to today.</p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Quick picks">
            {PRESETS.map(([label, n]) => {
              const d = daysAgo(n), on = d === since;
              return (
                <button key={label} type="button" aria-pressed={on} onClick={() => setSince(d)}
                  style={{ ...chip, background: on ? "#a34558" : "var(--pn2)", color: on ? "#feffdc" : "var(--tx)" }}>{label}</button>
              );
            })}
          </div>

          <label style={{ display: "grid", gap: 4, color: "#e63f6b", fontSize: 14, textAlign: "left" }}>
            start date
            <input className="bf-date" type="date" required value={since} min={oldest} max={today} onChange={(e) => setSince(e.target.value)}
              style={{ height: 38, padding: "0 10px", borderRadius: 8, border: "1px solid #a34558", background: "var(--pn2)", color: "var(--tx)", font: "300 16px Sunflower,sans-serif" }} />
          </label>

          <small style={{ color: valid ? "#e63f6b" : "#ff7575", textAlign: "left", lineHeight: 1.35 }}>
            {valid
              ? <>By starting, you give permission for an LLM to read recruiting emails from {pretty(since)} to today. Up to {MAX_THREADS} threads are read; only extracted fields are saved, never email bodies.</>
              : <>Pick a date between {pretty(oldest)} and today.</>}
          </small>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => dlg.current?.close()} style={{ ...small, background: "var(--pn2)", color: "var(--tx)" }}>cancel</button>
            <button type="submit" disabled={!valid} style={{ ...small, opacity: valid ? 1 : 0.5 }}>start backfill</button>
          </div>
        </form>
      </dialog>
    </Stage>
  );
}
const box: React.CSSProperties = { width: 400, padding: 24, background: "var(--pn)", color: "var(--tx)", border: "2px solid #a34558", borderRadius: 12, fontFamily: "Sunflower,sans-serif" };
const chip: React.CSSProperties = { border: 0, borderRadius: 20, padding: "5px 14px", font: "400 14px Tomorrow,sans-serif", cursor: "pointer" };
const small: React.CSSProperties = { height: 32, border: 0, borderRadius: 16, padding: "0 18px", background: "#a34558", color: "#feffdc", font: "300 16px Sunflower,sans-serif", cursor: "pointer" };
