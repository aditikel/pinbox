"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Line = { type: "progress" | "done" | "error"; scanned?: number; total?: number; found?: number; failed?: number; error?: string };

export default function Start() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [pct, setPct] = useState(0);

  async function backfill() {
    setState("running"); setPct(0); setMsg("Searching your inbox for recruiting emails…");
    try {
      const res = await fetch("/api/backfill", { method: "POST" });
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
          if (ev.type === "error") throw new Error(ev.error);
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
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#242124", color: "#feffdc", fontFamily: "'Titillium Web',sans-serif" }}>
      <div style={{ width: 390, textAlign: "center", display: "grid", gap: 14 }}>
        <h1 style={{ font: "600 36px 'Titillium Web'", margin: 0 }}>How would you like to begin?</h1>
        <button disabled={running} onClick={backfill} style={btn}>{running ? "backfilling…" : "backfill gmail*"}</button>
        <small style={{ color: "#e63f6b", textAlign: "left" }}>
          *by pressing this option, you give permission<br />for an LLM to scrape the past 60 days of your inbox
        </small>
        <b style={{ font: "700 32px 'Titillium Web'" }}>or</b>
        <button disabled={running} onClick={() => router.push("/home")} style={btn}>start fresh</button>
        {running && (
          <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ height: 6, borderRadius: 3, background: "#2e2429", overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#d18951", transition: "width .3s" }} />
          </div>
        )}
        {msg && <p role="status" style={{ margin: 0, color: state === "error" ? "#ff7575" : "#feffdc" }}>{msg}</p>}
      </div>
    </main>
  );
}
const btn: React.CSSProperties = { height: 41, border: 0, borderRadius: 8, background: "#a34558", color: "#feffdc", font: "400 24px 'Titillium Web'" };
