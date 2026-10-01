export function fullName(p: { firstName: string; lastName: string }) {
  return `${p.lastName}, ${p.firstName}`;
}

export function displayName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function formatTimeRange(start: Date, end: Date) {
  const same = start.toDateString() === end.toDateString();
  const t = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return same
    ? `${formatDate(start)}  ${t(start)}–${t(end)}`
    : `${formatDateTime(start)} → ${formatDateTime(end)}`;
}

export function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function toDateTimeInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** An uploaded name made safe to store and to put inside a zip. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  const cleaned = base
    .replace(/[<>:"|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120) || "document";
}

export const GENDER_LABELS: Record<string, string> = {
  MALE: "Male",
  FEMALE: "Female",
};

export const APPOINTMENT_LABELS: Record<string, string> = {
  PUBLISHER: "Publisher",
  MINISTERIAL_SERVANT: "Ministerial servant",
  ELDER: "Elder",
};

export const PIONEER_LABELS: Record<string, string> = {
  NONE: "—",
  AUXILIARY: "Auxiliary pioneer",
  REGULAR: "Regular pioneer",
  SPECIAL: "Special pioneer",
};

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  IRREGULAR: "Irregular",
  INACTIVE: "Inactive",
  DISFELLOWSHIPPED: "Disfellowshipped",
  DISASSOCIATED: "Disassociated",
  TRANSFERRED_OUT: "Transferred out",
  DECEASED: "Deceased",
};

export const STANDING_LABELS: Record<string, string> = {
  REPROVED: "Reproved",
  DISFELLOWSHIPPED: "Disfellowshipped",
  DISASSOCIATED: "Disassociated",
  REINSTATED: "Reinstated",
  RESTRICTION: "Restrictions placed",
};

export type BadgeTone = "good" | "warn" | "bad" | "neutral";

/**
 * A removal is the elders' matter (standing:read). Pages anyone else can open
 * leave publishers with these statuses out altogether, rather than showing them
 * without the reason.
 */
export const REMOVAL_STATUSES = ["DISFELLOWSHIPPED", "DISASSOCIATED"] as const;
export const isRemoval = (status: string) => (REMOVAL_STATUSES as readonly string[]).includes(status);

export const STATUS_TONE: Record<string, BadgeTone> = {
  ACTIVE: "good",
  IRREGULAR: "warn",
  INACTIVE: "bad",
  DISFELLOWSHIPPED: "bad",
  DISASSOCIATED: "bad",
  TRANSFERRED_OUT: "neutral",
  DECEASED: "neutral",
};

export const STANDING_TONE: Record<string, BadgeTone> = {
  REPROVED: "warn",
  DISFELLOWSHIPPED: "bad",
  DISASSOCIATED: "bad",
  REINSTATED: "good",
  RESTRICTION: "warn",
};

export const DECISION_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DEFERRED: "Deferred",
};

export const TASK_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export const ANNOUNCEMENT_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Ready to announce",
  ANNOUNCED: "Announced",
};

export const BOOKING_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

/**
 * What a publisher's month means. A publisher with no row at all has not been
 * recorded yet, which is different from NO_REPORT: the secretary has noted
 * that no report came in.
 */
export type ReportOutcome = "SHARED" | "DID_NOT_PREACH" | "NO_REPORT";

export const REPORT_OUTCOMES: ReportOutcome[] = ["SHARED", "DID_NOT_PREACH", "NO_REPORT"];

export const REPORT_OUTCOME_LABELS: Record<ReportOutcome, string> = {
  SHARED: "Shared",
  DID_NOT_PREACH: "Did not preach",
  NO_REPORT: "No report",
};

/** Pioneers report hours; everyone else reports participation only. */
export function reportsHours(pioneerStatus: string) {
  return pioneerStatus !== "NONE";
}
