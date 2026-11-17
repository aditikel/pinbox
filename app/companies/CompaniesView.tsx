"use client";
import { forwardRef, useActionState, useEffect, useImperativeHandle, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PILL } from "@/lib/statuses";
import type { Company, TouchIn } from "@/lib/companies";
import { deleteCompany, deleteTouchpoint, saveTouchpoint, setFavorite, updateCompany, type CompanyState, type TouchState } from "./actions";

// Chips: "All" keeps the default order (earliest next action, then latest touchpoint). Three sort, two filter.
const CHIPS = ["All", "Roles applied", "Last touchpoint", "Contacts", "Referrals", "Favorite"] as const;
type Chip = (typeof CHIPS)[number];
const day = (d: string | null) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");
const KINDS = ["Coffee chat", "Call", "Email", "Event", "Other"];

function arrange(list: Company[], chip: Chip): Company[] {
  switch (chip) {
    case "Referrals": return list.filter((c) => c.referral);
    case "Favorite": return list.filter((c) => c.favorite);
    case "Roles applied": return [...list].sort((a, b) => b.rolesApplied - a.rolesApplied);
    case "Last touchpoint": return [...list].sort((a, b) => (b.lastTouch ?? "").localeCompare(a.lastTouch ?? ""));
    case "Contacts": return [...list].sort((a, b) => b.contacts.length - a.contacts.length);
    default: return [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  }
}

export function CompaniesView({ companies, needsMigration, contactsReady }: { companies: Company[]; needsMigration: boolean; contactsReady: boolean }) {
  const [chip, setChip] = useState<Chip>("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(companies[0]?.key ?? null);
  const [, startTransition] = useTransition();
  const touch = useRef<TouchDialogHandle>(null);
  const edit = useRef<CompanyDialogHandle>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return arrange(companies, chip)
      .filter((c) => !n || [c.name, ...c.apps.map((a) => a.role), ...c.contacts.map((p) => p.name)].some((s) => s.toLowerCase().includes(n)));
  }, [companies, chip, q]);
  const c = companies.find((x) => x.key === sel) ?? shown[0] ?? null;

  function remove(co: Company) {
    if (!confirm(`Delete ${co.name}? This removes its ${co.apps.length} application(s) and touchpoints. Its emails won't be imported again.`)) return;
    setSel(null);
    startTransition(() => deleteCompany(co.key));
  }

  return (
    <>
      <h1 className="big" style={{ left: 283, top: 46, fontSize: 48 }}>COMPANIES</h1>
      <div className="chips" style={{ left: 283, top: 110 }} role="group" aria-label="Sort and filter companies">
        {CHIPS.map((n) => (
          <button key={n} className={`chip ${chip === n ? "on" : ""}`} aria-pressed={chip === n} style={{ height: 28 }} onClick={() => setChip(n)}>{n}</button>
        ))}
      </div>
      {needsMigration && <p className="co-warn" role="status">Touchpoints and favorites are off until the database update in <code>supabase/migrations/002_companies.sql</code> is run.</p>}

      <input className="sr" placeholder="Search companies, roles, or contacts..." aria-label="Search companies, roles, or contacts" value={q} onChange={(e) => setQ(e.target.value)} style={{ left: 283, top: 155, width: 457 }} />
      <span className="sri" style={{ left: 297, top: 161 }}><Icon name="search" /></span>
      <button className="pill" style={{ left: 1102, top: 156, width: 145, height: 26, lineHeight: "26px" }} disabled={needsMigration} onClick={() => touch.current?.open({ company: c?.name ?? "" })}>+ Add touchpoint</button>

      <div className="a co-list" role="table" aria-label="Companies">
        <div className="co-tb">
          <div className="co-th" role="row">
            {[["company", 23], ["roles applied", 135], ["last touchpoint", 268], ["referral", 417], ["contacts", 513]].map(([h, x]) => (
              <span key={h} role="columnheader" className="a" style={{ left: x as number }}>{h}</span>
            ))}
          </div>
          {shown.map((x) => (
            <div key={x.key} role="row" className={`co-r ${c?.key === x.key ? "on" : ""}`}>
              <button className="co-pick" aria-label={`Show ${x.name}`} aria-current={c?.key === x.key} onClick={() => setSel(x.key)} title={x.name} />
              <span className="a co-n" role="cell"><span className="co-nt">{x.name}</span>{x.favorite && <span className="co-fav"><Icon name="star" filled /></span>}</span>
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

      {c && <CompanyCard key={c.key} c={c} disabled={needsMigration}
        onEditTouch={(t) => touch.current?.open(t)}
        onEdit={() => edit.current?.open(c)}
        onFav={() => startTransition(() => setFavorite(c.key, !c.favorite))}
        onDelete={() => remove(c)} />}
      <TouchDialog ref={touch} companies={companies.map((x) => x.name)} contactsReady={contactsReady} />
      <CompanyDialog ref={edit} contactsReady={contactsReady} />
    </>
  );
}

function CompanyCard({ c, onEditTouch, onEdit, onFav, onDelete, disabled }: {
  c: Company; onEditTouch: (t: TouchIn) => void; onEdit: () => void; onFav: () => void; onDelete: () => void; disabled: boolean;
}) {
  const [copied, setCopied] = useState("");
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(c.apps.length / 2));
  const roles = c.apps.slice(page * 2, page * 2 + 2);
  const copy = (text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(text); setTimeout(() => setCopied(""), 1500); }); };
  return (
    <>
      <section className="co-card" aria-label={`${c.name} details`}>
        <h2 className="a hd co-title" title={c.name}>{c.name}</h2>
        <div className="a co-sub">{c.apps.length ? `${c.apps.length} application${c.apps.length > 1 ? "s" : ""}` : "Tracking before applying"}</div>
        {[[c.touchpoints, "touchpoints", 18], [c.contacts.length, "contacts", 108], [c.rolesApplied, "applied role" + (c.rolesApplied === 1 ? "" : "s"), 195]].map(([n, l, x]) => (
          <div key={l as string} className="a co-stat" style={{ left: x as number }}><b>{n}</b><span>{l}</span></div>
        ))}
        {[96, 177].map((x) => <div key={x} className="a co-div" style={{ left: x }} />)}

        <div className="a co-h" style={{ top: 146 }}>TOUCHPOINT TIMELINE</div>
        {c.timeline.length ? (
          <div className="a co-tlw">
            <div style={{ position: "relative", height: c.timeline.length * 50 }}>
              <div className="a co-line" style={{ top: 9, height: Math.max(0, (c.timeline.length - 1) * 50) }} />
              {c.timeline.map((t, k) => {
                const body = (<><div className="co-tl-d" style={{ color: t.color }}>{day(t.date)}</div><div className="co-tl-t">{t.title}</div><div className="co-tl-s">{t.detail}</div></>);
                return (
                  <div key={k}>
                    <div className="a co-dot" style={{ top: 5 + k * 50, background: t.color }} />
                    {t.link
                      ? <a className="a co-tl" style={{ top: k * 50 }} href={t.link} target="_blank" rel="noreferrer" title="Open in Gmail">{body}</a>
                      : t.touch
                        ? <button className="a co-tl co-tl-b" style={{ top: k * 50 }} disabled={disabled} onClick={() => onEditTouch(t.touch!)} title={t.touch.notes ? `Notes: ${t.touch.notes}` : "Open touchpoint"}>{body}</button>
                        : <div className="a co-tl" style={{ top: k * 50 }}>{body}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : <div className="a co-empty" style={{ top: 176 }}>No touchpoints yet.</div>}

        <div className="a co-h" style={{ top: 338 }}>CONTACTS</div>
        {c.contacts.length ? (
          <div className="a co-cw">
            {c.contacts.map((p) => {
              const value = p.contact || p.name;
              return (
                <div key={p.name} className="co-c">
                  <div className="co-p">{p.name}</div>
                  <div className="co-pr" title={[p.role, p.contact].filter(Boolean).join(" · ")}>{[p.role, p.contact].filter(Boolean).join(" · ") || "No details yet"}</div>
                  <button className="co-copy" onClick={() => copy(value)} aria-label={`Copy ${p.contact ? "contact info for" : "name of"} ${p.name}`}
                    title={copied === value ? "Copied" : p.contact ? `Copy ${p.contact}` : "Copy name (add contact info with edit)"}><Icon name="copy" /></button>
                </div>
              );
            })}
          </div>
        ) : <div className="a co-empty" style={{ top: 362 }}>No contacts yet. Add a touchpoint to save one.</div>}

        {roles.map((a, k) => {
          const [bg, fg] = PILL[a.status] ?? PILL.Withdrawn;
          return (
            <div key={a.id} className="a co-role" style={{ left: 10 + k * 108 }}>
              <div className="co-role-n" title={a.role}>{a.role || "Role not set"}</div>
              <span className="stt" style={{ background: bg, color: fg, height: 16, lineHeight: "16px", marginTop: 6 }}>{a.status}</span>
            </div>
          );
        })}
        {pages > 1 && (
          <div className="a co-pager" role="group" aria-label="Browse roles">
            <button onClick={() => setPage((page - 1 + pages) % pages)} aria-label="Previous roles"><Icon name="chev" /></button>
            <span>{page * 2 + 1}–{Math.min(c.apps.length, page * 2 + 2)} of {c.apps.length}</span>
            <button onClick={() => setPage((page + 1) % pages)} aria-label="Next roles"><Icon name="chev" /></button>
          </div>
        )}
      </section>
      <button className="pill" style={{ left: 943, top: 746, width: 90, height: 26, lineHeight: "26px" }} disabled={disabled} onClick={onEdit}>edit</button>
      <button className="pill" style={{ left: 1043, top: 746, minWidth: 78, height: 26, lineHeight: "26px", fontSize: c.favorite ? 12 : 14 }} disabled={disabled} aria-pressed={c.favorite} onClick={onFav}>{c.favorite ? "unfavorite" : "favorite"}</button>
      <button className="pill" style={{ left: 1133, top: 746, width: 70, height: 26, lineHeight: "26px" }} onClick={onDelete}>delete</button>
    </>
  );
}

type TouchDialogHandle = { open: (t?: Partial<TouchIn>) => void };
const TouchDialog = forwardRef<TouchDialogHandle, { companies: string[]; contactsReady: boolean }>(function TouchDialog({ companies, contactsReady }, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [t, setT] = useState<Partial<TouchIn>>({});
  const [kind, setKind] = useState("Coffee chat");
  const [version, setVersion] = useState(0);
  const [state, action, pending] = useActionState<TouchState, FormData>(saveTouchpoint, {});
  const [, startTransition] = useTransition();
  useImperativeHandle(ref, () => ({
    open: (x = {}) => {
      setT(x);
      setKind(!x.kind ? "Coffee chat" : KINDS.includes(x.kind) ? x.kind : "Other");
      setVersion((v) => v + 1);
      dlg.current?.showModal();
    },
  }));
  useEffect(() => { if (state.ok) dlg.current?.close(); }, [state.ok]);
  const today = new Date().toISOString().slice(0, 10);
  const editing = !!t.id;
  return (
    <dialog ref={dlg} aria-labelledby="tp-title" style={{ width: 420 }}>
      <form key={version} action={action}>
        <h3 id="tp-title">{editing ? "Touchpoint" : "Add touchpoint"}</h3>
        {editing && <input type="hidden" name="id" value={t.id} />}
        <label>Company<input name="company" required list="tp-companies" defaultValue={t.company ?? ""} autoFocus={!t.company} /></label>
        <datalist id="tp-companies">{companies.map((n) => <option key={n} value={n} />)}</datalist>
        <label>Person<input name="person" required placeholder="Jamie Lee" defaultValue={t.person ?? ""} autoFocus={!!t.company && !editing} /></label>
        <label>Their role<input name="person_role" placeholder="University Recruiter" defaultValue={t.person_role ?? ""} /></label>
        {contactsReady && <label>Contact info<input name="contact" maxLength={200} placeholder="jamie@company.com or LinkedIn URL" defaultValue={t.contact ?? ""} /></label>}
        <label>Type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        </label>
        {kind === "Other" && <label>What kind?<input name="kind_other" maxLength={40} placeholder="Alumni panel, office hours…" defaultValue={t.kind && !KINDS.includes(t.kind) ? t.kind : ""} /></label>}
        <label>Date<input name="date" type="date" required defaultValue={t.happened_on ?? today} /></label>
        <label>Notes<textarea name="notes" rows={4} maxLength={2000} placeholder="What you talked about" defaultValue={t.notes ?? ""} /></label>
        <label className="tp-check"><input type="checkbox" name="referral" defaultChecked={!!t.referral} /> They referred me</label>
        {state.error && version > 0 && <p className="err" role="alert">{state.error}</p>}
        <div className="row">
          {editing && (
            <button type="button" className="g" style={{ marginRight: "auto" }} onClick={() => {
              if (!confirm(`Delete this touchpoint with ${t.person}?`)) return;
              dlg.current?.close();
              startTransition(() => deleteTouchpoint(t.id!));
            }}>Delete</button>
          )}
          <button type="button" className="g" onClick={() => dlg.current?.close()}>Cancel</button>
          <button disabled={pending}>{pending ? "Saving…" : "Save touchpoint"}</button>
        </div>
      </form>
    </dialog>
  );
});

type CompanyDialogHandle = { open: (c: Company) => void };
const CompanyDialog = forwardRef<CompanyDialogHandle, { contactsReady: boolean }>(function CompanyDialog({ contactsReady }, ref) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [c, setC] = useState<Company | null>(null);
  const [rows, setRows] = useState<{ old: string; name: string; role: string; contact: string }[]>([]);
  const [version, setVersion] = useState(0);
  const [state, action, pending] = useActionState<CompanyState, FormData>(updateCompany, {});
  useImperativeHandle(ref, () => ({
    open: (x) => { setC(x); setRows(x.contacts.map((p) => ({ old: p.name, ...p }))); setVersion((v) => v + 1); dlg.current?.showModal(); },
  }));
  useEffect(() => {
    if (!state.ok) return;
    dlg.current?.close();
    if (state.note) alert(state.note);
  }, [state.ok, state.note]);
  const set = (k: number, f: "name" | "role" | "contact", v: string) => setRows((r) => r.map((x, j) => (j === k ? { ...x, [f]: v } : x)));
  return (
    <dialog ref={dlg} aria-labelledby="co-edit-title" style={{ width: 520 }}>
      <form key={version} action={action}>
        <h3 id="co-edit-title">Edit company</h3>
        <input type="hidden" name="key" value={c?.key ?? ""} />
        <input type="hidden" name="contacts" value={JSON.stringify(rows)} />
        <label>Company name<input name="name" required maxLength={120} defaultValue={c?.name ?? ""} /></label>
        <p className="dlg-sub" style={{ marginTop: -4 }}>Renaming to a company you already track merges them (e.g. “FTI” into “FTI Consulting”).</p>
        {rows.length > 0 && <div style={{ font: "600 13px Mulish", color: "var(--ac)", margin: "8px 0 4px" }}>Contacts</div>}
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {rows.map((p, k) => (
            <div key={p.old} className="co-edit-row">
              <input aria-label="Contact name" value={p.name} required onChange={(e) => set(k, "name", e.target.value)} placeholder="Name" />
              <input aria-label={`${p.old}'s role`} value={p.role} onChange={(e) => set(k, "role", e.target.value)} placeholder="Role" />
              {contactsReady && <input aria-label={`${p.old}'s contact info`} value={p.contact} onChange={(e) => set(k, "contact", e.target.value)} placeholder="Email or LinkedIn" />}
            </div>
          ))}
        </div>
        {!contactsReady && rows.length > 0 && <p className="dlg-sub">Contact info needs supabase/migrations/004_notes_contacts_priority.sql.</p>}
        {state.error && version > 0 && <p className="err" role="alert">{state.error}</p>}
        <div className="row">
          <button type="button" className="g" onClick={() => dlg.current?.close()}>Cancel</button>
          <button disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </dialog>
  );
});
