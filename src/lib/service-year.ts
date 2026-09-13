// The service year runs 1 September to 31 August and is named for the
// year in which it ends: September 2025 falls in service year 2026.

/**
 * Month boundaries belong to the congregation, not to the host. Vercel runs
 * UTC and Maitama is UTC+1, so reading the month off the server clock puts
 * every "this month" calculation one month behind for the first hour of each
 * month — exactly when reports are being collected.
 */
export const CONGREGATION_TIMEZONE = "Africa/Lagos";

/** The calendar year and month at the congregation, whatever timezone the host is in. */
function calendarParts(now: Date): { year: number; month: number } {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONGREGATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);
  return { year, month };
}

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
  const { year, month } = calendarParts(now);
  return serviceYearOf(year, month);
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
  const { year, month } = calendarParts(now);
  // month - 2 steps back one month and lets Date.UTC roll January into the
  // previous December.
  const d = new Date(Date.UTC(year, month - 2, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** A list of selectable service years, newest first. */
export function serviceYearOptions(span = 6): number[] {
  const current = currentServiceYear();
  return Array.from({ length: span }, (_, i) => current - i);
}
