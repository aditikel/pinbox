import Link from "next/link";
import { Icon } from "./Icon";
import { ThemeButton } from "./ThemeButton";
import { signOut } from "@/app/auth-actions";

const NAV = [["home", 269], ["pipeline", 397], ["companies", 525], ["resumes", 653]] as const;

export function Sidebar({ current, name }: { current: (typeof NAV)[number][0]; name: string }) {
  return (
    <nav className="sidebar" aria-label="Main">
      <img className="logo logo-d" src="/sidebar-logo-dark.png" alt="Pinbox" />
      <img className="logo logo-l" src="/sidebar-logo-light.png" alt="Pinbox" />
      <div className="wel">welcome,<b>{name}</b></div>
      <div className="rail" />
      {NAV.map(([n, y]) => (
        <span key={n}>
          <div className="dot" style={{ top: y }} />
          <Link href={`/${n}`} className={`nv ${current === n ? "on" : ""}`} style={{ top: y }} aria-current={current === n ? "page" : undefined}>{n}</Link>
        </span>
      ))}
      <ThemeButton />
      <form action={signOut}>
        <button className="tool" style={{ left: 96 }} title="Log out" aria-label="Log out"><Icon name="out" /></button>
      </form>
    </nav>
  );
}

// First name from Google metadata, else the email prefix.
export function displayName(user: { email?: string; user_metadata?: Record<string, any> }) {
  const full = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (full) return String(full).split(" ")[0];
  const p = (user.email ?? "there").split("@")[0];
  return p.charAt(0).toUpperCase() + p.slice(1);
}
