"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PILL } from "@/lib/statuses";
import { deleteResume, renameResume, setDefaultResume } from "../actions";

type App = { id: string; company: string; role: string; status: string };

export function ResumeDetail(p: { id: string; label: string; isDefault: boolean; uploadedAt: string; viewUrl: string | null; downloadUrl: string | null; apps: App[] }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(p.label);
  const [q, setQ] = useState("");
  const [, startTransition] = useTransition();
  const shown = useMemo(() => p.apps.filter((a) => `${a.company} ${a.role}`.toLowerCase().includes(q.trim().toLowerCase())), [p.apps, q]);
  const updated = new Date(p.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  function save() {
    setEditing(false);
    if (label.trim() && label.trim() !== p.label) startTransition(() => renameResume(p.id, label));
    else setLabel(p.label);
  }

  return (
    <>
      <Link href="/resumes" className="a rd-back">‹&nbsp; Back to resumes</Link>
      <div className="a rd-title">
        {editing ? (
          <input aria-label="Resume name" value={label} autoFocus maxLength={80} onChange={(e) => setLabel(e.target.value)}
            onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setLabel(p.label); setEditing(false); } }} />
        ) : (
          <>
            <h1 className="big" title={label}>{label.toUpperCase()}</h1>
            <button className="rd-pen" aria-label="Rename resume" title="Rename" onClick={() => setEditing(true)}><Icon name="pen" /></button>
          </>
        )}
        <span className="rd-upd">last updated {updated}</span>
      </div>
      {p.downloadUrl && <a className="pill rd-dl" href={p.downloadUrl}><Icon name="dl" />Download PDF</a>}

      <div className="a rd-def">
        {p.isDefault ? <span className="df">DEFAULT</span> : <button onClick={() => startTransition(() => setDefaultResume(p.id))}>Make default</button>}
        <span>{p.isDefault ? "Pre-selected when you add a new entry." : "Attach it to an application from the pipeline's resume icon."}</span>
        <button className="rd-del" onClick={() => { if (confirm(`Delete ${p.label}? Applications that used it will show no resume.`)) startTransition(() => deleteResume(p.id, true)); }}>Delete</button>
      </div>

      <div className="a rd-prev">
        <div className="rd-prev-h">DOCUMENT PREVIEW</div>
        {p.viewUrl
          ? <iframe title={`${p.label} preview`} src={`${p.viewUrl}#view=FitH`} />
          : <div className="nodata" style={{ top: 300 }}>Couldn't load the preview. Refresh to try again.</div>}
      </div>

      <div className="a rd-apps" />
      <div className="a rd-apps-h">APPLICATIONS USING<br />THIS RESUME</div>
      <div className="a rd-total">{p.apps.length} TOTAL</div>
      <div className="a rd-rule" />
      <input className="sr" placeholder="Search companies or roles..." aria-label="Search applications using this resume" value={q} onChange={(e) => setQ(e.target.value)}
        style={{ left: 885, top: 210, width: 344, height: 35, borderRadius: 8, fontSize: 12 }} />
      <span className="sri" style={{ left: 894, top: 219 }}><Icon name="search" /></span>
      <div className="a rd-list">
        {shown.map((a) => {
          const [bg, fg] = PILL[a.status] ?? PILL.Withdrawn;
          return (
            <div key={a.id} className="ap">
              <b>{a.company}</b><span className="r2">{a.role || "Role not set"}</span>
              <span className="stt" style={{ background: bg, color: fg }}>{a.status}</span>
            </div>
          );
        })}
        {!shown.length && <div className="nodata" style={{ top: 90 }}>{p.apps.length ? "No applications match." : "No applications use this resume yet. Pick it from the pipeline's resume icon."}</div>}
      </div>
    </>
  );
}
