import Link from "next/link";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase";
import { Stage } from "@/components/Stage";
import { Sidebar, displayName } from "@/components/Sidebar";
import { Icon } from "@/components/Icon";
import { AddEntry } from "./AddEntry";
import { completeAction } from "./actions";
import "../app.css";
import "./home.css";

// Upcoming filter chips -> event categories (from lib/classify.ts). No meetup category is produced yet.
const FILTERS = ["All", "Interview", "Meetups", "Coffee"] as const;
const CATS: Record<string, string[]> = {
  All: ["interview_invite", "scheduling", "coffee_chat", "meetup"],
  Interview: ["interview_invite", "scheduling"],
  Meetups: ["meetup"],
  Coffee: ["coffee_chat"],
};
const EV_STYLE: Record<string, [string, string]> = {
  interview_invite: ["Interview", "#a34558"], scheduling: ["Interview", "#e63f6b"],
  coffee_chat: ["Coffee Chat", "#d18951"], meetup: ["Meetup", "#f6c564"],
};
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
  const filter = uf in CATS ? uf : "All";
  const supabase = await serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const [{ data: actions }, { data: upcoming }, { data: apps }, { count: connections }, { data: resumeRows }] = await Promise.all([
    supabase.from("actions")
      .select("id,title,due,priority,applications(company,role)")
      .eq("done", false)
      .or(`snoozed_until.is.null,snoozed_until.lte.${today}`)
      .order("due", { ascending: true, nullsFirst: false })
      .limit(50),
    supabase.from("events")
      .select("id,category,occurred_at,fields,applications(company,role)")
      .in("category", CATS[filter])
      .gte("occurred_at", new Date().toISOString())
      .order("occurred_at")
      .limit(3),
    supabase.from("applications").select("status,date_applied,created_at"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("category", "coffee_chat"),
    supabase.from("resumes").select("id,label,is_default").order("uploaded_at", { ascending: false }),
  ]);
  const resumes = (resumeRows ?? []).map((r) => ({ id: r.id, label: r.label, isDefault: r.is_default }));

  const A = apps ?? [];
  const T = actions ?? [];
  const E = upcoming ?? [];

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
      <Link className="pill" href="/pipeline" style={{ left: 731, top: 74 }}>Edit entries</Link>
      <AddEntry resumes={resumes} />

      <section className="ag" aria-label="Daily agenda">
        <div className="blk ag-head"><span style={{ left: 35 }}>task</span><span style={{ left: 345 }}>priority</span><span style={{ left: 555 }}>due</span></div>
        <ul className="ag-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {Array.from({ length: slots }, (_, k) => {
            const t = T[k];
            if (!t) return <li key={k} className="blk">{k === 0 && <div className="nodata" style={{ top: 26 }}>Nothing due. Add an entry to start your agenda.</div>}</li>;
            const app = (Array.isArray(t.applications) ? t.applications[0] : t.applications) as { company: string; role: string } | null;
            const p = ["high", "med", "low"].includes(t.priority) ? t.priority : "med";
            return (
              <li key={t.id} className="blk tk">
                <form action={completeAction.bind(null, t.id)}>
                  <button className="cb" aria-label={`Mark "${t.title}" done`} title="Mark done" />
                </form>
                <div className="tt">{t.title}</div>
                <div className="su">{app ? [app.company, app.role].filter(Boolean).join(" ") : "Personal to-do"}</div>
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
            const [label, color] = EV_STYLE[e.category] ?? ["Event", "#e63f6b"];
            const app = (Array.isArray(e.applications) ? e.applications[0] : e.applications) as { company: string; role: string } | null;
            const f = (e.fields ?? {}) as { company?: string; role?: string; round?: string };
            const at = new Date(e.occurred_at!);
            return (
              <div key={e.id}>
                <div className="up-dot" style={{ top: top + 8, background: color }} />
                {k < E.length - 1 && <div className="up-seg" style={{ top: top + 18, background: color }} />}
                <div className="up" style={{ top }}>
                  <div className="dt">
                    <div className="d1" style={{ color }}>{at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                    <div className="d2">{at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                  <div className="ev">
                    <div className="e1">{label} · {app?.company ?? f.company ?? ""}</div>
                    <div className="e2" style={{ color }}>{[app?.role ?? f.role, f.round].filter(Boolean).join(" - ")}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <div className="nodata" style={{ left: 322, top: 640, width: 520, textAlign: "left" }}>No upcoming events in this category.</div>
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
        <text x="978" y="606" fontSize="15" fontWeight="300" fontFamily="Sunflower" fill="var(--tx)">number applied by month</text>
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
