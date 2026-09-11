// The service year runs 1 September to 31 August and is named for the
// year in which it ends: September 2025 falls in service year 2026.

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type ServiceMonth = { year: number; month: number; label: string; short: string };

export function serviceYearOf(year: number, month: number): number {
  return month >= 9 ? year + 1 : year;
}

export function currentServiceYear(now = new Date()): number {
  return serviceYearOf(now.getFullYear(), now.getMonth() + 1);
}

/** The twelve months of a service year, in order from September. */
export function serviceYearMonths(serviceYear: number): ServiceMonth[] {
  const months: ServiceMonth[] = [];
  for (let i = 0; i < 12; i++) {
    const month = ((8 + i) % 12) + 1; // 9,10,11,12,1,...,8
    const year = month >= 9 ? serviceYear - 1 : serviceYear;
    months.push({
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      short: MONTH_SHORT[month - 1],
    });
  }
  return months;
}

export function serviceYearLabel(serviceYear: number): string {
  return `${serviceYear - 1}/${String(serviceYear).slice(2)}`;
}

export function serviceYearRange(serviceYear: number) {
  return {
    start: new Date(Date.UTC(serviceYear - 1, 8, 1)),
    end: new Date(Date.UTC(serviceYear, 7, 31, 23, 59, 59)),
  };
}

/** The month reports are currently being collected for (the one just ended). */
export function reportingMonth(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** A list of selectable service years, newest first. */
export function serviceYearOptions(span = 6): number[] {
  const current = currentServiceYear();
  return Array.from({ length: span }, (_, i) => current - i);
}
