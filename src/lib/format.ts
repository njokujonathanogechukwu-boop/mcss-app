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
  TRANSFERRED_OUT: "Transferred out",
  DECEASED: "Deceased",
};

export const DECISION_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DEFERRED: "Deferred",
};

export const BOOKING_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

/** Pioneers report hours; everyone else reports participation only. */
export function reportsHours(pioneerStatus: string) {
  return pioneerStatus !== "NONE";
}
