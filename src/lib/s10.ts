import "server-only";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { serviceYearMonths, MONTH_NAMES } from "@/lib/service-year";
import { attendanceSummary } from "@/lib/pdf/s88";
import { computeS10Counts, monthIndex } from "@/lib/s10-counts";

export type S10Figures = {
  serviceYear: number;
  weekendAverage: number | null;
  midweekAverage: number | null;
  weekendMeetings: number;
  midweekMeetings: number;
  allActive: string[];
  newInactive: string[];
  reactivated: string[];
  /** The six-month window the active count looks over, as text. */
  activeWindow: string;
};

/**
 * The congregation analysis (S-10) for a service year, computed from what is
 * on file: meeting attendance for the averages, report months for the three
 * publisher figures. Deaf, blind, incarcerated and territory figures are not
 * tracked per publisher, so the page takes them by hand.
 */
export async function s10Figures(serviceYear: number): Promise<S10Figures> {
  const months = serviceYearMonths(serviceYear);

  const [attendance, reports] = await Promise.all([
    attendanceSummary(serviceYear),
    prisma.serviceReport.findMany({
      // A NO_REPORT row records the absence of a report, so it is not one.
      where: { outcome: { in: ["SHARED", "DID_NOT_PREACH"] } },
      select: { publisherId: true, year: true, month: true },
    }),
  ]);

  const reported = new Map<string, number[]>();
  for (const r of reports) {
    const list = reported.get(r.publisherId);
    if (list) list.push(monthIndex(r.year, r.month));
    else reported.set(r.publisherId, [monthIndex(r.year, r.month)]);
  }

  const counts = computeS10Counts(months, reported);
  const ids = [...new Set([...counts.allActive, ...counts.newInactive, ...counts.reactivated])];
  const people = ids.length
    ? await prisma.publisher.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameOf = new Map(people.map((p) => [p.id, displayName(p)]));
  const names = (list: string[]) =>
    list.map((id) => nameOf.get(id) ?? "Former publisher").sort((a, b) => a.localeCompare(b));

  const weekendMeetings = attendance.reduce((t, r) => t + r.weekendMeetings, 0);
  const midweekMeetings = attendance.reduce((t, r) => t + r.midweekMeetings, 0);
  const weekendTotal = attendance.reduce((t, r) => t + r.weekendTotal, 0);
  const midweekTotal = attendance.reduce((t, r) => t + r.midweekTotal, 0);

  const [windowStart, windowEnd] = [months[6], months[11]];

  return {
    serviceYear,
    weekendAverage: weekendMeetings ? Math.round(weekendTotal / weekendMeetings) : null,
    midweekAverage: midweekMeetings ? Math.round(midweekTotal / midweekMeetings) : null,
    weekendMeetings,
    midweekMeetings,
    allActive: names(counts.allActive),
    newInactive: names(counts.newInactive),
    reactivated: names(counts.reactivated),
    activeWindow: `${MONTH_NAMES[windowStart.month - 1]} ${windowStart.year} to ${MONTH_NAMES[windowEnd.month - 1]} ${windowEnd.year}`,
  };
}
