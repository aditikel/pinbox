// Shared by /start (date picker limits) and /api/backfill (validation).
export const MAX_BACKFILL_DAYS = 365;
export const DEFAULT_BACKFILL_DAYS = 90;
/** Most Gmail threads one backfill reads (keeps a run inside the 300 s function limit). */
export const MAX_THREADS = 500;

/** Local-calendar YYYY-MM-DD for the date `daysAgo` days before today. */
export function daysAgo(daysAgo: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
