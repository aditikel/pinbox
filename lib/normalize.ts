// Normalized company/role key, used to match duplicates (applications.company_key / role_key).
export const key = (s: string) =>
  s.toLowerCase().replace(/\b(inc|llc|corp|co|ltd|the)\b/g, "").replace(/[^a-z0-9]/g, "");

// Trailing words that don't change which company is meant ("FTI Consulting" = "FTI", "Jane Street Capital" = "Jane Street").
const GENERIC = new Set(["inc", "llc", "corp", "co", "ltd", "the", "and", "consulting", "group", "holdings", "technologies", "technology",
  "partners", "llp", "lp", "plc", "company", "corporation", "incorporated", "international", "global", "solutions", "services", "labs", "capital"]);

/**
 * Looser company identity used only to find an existing company before creating a new one.
 * Drops generic trailing words, but always keeps the first word ("Capital One" stays "capitalone").
 */
export function canon(s: string): string {
  const words = s.toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length > 1 && words[0] === "the") words.shift();
  while (words.length > 1 && GENERIC.has(words[words.length - 1])) words.pop();
  return words.filter((w, i) => i === 0 || !GENERIC.has(w)).join("");
}
