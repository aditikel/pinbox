// Normalized company/role key, used to match duplicates (applications.company_key / role_key).
export const key = (s: string) =>
  s.toLowerCase().replace(/\b(inc|llc|corp|co|ltd|the)\b/g, "").replace(/[^a-z0-9]/g, "");
