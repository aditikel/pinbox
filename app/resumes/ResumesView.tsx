"use client";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { browserClient } from "@/lib/supabase-browser";
import { createResume, deleteResume, setDefaultResume } from "./actions";

export type ResumeCard = { id: string; label: string; isDefault: boolean; uploadedAt: string; apps: number };

const MAX = 5 * 1024 * 1024;
const COL = ["#a34558", "#d18951", "#6f9a36", "#c9803f"];
const updated = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
// Card position inside the scrolling gallery: 3 per row, 320px apart, rows 246px apart (from the design).
const pos = (k: number) => ({ left: (k % 3) * 320, top: Math.floor(k / 3) * 246 });

export function ResumesView({ resumes, owner, needsMigration }: { resumes: ResumeCard[]; owner: string; needsMigration: boolean }) {
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const file = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const shown = useMemo(() => resumes.filter((r) => r.label.toLowerCase().includes(q.trim().toLowerCase())), [resumes, q]);

  async function upload(f: File) {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) return setStatus("Only PDF files can be uploaded.");
    if (f.size > MAX) return setStatus("That PDF is over 5 MB.");
    setBusy(true); setStatus(`Uploading ${f.name}…`);
    try {
      const sb = browserClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("You're signed out. Log in again.");
      // Straight from the browser to the private bucket, into the user's own folder.
      const path = `${user.id}/${crypto.randomUUID()}.pdf`;
      const { error } = await sb.storage.from("resumes").upload(path, f, { contentType: "application/pdf" });
      if (error) throw new Error("Upload failed. Try again.");
      const res = await createResume({ path, label: f.name.replace(/\.pdf$/i, ""), size: f.size });
      if (res.error) throw new Error(res.error);
      setStatus(""); router.refresh();
    } catch (e: any) {
      setStatus(e.message);
    } finally {
      setBusy(false);
    }
  }
  const pick = () => { if (file.current) { file.current.value = ""; file.current.click(); } };

  return (
    <div onClick={() => setMenu(null)}>
      <h1 className="big" style={{ left: 283, top: 46, fontSize: 48 }}>RESUMES</h1>
      <input className="sr" placeholder="Search resumes..." aria-label="Search resumes" value={q} onChange={(e) => setQ(e.target.value)}
        style={{ left: 283, top: 117, width: 497, height: 44, borderRadius: 22, fontSize: 15, paddingLeft: 51 }} />
      <span className="sri" style={{ left: 301, top: 131 }}><Icon name="search" /></span>
      <button className="pill rs-up" disabled={busy || needsMigration} onClick={pick}>+&nbsp;&nbsp;Upload resume</button>
      <input ref={file} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

      <div className="a hd rs-h">YOUR RESUMES</div>
      {(status || needsMigration) && (
        <p className="rs-status" role="status">
          {needsMigration ? <>Resumes need a one-time database update: <code>supabase/migrations/003_resumes.sql</code>.</> : status}
        </p>
      )}

      <div className="a rs-gal">
        <div style={{ position: "relative", height: Math.ceil((shown.length + 1) / 3) * 246 }}>
          {shown.map((r, k) => (
            <div key={r.id} className={`rcd ${r.isDefault ? "def" : ""}`} style={pos(k)}>
              <Link href={`/resumes/${r.id}`} className="rcd-link" aria-label={`Open ${r.label}`} />
              <div className="tp">
                <div className="pg" aria-hidden="true">
                  <b>{owner}</b>
                  <i style={{ top: 31, width: 40, background: COL[k % 4] }} /><i style={{ top: 32, left: 58, width: 89, height: 3 }} />
                  {[[28, 47, 5, 1], [138, 58], [124, 67], [138, 76], [98, 85], [65, 106, 5, 1], [138, 117], [122, 125], [138, 133], [110, 141]].map(([w, t, h, dk], j) => (
                    <i key={j} style={{ top: t, width: w, height: h ?? 4, background: dk ? "#4a3d44" : undefined }} />
                  ))}
                </div>
                {r.isDefault && <span className="df">DEFAULT</span>}
                <button className="mn" aria-label={`Options for ${r.label}`} aria-expanded={menu === r.id} onClick={(e) => { e.stopPropagation(); setMenu(menu === r.id ? null : r.id); }}>···</button>
                {menu === r.id && (
                  <div className="rs-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                    {!r.isDefault && <button role="menuitem" onClick={() => { setMenu(null); startTransition(() => setDefaultResume(r.id)); }}>Make default</button>}
                    <Link role="menuitem" href={`/resumes/${r.id}`}>Open</Link>
                    <button role="menuitem" className="danger" onClick={() => {
                      setMenu(null);
                      if (confirm(`Delete ${r.label}? Applications that used it will show no resume.`)) startTransition(() => deleteResume(r.id));
                    }}>Delete</button>
                  </div>
                )}
              </div>
              <div className="nm" title={r.label}>{r.label}</div>
              <div className="m1">{r.apps} application{r.apps === 1 ? "" : "s"}</div>
              <div className="m2">Updated {updated(r.uploadedAt)}</div>
            </div>
          ))}
          {!q && (
            <button className="rcd-add" style={pos(shown.length)} disabled={busy || needsMigration} onClick={pick}>
              <span className="plus">+</span>
              <span className="t1">Upload a resume</span>
              <span className="t2">PDF files · Add a new version</span>
            </button>
          )}
          {q && !shown.length && <div className="nodata" style={{ top: 40 }}>No resumes match.</div>}
        </div>
      </div>
    </div>
  );
}
