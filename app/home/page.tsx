import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";
import { Stage } from "@/components/Stage";
import { Sidebar, displayName } from "@/components/Sidebar";
import { Icon } from "@/components/Icon";
import { AddEntry, AgendaTools, EditTodo } from "./AddEntry";
import { completeAction } from "./actions";
import { priorityFor } from "@/lib/ingest";
import "../app.css";
import "./home.css";

// UPCOMING is filled from two places:
//  - interview / coffee chat emails whose time the classifier read (events.fields.event_at)
//  - touchpoints the user added on the Companies page with today's date or later (a planned coffee chat, a career fair)
const FILTERS = ["All", "Interview", "Meetups", "Coffee"] as const;
const CAT_STYLE: Record<string, [string, string]> = {
  interview: ["Interview", "#e63f6b"], coffee: ["Coffee Chat", "#d18951"], meetup: ["Meetup", "#f6c564"], other: ["", "#5a8cd7"],
};
const FILTER_CAT: Record<string, string> = { Interview: "interview", Meetups: "meetup", Coffee: "coffee" };
type Up = { key: string; at: number; timed: boolean; cat: string; label: string; company: string; sub: string };
// Pie groups. Colors match the legend in the design.
const GROUPS = [
  ["In Progress", ["Networking", "Applied", "OA"], "#a34558"],
  ["Interviewing", ["Interview"], "#d18951"],
  ["Offer", ["Offer"], "#d9d9d9"],
  ["Rejected", ["Rejected"], "#e63f6b"],
] as const;

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const day = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Search = Promise<{ found?: string; uf?: string }>;

