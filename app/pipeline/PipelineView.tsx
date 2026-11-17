"use client";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { EntryDialog, type EntryDialogHandle, type ResumeOption } from "@/components/EntryDialog";
import { deleteEntry, importCsv, saveNotes, setStar, type ImportState } from "@/app/entries-actions";
import { BAR, PILL } from "@/lib/statuses";

export type Row = {
  id: string; company: string; role: string; status: string; starred: boolean;
  next_action: string | null; deadline: string | null; // stored values (for editing)
  shownNext: string | null; shownDue: string | null; // what the table shows
  thread: string | null;
  resume_id: string | null; // the resume the user says they applied with (none unless they pick one)
  notes: string;
};

const LEGEND = ["Applied", "OA", "Networking", "Interview", "Offer", "Rejected"];
// Status filter row (under "Filter"). Starred is its own chip next to All, and can be combined with a status.
const FILTERS = ["Applied", "OA", "Networking", "Interview", "Offer", "Rejected", "Withdrawn"];
const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function PipelineView({ rows, resumes, notesReady, google }: { rows: Row[]; resumes: ResumeOption[]; notesReady: boolean; google: boolean }) {
  const [q, setQ] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("All");
  const [starOnly, setStarOnly] = useState(false);
  const [, startTransition] = useTransition();
  const dlg = useRef<EntryDialogHandle>(null);
  const notesDlg = useRef<NotesHandle>(null);

  const counts = useMemo(() => Object.fromEntries(LEGEND.map((s) => [s, rows.filter((r) => r.status === s).length])), [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Rows arrive newest first; that order is kept.
    return rows
      .filter((r) => (!starOnly || r.starred) && (filter === "All" || r.status === filter))
      .filter((r) => !needle || `${r.company} ${r.role}`.toLowerCase().includes(needle));
  }, [rows, q, filter, starOnly]);

  const top = filterOpen ? 305 : 256;
  const today = new Date().toISOString().slice(0, 10);

  function remove(r: Row) {
    if (!confirm(`Delete ${r.company}${r.role ? ` · ${r.role}` : ""}? Its emails won't be imported again.`)) return;
    startTransition(() => deleteEntry(r.id));
  }

  return (
    <>
      <h1 className="big" style={{ left: 283, top: 46, fontSize: 48 }}>PIPELINE</h1>
      <div className="leg" aria-label="Applications by status">
        {LEGEND.map((s) => <span key={s} style={{ ["--c" as string]: BAR[s] }}>{s} <em>{counts[s]}</em></span>)}
      </div>
      <div className="bar" style={{ left: 283, top: 111, width: 964 }} aria-hidden="true">
        {LEGEND.filter((s) => counts[s] > 0).map((s) => <i key={s} style={{ flex: counts[s], background: BAR[s] }} />)}
        {!rows.length && <i style={{ flex: 1, background: "var(--pn2)" }} />}
      </div>

      <input className="sr" placeholder="Search companies, roles..." aria-label="Search companies and roles" value={q} onChange={(e) => setQ(e.target.value)} style={{ left: 283, top: 160, width: 457 }} />
      <span className="sri" style={{ left: 297, top: 166 }}><Icon name="search" /></span>

      <div className="chips" style={{ left: 283, top: 217 }}>
        <button className={`chip ${!filterOpen && !starOnly && filter === "All" ? "on" : ""}`} style={{ height: 26, padding: "4px 14px" }} onClick={() => { setFilter("All"); setStarOnly(false); setFilterOpen(false); }}>All</button>
        <button className={`chip ${starOnly ? "on" : ""}`} aria-pressed={starOnly} style={{ height: 26, padding: "4px 14px" }} onClick={() => setStarOnly(!starOnly)}>★ Starred</button>
        <button className={`chip ${filterOpen || filter !== "All" ? "on" : ""}`} aria-expanded={filterOpen} style={{ height: 26, padding: "4px 14px" }} onClick={() => { setFilterOpen(!filterOpen); if (filterOpen) setFilter("All"); }}>
          {filter !== "All" && !filterOpen ? `Status: ${filter}` : "Filter by status"}
        </button>
      </div>
      {google && <Link className="pill" href="/start" style={{ left: 897, top: 217, width: 102, height: 26, lineHeight: "26px" }} title="Read recruiting emails from a date you pick">Backfill gmail</Link>}
      <CsvImport />
      <button className="pill" style={{ left: 1141, top: 217, width: 106, height: 26, lineHeight: "26px" }} onClick={() => dlg.current?.open()}>+ Add entry</button>

      {filterOpen && (
        <div className="chips" style={{ left: 283, top: 271 }}>
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${filter === f ? "on" : ""}`} aria-pressed={filter === f} style={{ height: 28 }} onClick={() => setFilter(filter === f ? "All" : f)}>{f}</button>
          ))}
        </div>
      )}

      <div className="tw" style={{ top, height: 810 - top }}>
        <div className="tb" role="table" aria-label="Applications">
          <div className="th" role="row">
            {[["company", 23], ["role", 147], ["status", 254], ["next action", 351], ["deadline", 465], ["link", 597], ["resume", 701], ["notes", 797]].map(([h, x]) => (
              <span key={h} role="columnheader" style={{ left: x as number }}>{h}</span>
            ))}
          </div>
          {shown.map((r) => {
            const [bg, fg] = PILL[r.status] ?? PILL.Withdrawn;
            return (
              <div key={r.id} role="row" className={`r ${r.starred ? "s" : ""}`}>
                <span className="c" role="cell" title={r.company}>
                  <span className="cn">{r.company}</span>
                  <button className={`star ${r.starred ? "on" : ""}`} aria-pressed={r.starred} aria-label={`${r.starred ? "Unstar" : "Star"} ${r.company}`}
                    onClick={() => startTransition(() => setStar(r.id, !r.starred))}><Icon name="star" filled={r.starred} /></button>
                </span>
                <span className="ro" role="cell" title={r.role}>{r.role || "—"}</span>
                <span role="cell" style={{ left: 253 }}><span className="stt" style={{ background: bg, color: fg }}>{r.status}</span></span>
                <span className="nx" role="cell" title={r.shownNext ?? ""}>{r.shownNext || "---"}</span>
                <span className={`dl ${r.shownDue && r.shownDue < today ? "late" : ""}`} role="cell">{r.shownDue ? day(r.shownDue) : "—"}</span>
                {r.thread
                  ? <a className="lk" role="cell" href={`https://mail.google.com/mail/u/0/#all/${r.thread}`} target="_blank" rel="noreferrer" title="Open the latest email in Gmail"><Icon name="chain" size={11} />Link</a>
                  : <span className="lk off" role="cell" title="No email for this entry">—</span>}
                {r.resume_id
                  ? <Link className="ico on" style={{ left: 704 }} href={`/resumes/${r.resume_id}`} title={`Applied with ${resumes.find((x) => x.id === r.resume_id)?.label ?? "this resume"}`} aria-label={`Resume for ${r.company}`}><Icon name="chain" /></Link>
                  : <button className="ico" style={{ left: 704 }} disabled={!resumes.length} title={resumes.length ? "Pick the resume you applied with" : "Upload a resume on the Resumes page first"}
                      aria-label={`Pick a resume for ${r.company}`} onClick={() => dlg.current?.open(r)}><Icon name="chain" /></button>}
                <button className={`ico ${r.notes ? "on" : ""}`} style={{ left: 795 }} disabled={!notesReady}
                  title={!notesReady ? "Notes need supabase/migrations/004_notes_contacts_priority.sql" : r.notes ? r.notes.slice(0, 200) : "Add notes"}
                  aria-label={`${r.notes ? "Notes" : "Add notes"} for ${r.company}`} onClick={() => notesDlg.current?.open(r)}><Icon name="doc" /></button>
                <button className="ico" style={{ left: 872 }} aria-label={`Edit ${r.company}`} title="Edit" onClick={() => dlg.current?.open(r)}><Icon name="edit" /></button>
                <button className="ico" style={{ left: 915 }} aria-label={`Delete ${r.company}`} title="Delete" onClick={() => remove(r)}><Icon name="trash" /></button>
              </div>
            );
          })}
          {!shown.length && (
            <div className="nodata" style={{ position: "relative", top: 60 }}>
              {rows.length ? "No matches." : <>No applications yet. Add an entry, import a CSV (<a href="/sample-applications.csv" download style={{ color: "var(--or)" }}>sample</a>), or run the Gmail backfill.</>}
            </div>
          )}
        </div>
      </div>
      <EntryDialog ref={dlg} resumes={resumes} />
      <NotesDialog ref={notesDlg} />
    </>
  );
}

