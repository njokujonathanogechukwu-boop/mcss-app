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

/**
 * The month each regular pioneer began serving, as the secretary records it,
 * keyed by publisher: "2026-01". Held as one congregation setting, so it needs
 * no change to the database. With it the review measures a pioneer appointed
 * part way through a year only from that month, against targets scaled to the
 * months served; without it the start is read from the first pioneer report.
 */
export const PIONEER_STARTS_KEY = "pioneers:regularStart";

export async function loadPioneerStarts(): Promise<Record<string, { year: number; month: number }>> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: PIONEER_STARTS_KEY } });
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    const out: Record<string, { year: number; month: number }> = {};
    for (const [id, value] of Object.entries(parsed ?? {})) {
      const match = typeof value === "string" ? /^(\d{4})-(\d{1,2})$/.exec(value) : null;
      const month = match ? Number(match[2]) : 0;
      if (match && month >= 1 && month <= 12) out[id] = { year: Number(match[1]), month };
    }
    return out;
  } catch {
    return {};
  }
}

export async function setPioneerStart(publisherId: string, start: { year: number; month: number } | null) {
  const row = await prisma.congregationSetting.findUnique({ where: { key: PIONEER_STARTS_KEY } });
  let all: Record<string, string> = {};
  try {
    all = row ? (JSON.parse(row.value) as Record<string, string>) : {};
  } catch {
    all = {};
  }
  if (start) all[publisherId] = `${start.year}-${start.month}`;
  else delete all[publisherId];
  const value = JSON.stringify(all);
  await prisma.congregationSetting.upsert({
    where: { key: PIONEER_STARTS_KEY },
    update: { value },
    create: { key: PIONEER_STARTS_KEY, value },
  });
}

/**
 * The year's two targets for months served: the full pace of 50 a month, and
 * the floor for continuing, 560 across twelve months and the same share of it
 * for fewer.
 */
export function targetsFor(servedMonths: number): { full: number; floor: number } {
  return { full: MONTHLY_GOAL * servedMonths, floor: Math.round((YEARLY_GOAL * servedMonths) / 12) };
}

export type MonthCell = {
  short: string;
  label: string;
  /**
   * "ahead" = the month has not ended yet, so nothing is expected for it;
   * "before" = before the recorded start of pioneer service, so not counted.
   */
  state: "hours" | "did-not-preach" | "no-report" | "missing" | "ahead" | "before";
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
  /** The start recorded by the secretary, or null when it is read from the reports. */
  startedOn: { year: number; month: number } | null;
  /** Months of this service year from the start: twelve for a full year. */
  servedMonths: number;
  /** The floor for continuing, scaled to the months served (560 for a full year). */
  yearTarget: number;
  /** The full pace for the months served (600 for a full year). */
  fullTarget: number;
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

  const [publishers, starts] = await Promise.all([prisma.publisher.findMany({
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
  }), loadPioneerStarts()]);

  const firstKey = months[0].year * 12 + months[0].month;
  const lastKey = months[11].year * 12 + months[11].month;

  // A pioneer whose recorded start falls after this service year was not one in it.
  const rows = publishers.filter((p) => {
    const start = starts[p.id];
    return !start || start.year * 12 + start.month <= lastKey;
  }).map((p) => {
    const startedOn = starts[p.id] ?? null;
    // Where in this year's twelve months the recorded service begins: 0 when it
    // began before September.
    const startIndex = startedOn ? Math.max(0, startedOn.year * 12 + startedOn.month - firstKey) : null;
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
      if (startIndex !== null && i < startIndex) {
        return { short: m.short, label: m.label, state: "before", hours: report?.hours ?? 0, credit: report?.creditHours ?? 0, combined: 0 };
      }
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
        startIndex === null &&
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

    // Hours from before the recorded start — as an auxiliary pioneer, say — are
    // not regular pioneer hours and are left out of the totals.
    const counted = cells.filter((c) => c.state !== "before");
    const fieldHours = counted.reduce((s, c) => s + c.hours, 0);
    const creditHours = counted.reduce((s, c) => s + c.credit, 0);
    const combined = fieldHours + creditHours;
    const from = startIndex ?? firstPioneerMonth;
    const countedMonths = from === null ? 0 : Math.max(0, endedMonths - from);
    const servedMonths = startIndex === null ? 12 : 12 - startIndex;
    const { full: fullTarget, floor: yearTarget } = targetsFor(servedMonths);
    const average = countedMonths > 0 ? combined / countedMonths : null;
    const yearComplete = endedMonths === 12;
    // The months still to come that count: none before a recorded start that
    // has not been reached yet.
    const remainingMonths = 12 - Math.max(endedMonths, startIndex ?? 0);

    return {
      id: p.id,
      name: displayName(p),
      group: p.group ? `Group ${p.group.number}` : null,
      months: cells,
      endedMonths,
      countedMonths,
      startedOn,
      servedMonths,
      yearTarget,
      fullTarget,
      fieldHours,
      creditHours,
      combined,
      average,
      belowPace: average !== null && average < MONTHLY_GOAL,
      // A start recorded for a month not yet ended has nothing to show yet.
      noHours: countedMonths === 0 && !(startIndex !== null && startIndex >= endedMonths),
      yearComplete,
      meetsYear: yearComplete ? combined >= yearTarget : null,
      meetsFullYear: yearComplete ? combined >= fullTarget : null,
      remainingMonths,
      projected:
        average === null || yearComplete ? null : Math.round(combined + average * remainingMonths),
      neededPerMonth: perMonthToReach(yearTarget, combined, remainingMonths, yearComplete),
      neededForFull: perMonthToReach(fullTarget, combined, remainingMonths, yearComplete),
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
