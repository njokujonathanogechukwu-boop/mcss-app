import { monthLabel } from "@/lib/service-year";

export const monthIndexOf = (year: number, month: number) => year * 12 + (month - 1);

/** Whether an approval covers a given reporting month. Indeterminate (months
 * null) approvals cover every month from their start onward. */
export function auxCovers(
  a: { startYear: number; startMonth: number; months: number | null },
  year: number,
  month: number,
): boolean {
  const idx = monthIndexOf(year, month);
  const start = monthIndexOf(a.startYear, a.startMonth);
  if (idx < start) return false;
  if (a.months == null) return true;
  return idx <= start + a.months - 1;
}

/** Human-readable span, e.g. "December 2026 – February 2027" or "March 2027 onward". */
export function auxPeriodLabel(a: {
  startYear: number;
  startMonth: number;
  months: number | null;
}): string {
  const start = monthLabel(a.startYear, a.startMonth);
  if (a.months == null) return `${start} onward`;
  if (a.months === 1) return start;
  const endIdx = monthIndexOf(a.startYear, a.startMonth) + a.months - 1;
  const endYear = Math.floor(endIdx / 12);
  const endMonth = (endIdx % 12) + 1;
  return `${start} – ${monthLabel(endYear, endMonth)}`;
}

/** The span as month-input values ("2026-09"); end is "" while service is open-ended. */
export function auxSpanInput(a: {
  startYear: number;
  startMonth: number;
  months: number | null;
}): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${a.startYear}-${pad(a.startMonth)}`;
  if (a.months == null) return { start, end: "" };
  const endIdx = monthIndexOf(a.startYear, a.startMonth) + a.months - 1;
  return { start, end: `${Math.floor(endIdx / 12)}-${pad((endIdx % 12) + 1)}` };
}