export default async function Home({ searchParams }: { searchParams: Search }) {
  const { found, uf = "All" } = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(uf) ? uf : "All";
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  // priority_manual needs migration 004; until then every priority is treated as automatic.
  const actionQuery = (cols: string) => supabase.from("actions")
    .select(cols)
    .eq("done", false)
    .or(`snoozed_until.is.null,snoozed_until.lte.${today}`)
    .order("due", { ascending: true, nullsFirst: false })
    .limit(50);
  const actionsRes = await actionQuery("id,title,due,priority,priority_manual,applications(company,role)");
  const actions = (actionsRes.error ? (await actionQuery("id,title,due,priority,applications(company,role)")).data : actionsRes.data) as unknown as
    { id: string; title: string; due: string | null; priority: string; priority_manual?: boolean; applications: unknown }[] | null;

  const [{ data: evRows }, { data: tpRows }, { data: apps }, { count: connections }, { data: resumeRows }] = await Promise.all([
    supabase.from("events")
      .select("id,category,fields,applications(company,role)")
      .in("category", ["interview_invite", "scheduling", "coffee_chat"])
      .gte("fields->>event_at", new Date().toISOString())
      .limit(20),
    supabase.from("touchpoints").select("id,company,person,kind,happened_on").gte("happened_on", today).order("happened_on").limit(20),
    supabase.from("applications").select("status,date_applied,created_at"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("category", "coffee_chat"),
    supabase.from("resumes").select("id,label,is_default").order("uploaded_at", { ascending: false }),
  ]);
  const resumes = (resumeRows ?? []).map((r) => ({ id: r.id, label: r.label, isDefault: r.is_default }));

  const A = apps ?? [];
  const T = actions ?? [];

  const ups: Up[] = [
    ...(evRows ?? []).map((e) => {
      const app = (Array.isArray(e.applications) ? e.applications[0] : e.applications) as { company: string; role: string } | null;
      const f = (e.fields ?? {}) as { company?: string; role?: string; event_at?: string };
      const cat = e.category === "coffee_chat" ? "coffee" : "interview";
      return { key: e.id, at: Date.parse(f.event_at!), timed: true, cat, label: CAT_STYLE[cat][0], company: app?.company ?? f.company ?? "", sub: app?.role ?? f.role ?? "" };
    }),
    ...(tpRows ?? []).map((t) => {
      const cat = t.kind === "Coffee chat" ? "coffee" : t.kind === "Event" ? "meetup" : "other";
      return { key: t.id, at: Date.parse(t.happened_on + "T00:00:00Z"), timed: false, cat, label: cat === "other" ? t.kind : CAT_STYLE[cat][0], company: t.company, sub: `with ${t.person}` };
    }),
  ];
  const E = ups.filter((u) => filter === "All" || u.cat === FILTER_CAT[filter]).sort((a, b) => a.at - b.at).slice(0, 3);

  // YOUR <year>: status mix, totals, applications per month (current month -3 .. +1, as in the design).
  const groupCounts = GROUPS.map(([, ss]) => A.filter((a) => (ss as readonly string[]).includes(a.status)).length);
  const total = groupCounts.reduce((s, n) => s + n, 0);
  let acc = 0;
  const pie = total
    ? GROUPS.map(([, , c], k) => { const a = acc; acc += (groupCounts[k] / total) * 360; return `${c} ${a}deg ${acc}deg`; }).join(",")
    : "var(--pie) 0 360deg";
  const appliedCount = A.filter((a) => a.status !== "Networking").length;

  const now = new Date();
  const months = [-3, -2, -1, 0, 1].map((o) => new Date(now.getFullYear(), now.getMonth() + o, 1));
  const perMonth = months.map((m) => A.filter((a) => {
    const d = new Date(a.date_applied ?? a.created_at);
    return a.status !== "Networking" && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
  }).length);
  const max = Math.max(10, Math.ceil(Math.max(...perMonth) / 5) * 5);
  const y = (v: number) => 774 - (v / max) * 146; // axis at y=774, top tick at y=628
  const pts = perMonth.map((v, k) => `${995 + k * 59},${y(v)}`).join(" ");

  const slots = Math.max(5, T.length);

  return (
    <Stage>
      <Sidebar current="home" name={displayName(user)} />

      <h1 className="big" style={{ left: 301, top: 40 }}>DAILY AGENDA</h1>
      {found && <p className="found" role="status">Found {found} applications from your inbox.</p>}
      <AgendaTools />
      <AddEntry resumes={resumes} />

      <section className="ag" aria-label="Daily agenda">
        <div className="blk ag-head"><span style={{ left: 35 }}>task</span><span style={{ left: 345 }}>priority</span><span style={{ left: 555 }}>due</span></div>
        <ul className="ag-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {Array.from({ length: slots }, (_, k) => {
            const t = T[k];
            if (!t) return <li key={k} className="blk">{k === 0 && <div className="nodata" style={{ top: 26 }}>Nothing due. Add an entry to start your agenda.</div>}</li>;
            const app = (Array.isArray(t.applications) ? t.applications[0] : t.applications) as { company: string; role: string } | null;
            // Automatic priorities follow the due date as it gets closer; ones the user picked stay put.
            const p = !t.priority_manual && t.due ? priorityFor(t.due, today) : ["high", "med", "low"].includes(t.priority) ? t.priority : "med";
            const subtitle = app ? [app.company, app.role].filter(Boolean).join(" ") : "Personal to-do";
            return (
              <li key={t.id} className="blk tk">
                <EditTodo todo={{ id: t.id, title: t.title, due: t.due, priority: p, manual: !!t.priority_manual, subtitle }} />
                <form action={completeAction.bind(null, t.id)}>
                  <button className="cb" aria-label={`Mark "${t.title}" done`} title="Mark done" />
                </form>
                <div className="tt">{t.title}</div>
                <div className="su">{subtitle}</div>
                <div className={`pr ${p}`}>{p} priority</div>
                <div className={`du ${t.due && t.due < today ? "late" : ""}`}>{t.due ? day(t.due) : "—"}</div>
              </li>
            );
          })}
        </ul>
      </section>

      <h1 className="big" style={{ left: 301, top: 567, fontSize: 36 }}>UPCOMING</h1>
      <div className="chips" style={{ left: 518, top: 573 }}>
        {FILTERS.map((f) => (
          <Link key={f} href={f === "All" ? "/home" : `/home?uf=${f}`} scroll={false} className={`chip ${filter === f ? "on" : ""}`} aria-current={filter === f ? "true" : undefined}>{f}</Link>
        ))}
      </div>
      {E.length ? (
        <>
          {E.map((e, k) => {
            const top = [619, 683, 747][k];
            const color = CAT_STYLE[e.cat][1];
            const at = new Date(e.at);
            return (
              <div key={e.key}>
                <div className="up-dot" style={{ top: top + 8, background: color }} />
                {k < E.length - 1 && <div className="up-seg" style={{ top: top + 18, background: color }} />}
                <div className="up" style={{ top }}>
                  <div className="dt">
                    <div className="d1" style={{ color }}>{at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(e.timed ? {} : { timeZone: "UTC" }) })}</div>
                    <div className="d2">{e.timed ? at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "time not set"}</div>
                  </div>
                  <div className="ev">
                    <div className="e1">{[e.label, e.company].filter(Boolean).join(" · ")}</div>
                    <div className="e2" style={{ color }}>{e.sub}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <div className="nodata" style={{ left: 322, top: 630, width: 600, textAlign: "left", lineHeight: 1.5 }}>
          Nothing scheduled{filter === "All" ? "" : " in this category"}. Interview and coffee chat emails that give a time show up here,<br />
          and so do touchpoints you <Link href="/companies" style={{ color: "var(--or)" }}>add on Companies</Link> with a future date.
        </div>
      )}

      <h1 className="big" style={{ left: 987, top: 40 }}>YOUR {year}</h1>
      <div className="a" role="img" aria-label={GROUPS.map(([n], k) => `${n} ${groupCounts[k]}`).join(", ")}
        style={{ left: 979, top: 113, width: 249, height: 249, borderRadius: "50%", border: "4.5px solid var(--pie)", background: `conic-gradient(${pie})` }} />
      {GROUPS.map(([n, , c], k) => (
        <div key={n} className="lgd" style={{ top: 378 + k * 24 }}><i style={{ background: c }} /><s>{n}</s><b>{groupCounts[k]}</b></div>
      ))}
      <div className="tile" style={{ left: 979, width: 123 }}><div className="ti-ic" style={{ color: "#a34558" }}><Icon name="user" size={24} /></div><div className="ti-n">{connections ?? 0}</div><div className="ti-l">connections</div></div>
      <div className="tile" style={{ left: 1118, width: 141 }}><img className="ti-ic" src="/figma/briefcase.svg" width={24} height={24} alt="" /><div className="ti-n">{appliedCount}</div><div className="ti-l">applied jobs</div></div>

      <svg className="a" style={{ left: 940, top: 590 }} width="340" height="215" viewBox="940 590 340 215" role="img" aria-label={`Applications by month: ${months.map((m, k) => `${MON[m.getMonth()]} ${perMonth[k]}`).join(", ")}`}>
        <text x="978" y="606" fontSize="15" fontWeight="300" fontFamily="Sunflower" fill="var(--tx)">applications sent per month</text>
        <path d="M973 594V774H1259" stroke="#a34558" strokeWidth="3" fill="none" />
        {[5, 4, 3, 2, 1].map((s) => (
          <text key={s} x="943" y={y((max * s) / 5) + 5} fontSize="15" fontWeight="300" fontFamily="Sunflower" fill="var(--tx)">{(max * s) / 5}</text>
        ))}
        <polyline points={pts} fill="none" stroke="#d18951" strokeWidth="2" />
        {perMonth.map((v, k) => <circle key={k} cx={995 + k * 59} cy={y(v)} r="3" fill="#d18951" />)}
        {months.map((m, k) => (
          <text key={k} x={995 + k * 59} y="793" fontSize="16" fontWeight="300" fontFamily="Sunflower" fill="var(--tx)" textAnchor="middle">{MON[m.getMonth()]}</text>
        ))}
      </svg>
    </Stage>
  );
}