type NotesHandle = { open: (r: Row) => void };
const NotesDialog = forwardRef<NotesHandle>(function NotesDialog(_, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [row, setRow] = useState<Row | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  useImperativeHandle(ref, () => ({ open: (r) => { setRow(r); setText(r.notes); setErr(""); dlg.current?.showModal(); } }));
  return (
    <dialog ref={dlg} aria-labelledby="notes-title" style={{ width: 460 }}>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (!row) return;
        startTransition(async () => { const res = await saveNotes(row.id, text); if (res.error) setErr(res.error); else dlg.current?.close(); });
      }}>
        <h3 id="notes-title">Notes</h3>
        <p className="dlg-sub">{row ? [row.company, row.role].filter(Boolean).join(" · ") : ""}</p>
        <label htmlFor="notes-text" style={{ position: "absolute", left: -9999 }}>Notes</label>
        <textarea id="notes-text" rows={10} maxLength={5000} autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Who you talked to, what to prepare, links…" />
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row">
          <button type="button" className="g" onClick={() => dlg.current?.close()}>Cancel</button>
          <button disabled={pending}>{pending ? "Saving…" : "Save notes"}</button>
        </div>
      </form>
    </dialog>
  );
});

function CsvImport() {
  const form = useRef<HTMLFormElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<ImportState, FormData>(importCsv, {});
  const [note, setNote] = useState("");
  useEffect(() => {
    if (state.error) setNote(state.error);
    else if (state.ok) setNote(`Imported ${state.added}${state.merged ? `, merged ${state.merged} into existing entries` : ""}${state.skipped ? `, ${state.skipped} unchanged` : ""}${state.todos ? ` · ${state.todos} to-dos` : ""}${state.touchpoints ? ` · ${state.touchpoints} touchpoints` : ""}.${state.note ? ` ${state.note}` : ""}`);
    if (state.ok || state.error) { const t = setTimeout(() => setNote(""), 6000); return () => clearTimeout(t); }
  }, [state]);
  return (
    <form ref={form} action={action}>
      <input ref={file} type="file" name="file" accept=".csv,text/csv" hidden onChange={() => form.current?.requestSubmit()} />
      <button type="button" className="pill" disabled={pending} style={{ left: 1019, top: 217, width: 102, height: 26, lineHeight: "26px" }} onClick={() => { if (file.current) { file.current.value = ""; file.current.click(); } }}>
        {pending ? "Importing…" : "Import csv"}
      </button>
      {note && <p role="status" className="imp-note">{note}</p>}
    </form>
  );
}
