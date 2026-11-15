"use client";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { EntryDialog, type EntryDialogHandle, type ResumeOption } from "@/components/EntryDialog";
import { deleteEntry, importCsv, setStar, type ImportState } from "@/app/entries-actions";
import { BAR, PILL } from "@/lib/statuses";

export type Row = {
  id: string; company: string; role: string; status: string; starred: boolean;
  next_action: string | null; deadline: string | null; // stored values (for editing)
  shownNext: string | null; shownDue: string | null; // what the table shows
  thread: string | null;
  resume_id: string | null; // chosen resume (for editing)
  resumeShown: string | null; // chosen, else the default
};

const LEGEND = ["Applied", "OA", "Networking", "Interview", "Offer", "Rejected"];
// Filter row from the design. "Interested" in the design maps to Applied (there is no Saved status).
const FILTERS: [string, number, number][] = [["Starred", 322, 78], ["Interview", 422, 92], ["OA", 493, 50], ["Networking", 577, 96], ["Offer", 662, 56], ["Applied", 752, 92], ["Rejected", 857, 90]];
const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function PipelineView({ rows, resumes }: { rows: Row[]; resumes: ResumeOption[] }) {
  const [q, setQ] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("All");
  const [, startTransition] = useTransition();
  const dlg = useRef<EntryDialogHandle>(null);

  const counts = useMemo(() => Object.fromEntries(LEGEND.map((s) => [s, rows.filter((r) => r.status === s).length])), [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => filter === "All" || (filter === "Starred" ? r.starred : r.status === filter))
      .filter((r) => !needle || `${r.company} ${r.role}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.starred) - Number(a.starred));
  }, [rows, q, filter]);

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

      <button className={`chip ${!filterOpen && filter === "All" ? "on" : ""}`} style={{ left: 283, top: 217, width: 44, height: 26 }} onClick={() => { setFilter("All"); setFilterOpen(false); }}>All</button>
      <button className={`chip ${filterOpen ? "on" : ""}`} aria-expanded={filterOpen} style={{ left: 336, top: 217, width: 62, height: 26 }} onClick={() => { setFilterOpen(!filterOpen); if (filterOpen) setFilter("All"); }}>Filter</button>
      <CsvImport />
      <button className="pill" style={{ left: 1141, top: 217, width: 106, height: 26, lineHeight: "26px" }} onClick={() => dlg.current?.open()}>+ Add entry</button>

      {filterOpen && FILTERS.map(([f, c, w]) => (
        <button key={f} className={`chip ${filter === f ? "on" : ""}`} aria-pressed={filter === f} style={{ left: c - w / 2, top: 271, width: w, height: 28 }} onClick={() => setFilter(filter === f ? "All" : f)}>{f}</button>
      ))}

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
                {r.resumeShown
                  ? <Link className="ico" style={{ left: 704 }} href={`/resumes/${r.resumeShown}`} title={r.resume_id ? "Open the resume used" : "Open your default resume"} aria-label={`Resume for ${r.company}`}><Icon name="chain" /></Link>
                  : <button className="ico" style={{ left: 704 }} disabled title="Upload a resume on the Resumes page" aria-label="No resume yet"><Icon name="chain" /></button>}
                <button className="ico" style={{ left: 795 }} disabled title="Notes aren't built yet" aria-label="Notes (not built yet)"><Icon name="doc" /></button>
                <button className="ico" style={{ left: 872 }} aria-label={`Edit ${r.company}`} title="Edit" onClick={() => dlg.current?.open(r)}><Icon name="edit" /></button>
                <button className="ico" style={{ left: 915 }} aria-label={`Delete ${r.company}`} title="Delete" onClick={() => remove(r)}><Icon name="trash" /></button>
              </div>
            );
          })}
          {!shown.length && (
            <div className="nodata" style={{ position: "relative", top: 60 }}>
              {rows.length ? "No matches." : "No applications yet. Add an entry, import a CSV, or run the Gmail backfill."}
            </div>
          )}
        </div>
      </div>
      <EntryDialog ref={dlg} resumes={resumes} />
    </>
  );
}

function CsvImport() {
  const form = useRef<HTMLFormElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<ImportState, FormData>(importCsv, {});
  const [note, setNote] = useState("");
  useEffect(() => {
    if (state.error) setNote(state.error);
    else if (state.ok) setNote(`Imported ${state.added}${state.skipped ? `, skipped ${state.skipped} already in your pipeline` : ""}.`);
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
