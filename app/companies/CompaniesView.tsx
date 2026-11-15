"use client";
import Link from "next/link";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PILL } from "@/lib/statuses";
import type { Company } from "@/lib/companies";
import { addTouchpoint, deleteCompany, setFavorite, type TouchState } from "./actions";

const CHIPS: [string, number, number][] = [["All", 283, 45], ["Networking", 336, 106], ["Applied", 450, 80], ["Interviewing", 538, 113], ["Favorite", 659, 82]];
const day = (d: string | null) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");

function matches(c: Company, f: string) {
  switch (f) {
    case "Networking": return !c.apps.length || c.apps.some((a) => a.status === "Networking");
    case "Applied": return c.apps.some((a) => a.status === "Applied" || a.status === "OA");
    case "Interviewing": return c.apps.some((a) => a.status === "Interview");
    case "Favorite": return c.favorite;
    default: return true;
  }
}

export function CompaniesView({ companies, needsMigration }: { companies: Company[]; needsMigration: boolean }) {
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(companies[0]?.key ?? null);
  const [, startTransition] = useTransition();
  const touch = useRef<TouchDialogHandle>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return companies
      .filter((c) => matches(c, filter))
      .filter((c) => !n || [c.name, ...c.apps.map((a) => a.role), ...c.contacts.map((p) => p.name)].some((s) => s.toLowerCase().includes(n)))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  }, [companies, filter, q]);
  const c = companies.find((x) => x.key === sel) ?? shown[0] ?? null;

  function remove(co: Company) {
    if (!confirm(`Delete ${co.name}? This removes its ${co.apps.length} application(s) and touchpoints. Its emails won't be imported again.`)) return;
    setSel(null);
    startTransition(() => deleteCompany(co.key));
  }

  return (
    <>
      <h1 className="big" style={{ left: 283, top: 46, fontSize: 48 }}>COMPANIES</h1>
      {CHIPS.map(([n, x, w]) => (
        <button key={n} className={`chip ${filter === n ? "on" : ""}`} aria-pressed={filter === n} style={{ left: x, top: 110, width: w, height: 28 }} onClick={() => setFilter(n)}>{n}</button>
      ))}
      {needsMigration && <p className="co-warn" role="status">Touchpoints and favorites are off until the database update in <code>supabase/migrations/002_companies.sql</code> is run.</p>}

      <input className="sr" placeholder="Search companies, roles, or contacts..." aria-label="Search companies, roles, or contacts" value={q} onChange={(e) => setQ(e.target.value)} style={{ left: 283, top: 155, width: 457 }} />
      <span className="sri" style={{ left: 297, top: 161 }}><Icon name="search" /></span>
      <button className="pill" style={{ left: 1102, top: 156, width: 145, height: 26, lineHeight: "26px" }} disabled={needsMigration} onClick={() => touch.current?.open()}>+ Add touchpoint</button>

      <div className="a co-list" role="table" aria-label="Companies">
        <div className="co-tb">
          <div className="co-th" role="row">
            {[["company", 23], ["roles applied", 135], ["last touchpoint", 268], ["referral", 417], ["contacts", 513]].map(([h, x]) => (
              <span key={h} role="columnheader" className="a" style={{ left: x as number }}>{h}</span>
            ))}
          </div>
          {shown.map((x) => (
            <div key={x.key} role="row" className={`co-r ${c?.key === x.key ? "on" : ""}`}>
              <button className="co-pick" aria-label={`Show ${x.name}`} aria-current={c?.key === x.key} onClick={() => setSel(x.key)} />
              <span className="a co-n" role="cell">{x.name}{x.favorite && <span className="co-fav"><Icon name="star" filled /></span>}</span>
              <span className="a co-num" role="cell" style={{ left: 150 }}>{x.rolesApplied}</span>
              <span className="a co-d" role="cell">{day(x.lastTouch)}</span>
              <span className="a co-ref" role="cell">{x.referral ? "Yes" : "No"}</span>
              <span className="a co-num" role="cell" style={{ left: 528 }}>{x.contacts.length}</span>
            </div>
          ))}
          {!shown.length && (
            <div className="nodata" style={{ position: "relative", top: 50 }}>
              {companies.length ? "No companies match." : "No companies yet. They appear here from your applications and touchpoints."}
            </div>
          )}
        </div>
      </div>

      {c && <CompanyCard c={c} onTouch={() => touch.current?.open(c.name)} onFav={() => startTransition(() => setFavorite(c.key, !c.favorite))} onDelete={() => remove(c)} disabled={needsMigration} />}
      <TouchDialog ref={touch} companies={companies.map((x) => x.name)} />
    </>
  );
}

