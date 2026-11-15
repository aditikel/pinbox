// Builds one record per company from applications, email events and touchpoints. No I/O, so it can be unit tested.

export type AppIn = { id: string; company: string; company_key: string; role: string; status: string; created_at: string };
export type EventIn = { application_id: string | null; category: string; occurred_at: string | null; gmail_thread_id: string | null };
export type TouchIn = { id: string; company: string; company_key: string; person: string; person_role: string; kind: string; happened_on: string; notes: string; referral: boolean };
export type ActionIn = { application_id: string | null; due: string | null };

export type TimelineItem = { date: string; title: string; detail: string; color: string; link: string | null };
export type Company = {
  key: string; name: string; favorite: boolean;
  apps: { id: string; role: string; status: string }[];
  rolesApplied: number; touchpoints: number; referral: boolean;
  contacts: { name: string; role: string }[];
  lastTouch: string | null; nextDue: string | null;
  timeline: TimelineItem[];
};

const EVENT_LABEL: Record<string, [string, string]> = {
  applied: ["Application received", "#a34558"],
  oa: ["Online assessment", "#d18951"],
  interview_invite: ["Interview invite received", "#5a8cd7"],
  scheduling: ["Scheduling request", "#5a8cd7"],
  offer: ["Offer received", "#86efac"],
  rejection: ["Application closed", "#e63f6b"],
  coffee_chat: ["Coffee chat", "#d18951"],
};

export function buildCompanies(apps: AppIn[], events: EventIn[], touches: TouchIn[], favorites: string[], actions: ActionIn[]): Company[] {
  const byKey = new Map<string, Company>();
  const get = (key: string, name: string) => {
    let c = byKey.get(key);
    if (!c) {
      c = { key, name, favorite: false, apps: [], rolesApplied: 0, touchpoints: 0, referral: false, contacts: [], lastTouch: null, nextDue: null, timeline: [] };
      byKey.set(key, c);
    }
    return c;
  };

  const appCompany = new Map<string, Company>();
  const appRole = new Map<string, string>();
  // Oldest first, so the company keeps the name from its first application.
  for (const a of [...apps].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    const c = get(a.company_key, a.company);
    c.apps.push({ id: a.id, role: a.role, status: a.status });
    if (a.status !== "Networking") c.rolesApplied++;
    appCompany.set(a.id, c);
    appRole.set(a.id, a.role);
  }

  for (const e of events) {
    const c = e.application_id ? appCompany.get(e.application_id) : undefined;
    const label = EVENT_LABEL[e.category];
    if (!c || !label || !e.occurred_at) continue;
    const date = e.occurred_at.slice(0, 10);
    c.timeline.push({
      date, title: label[0], detail: appRole.get(e.application_id!) || "", color: label[1],
      link: e.gmail_thread_id ? `https://mail.google.com/mail/u/0/#all/${e.gmail_thread_id}` : null,
    });
    if (e.category === "coffee_chat") c.touchpoints++;
    if (!c.lastTouch || date > c.lastTouch) c.lastTouch = date;
  }

  for (const t of touches) {
    const c = get(t.company_key, t.company); // a company can be tracked before any application exists
    c.touchpoints++;
    c.referral ||= t.referral;
    c.timeline.push({ date: t.happened_on, title: `${t.kind} with ${t.person}`, detail: t.notes || t.person_role, color: "#d18951", link: null });
    if (!c.contacts.some((p) => p.name.toLowerCase() === t.person.toLowerCase())) c.contacts.push({ name: t.person, role: t.person_role });
    if (!c.lastTouch || t.happened_on > c.lastTouch) c.lastTouch = t.happened_on;
  }

  for (const a of actions) {
    const c = a.application_id ? appCompany.get(a.application_id) : undefined;
    if (c && a.due && (!c.nextDue || a.due < c.nextDue)) c.nextDue = a.due;
  }

  const fav = new Set(favorites);
  const out = [...byKey.values()];
  for (const c of out) {
    c.favorite = fav.has(c.key);
    c.timeline.sort((x, y) => y.date.localeCompare(x.date)); // newest first
  }
  // Default order (design notes): earliest next action first, then most recent touchpoint, then name.
  return out.sort((a, b) =>
    (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999") ||
    (b.lastTouch ?? "").localeCompare(a.lastTouch ?? "") ||
    a.name.localeCompare(b.name));
}
