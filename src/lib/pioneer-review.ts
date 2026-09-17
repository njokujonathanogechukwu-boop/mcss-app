import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { reportingMonth, serviceYearMonths } from "@/lib/service-year";

/**
 * The organisational benchmarks for regular pioneer service: a monthly
 * average of 50 hours factoring in hour credit, reviewed around 1 March, and
 * 560 hours for the service year, below which the Congregation Service
 * Committee decides whether the pioneer continues.
 *
 * 600 hours — 50 for each of the twelve months — is the full pace, and is what
 * a pioneer still in the year is measured against when projecting to the end of
 * August. 560 stays the floor for continuing.
 */
export const MONTHLY_GOAL = 50;
export const YEARLY_GOAL = 560;
export const FULL_YEAR_GOAL = MONTHLY_GOAL * 12;

export type MonthCell = {
  short: string;
  label: string;
  /** "ahead" = the month has not ended yet, so nothing is expected for it. */
  state: "hours" | "did-not-preach" | "no-report" | "missing" | "ahead";
  hours: number;
  credit: number;
  combined: number;
};

export type PioneerReview = {
  id: string;
  name: string;
  group: string | null;
  months: MonthCell[];
  /** Months of the service year that have already ended. */
  endedMonths: number;
  /**
   * Months the average is taken over: from the first month they reported as a
   * pioneer to the cutoff. Months before they took up pioneer service are not
   * held against them; gaps and no-reports inside the stretch count as zero.
   */
  countedMonths: number;
  fieldHours: number;
  creditHours: number;
  combined: number;
  average: number | null;
  belowPace: boolean;
  /** No pioneer-style report at all yet this service year. */
  noHours: boolean;
  yearComplete: boolean;
  meetsYear: boolean | null;
  meetsFullYear: boolean | null;
  remainingMonths: number;
  /** Where the service year lands if the months left go at the average so far. */
  projected: number | null;
  /** Hours per remaining month that would still reach 560, null once the year is complete. */
  neededPerMonth: number | null;
  /** The same against the full 600-hour pace. */
  neededForFull: number | null;
};

export type PioneerReviewResult = {
  serviceYear: number;
  cutoff: { year: number; month: number };
  rows: PioneerReview[];
};

export async function pioneerReview(serviceYear: number): Promise<PioneerReviewResult> {
  const cutoff = reportingMonth();
  const cutoffKey = cutoff.year * 12 + cutoff.month;
  const months = serviceYearMonths(serviceYear);

  const publishers = await prisma.publisher.findMany({
    where: { pioneerStatus: "REGULAR", status: { in: ["ACTIVE", "IRREGULAR"] } },
    include: {
      group: { select: { number: true } },
      reports: {
        where: {
          OR: [
            { year: serviceYear - 1, month: { gte: 9 } },
            { year: serviceYear, month: { lte: 8 } },
          ],
        },
      },
    },
    orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
  });

  const rows = publishers.map((p) => {
    const reportByIndex = new Map<number, (typeof p.reports)[number]>();
    for (const r of p.reports) {
      const i = months.findIndex((m) => m.year === r.year && m.month === r.month);
      if (i >= 0) reportByIndex.set(i, r);
    }

    let endedMonths = 0;
    let firstPioneerMonth: number | null = null;
    const cells: MonthCell[] = months.map((m, i) => {
      const ended = m.year * 12 + m.month <= cutoffKey;
      if (ended) endedMonths++;
      const report = reportByIndex.get(i);
      const hours = report?.hours ?? 0;
      const credit = report?.creditHours ?? 0;
      const state: MonthCell["state"] = !ended
        ? "ahead"
        : !report
          ? "missing"
          : report.outcome === "NO_REPORT"
            ? "no-report"
            : report.outcome === "DID_NOT_PREACH"
              ? "did-not-preach"
              : "hours";
      if (
        ended &&
        firstPioneerMonth === null &&
        report &&
        (report.hours !== null ||
          report.creditHours !== null ||
          report.pioneerStatusUsed === "REGULAR" ||
          report.pioneerStatusUsed === "SPECIAL")
      ) {
        firstPioneerMonth = i;
      }
      return { short: m.short, label: m.label, state, hours, credit, combined: hours + credit };
    });

    const fieldHours = cells.reduce((s, c) => s + c.hours, 0);
    const creditHours = cells.reduce((s, c) => s + c.credit, 0);
    const combined = fieldHours + creditHours;
    const countedMonths = firstPioneerMonth === null ? 0 : endedMonths - firstPioneerMonth;
    const average = countedMonths > 0 ? combined / countedMonths : null;
    const yearComplete = endedMonths === 12;
    const remainingMonths = 12 - endedMonths;

    return {
      id: p.id,
      name: displayName(p),
      group: p.group ? `Group ${p.group.number}` : null,
      months: cells,
      endedMonths,
      countedMonths,
      fieldHours,
      creditHours,
      combined,
      average,
      belowPace: average !== null && average < MONTHLY_GOAL,
      noHours: countedMonths === 0,
      yearComplete,
      meetsYear: yearComplete ? combined >= YEARLY_GOAL : null,
      meetsFullYear: yearComplete ? combined >= FULL_YEAR_GOAL : null,
      remainingMonths,
      projected:
        average === null || yearComplete ? null : Math.round(combined + average * remainingMonths),
      neededPerMonth: perMonthToReach(YEARLY_GOAL, combined, remainingMonths, yearComplete),
      neededForFull: perMonthToReach(FULL_YEAR_GOAL, combined, remainingMonths, yearComplete),
    } satisfies PioneerReview;
  });

  return { serviceYear, cutoff, rows };
}

/**
 * What each of the months still to come has to carry to land on a target. Zero
 * once the target is already reached, null when there is nothing left to do
 * about it — the year is over.
 */
function perMonthToReach(
  target: number,
  combined: number,
  remainingMonths: number,
  yearComplete: boolean,
): number | null {
  if (yearComplete || remainingMonths === 0) return null;
  if (combined >= target) return 0;
  return Math.ceil(((target - combined) / remainingMonths) * 10) / 10;
}