function CompanyCard({ c, onTouch, onFav, onDelete, disabled }: { c: Company; onTouch: () => void; onFav: () => void; onDelete: () => void; disabled: boolean }) {
  const [copied, setCopied] = useState("");
  const tl = c.timeline.slice(0, 3);
  const copy = (name: string) => { navigator.clipboard?.writeText(name).then(() => { setCopied(name); setTimeout(() => setCopied(""), 1500); }); };
  return (
    <>
      <section className="co-card" aria-label={`${c.name} details`}>
        <h2 className="a hd co-title">{c.name}</h2>
        <div className="a co-sub">{c.apps.length ? `${c.apps.length} application${c.apps.length > 1 ? "s" : ""}` : "Tracking before applying"}</div>
        {[[c.touchpoints, "touchpoints", 18], [c.contacts.length, "contacts", 108], [c.rolesApplied, "applied role" + (c.rolesApplied === 1 ? "" : "s"), 195]].map(([n, l, x]) => (
          <div key={l as string} className="a co-stat" style={{ left: x as number }}><b>{n}</b><span>{l}</span></div>
        ))}
        {[96, 177].map((x) => <div key={x} className="a co-div" style={{ left: x }} />)}

        <div className="a co-h" style={{ top: 146 }}>TOUCHPOINT TIMELINE</div>
        {tl.length ? (
          <>
            <div className="a co-line" style={{ height: Math.max(0, (tl.length - 1) * 50) }} />
            {tl.map((t, k) => {
              const body = (<><div className="co-tl-d" style={{ color: t.color }}>{day(t.date)}</div><div className="co-tl-t">{t.title}</div><div className="co-tl-s">{t.detail}</div></>);
              return (
                <div key={k}>
                  <div className="a co-dot" style={{ top: 174 + k * 50, background: t.color }} />
                  {t.link
                    ? <a className="a co-tl" style={{ top: 169 + k * 50 }} href={t.link} target="_blank" rel="noreferrer" title="Open in Gmail">{body}</a>
                    : <div className="a co-tl" style={{ top: 169 + k * 50 }}>{body}</div>}
                </div>
              );
            })}
          </>
        ) : <div className="a co-empty" style={{ top: 176 }}>No touchpoints yet.</div>}

        <div className="a co-h" style={{ top: 338 }}>CONTACTS</div>
        {c.contacts.length ? c.contacts.slice(0, 2).map((p, k) => (
          <div key={p.name}>
            <div className="a co-p" style={{ top: 360 + k * 40 }}>{p.name}</div>
            <div className="a co-pr" style={{ top: 378 + k * 40 }}>{p.role}</div>
            <button className="a co-copy" style={{ top: 362 + k * 40 }} onClick={() => copy(p.name)} aria-label={`Copy ${p.name}`} title={copied === p.name ? "Copied" : "Copy name"}><Icon name="copy" /></button>
          </div>
        )) : <div className="a co-empty" style={{ top: 362 }}>No contacts yet.</div>}

        {c.apps.slice(0, 2).map((a, k) => {
          const [bg, fg] = PILL[a.status] ?? PILL.Withdrawn;
          return (
            <div key={a.id} className="a co-role" style={{ left: 10 + k * 108 }}>
              <div className="co-role-n" title={a.role}>{a.role || "Role not set"}</div>
              <span className="stt" style={{ background: bg, color: fg, height: 16, lineHeight: "16px", marginTop: 6 }}>{a.status}</span>
            </div>
          );
        })}
        {c.apps.length > 0 && <Link href="/pipeline" className="a co-more"><Icon name="chev" size={12} />see more</Link>}
      </section>
      <button className="pill" style={{ left: 923, top: 746, width: 110, height: 26, lineHeight: "26px" }} disabled={disabled} onClick={onTouch}>+ touchpoint</button>
      <button className="pill" style={{ left: 1043, top: 746, minWidth: 78, height: 26, lineHeight: "26px", fontSize: c.favorite ? 12 : 14 }} disabled={disabled} aria-pressed={c.favorite} onClick={onFav}>{c.favorite ? "unfavorite" : "favorite"}</button>
      <button className="pill" style={{ left: 1133, top: 746, width: 70, height: 26, lineHeight: "26px" }} onClick={onDelete}>delete</button>
    </>
  );
}

type TouchDialogHandle = { open: (company?: string) => void };
const TouchDialog = forwardRef<TouchDialogHandle, { companies: string[] }>(function TouchDialog({ companies }, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [company, setCompany] = useState("");
  const [version, setVersion] = useState(0);
  const [state, action, pending] = useActionState<TouchState, FormData>(addTouchpoint, {});
  useImperativeHandle(ref, () => ({ open: (co = "") => { setCompany(co); setVersion((v) => v + 1); dlg.current?.showModal(); } }));
  useEffect(() => { if (state.ok) dlg.current?.close(); }, [state.ok]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <dialog ref={dlg} aria-labelledby="tp-title">
      <form key={version} action={action}>
        <h3 id="tp-title">Add touchpoint</h3>
        <label>Company<input name="company" required list="tp-companies" defaultValue={company} autoFocus={!company} /></label>
        <datalist id="tp-companies">{companies.map((n) => <option key={n} value={n} />)}</datalist>
        <label>Person<input name="person" required placeholder="Jamie Lee" autoFocus={!!company} /></label>
        <label>Their role<input name="person_role" placeholder="University Recruiter" /></label>
        <label>Type
          <select name="kind" defaultValue="Coffee chat">{["Coffee chat", "Call", "Email", "Event", "Other"].map((k) => <option key={k}>{k}</option>)}</select>
        </label>
        <label>Date<input name="date" type="date" required defaultValue={today} /></label>
        <label>Notes<input name="notes" maxLength={500} placeholder="What you talked about" /></label>
        <label className="tp-check"><input type="checkbox" name="referral" /> They referred me</label>
        {state.error && version > 0 && <p className="err" role="alert">{state.error}</p>}
        <div className="row">
          <button type="button" className="g" onClick={() => dlg.current?.close()}>Cancel</button>
          <button disabled={pending}>{pending ? "Saving…" : "Save touchpoint"}</button>
        </div>
      </form>
    </dialog>
  );
});
