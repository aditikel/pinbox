// Line icons from the design preview (24x24, stroke = currentColor).
const PATHS = {
  moon: <path d="M20.5 14.2A8.5 8.5 0 019.8 3.5 8.5 8.5 0 1020.5 14.2z" />,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5l1.6 2.3 2.7-.7.9 2.6 2.7.9-.7 2.7 2.3 1.6-2.3 1.6.7 2.7-2.7.9-.9 2.6-2.7-.7L12 21.5l-1.6-2.3-2.7.7-.9-2.6-2.7-.9.7-2.7L2.5 12l2.3-1.6-.7-2.7 2.7-.9.9-2.6 2.7.7z" /></>,
  out: <><path d="M9 3H4v18h5" /><path d="M10 12h11M17 7l5 5-5 5" /></>,
  user: <><circle cx="12" cy="8" r="4.6" /><path d="M3.5 22c.7-4.8 4-7.4 8.5-7.4s7.8 2.6 8.5 7.4" /></>,
  user2: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.7-4.5 3.7-7 8-7s7.3 2.5 8 7" /></>,
  case: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3M3 13h18" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>,
  chain: <><path d="M10 14a4.5 4.5 0 006.4 0l3.2-3.2a4.5 4.5 0 00-6.4-6.4l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 00-6.4 0l-3.2 3.2a4.5 4.5 0 006.4 6.4l1.2-1.2" /></>,
  doc: <><path d="M5 2h10l5 5v15H5z" /><path d="M15 2v5h5M9 12h7M9 16h7" /></>,
  edit: <><path d="M11 4H4v16h16v-7" /><path d="M18.5 2.5l3 3L12 15l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 16h12l1-16M10 10v8M14 10v8" /></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="4" /><path d="M16 5a3 3 0 00-3-3H6a4 4 0 00-4 4v7a3 3 0 003 3" /></>,
  chev: <path d="M9 5l7 7-7 7" />,
  pen: <path d="M3 21l1-4L17 4l3 3L7 20z" />,
  dl: <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />,
  star: <path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4 6.1 20.7l1.3-6.6L2.5 9.5l6.6-.8z" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, filled, size }: { name: IconName; filled?: boolean; size?: number }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true"
      style={{ ...(filled ? { fill: "currentColor" } : null), ...(size ? { width: size, height: size } : null) }}>
      {PATHS[name]}
    </svg>
  );
}
