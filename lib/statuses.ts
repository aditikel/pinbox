// Application statuses and their colors (from the design preview).
export const STATUSES = ["Networking", "Applied", "OA", "Interview", "Offer", "Rejected", "Withdrawn"] as const;
export type Status = (typeof STATUSES)[number];

// [pill background, pill text] in dark theme; bar/legend use the text color.
export const PILL: Record<string, [string, string]> = {
  Applied: ["#44232e", "#e63f6b"],
  OA: ["#804d3d", "#d18951"],
  Interview: ["#273352", "#5a8cd7"],
  Networking: ["#6a5336", "#f6c564"],
  Offer: ["#1d3a29", "#86efac"],
  Rejected: ["#37181d", "#fca5a5"],
  Withdrawn: ["#3a3436", "#d9d9d9"],
};
export const BAR: Record<string, string> = {
  Applied: "#e63f6b", OA: "#d18951", Networking: "#f6c564", Interview: "#5a8cd7", Offer: "#a6c040", Rejected: "#7a3a44", Withdrawn: "#d9d9d9",
};
