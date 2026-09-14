// Pure core of the congregation analysis (S-10), kept free of server imports
// so the counting rules can be exercised on their own.

/** Months since year zero, so a gap between two report months is a subtraction. */
export const monthIndex = (year: number, month: number) => year * 12 + (month - 1);

export type S10Counts = {
  allActive: string[];
  newInactive: string[];
  reactivated: string[];
};

/**
 * The three publisher figures the hub's S-10 asks for, by its own definitions:
 *
 * - All active: reported at least once in the last six months of the service
 *   year (the window the hub counts over when the year is being closed).
 * - New inactive: the publisher's first stretch of six consecutive months
 *   without a report closes inside the service year. A first stretch closing
 *   in an earlier year means they went inactive then, and they are excluded.
 * - Reactivated: reported in a month of the service year after at least six
 *   consecutive missing months. The same person may also be new inactive.
 */
export function computeS10Counts(
  syMonths: { year: number; month: number }[],
  reported: Map<string, number[]>,
): S10Counts {
  const syStart = monthIndex(syMonths[0].year, syMonths[0].month);
  const syEnd = monthIndex(syMonths[11].year, syMonths[11].month);
  const allActive: string[] = [];
  const newInactive: string[] = [];
  const reactivated: string[] = [];

  for (const [id, months] of reported) {
    const sorted = [...new Set(months)].sort((a, b) => a - b);
    const has = new Set(sorted);

    if (sorted.some((m) => m > syEnd - 6 && m <= syEnd)) allActive.push(id);

    let streak = 0;
    let firstGapEnd: number | null = null;
    for (let m = sorted[0] + 1; m <= syEnd; m++) {
      streak = has.has(m) ? 0 : streak + 1;
      if (streak === 6) {
        firstGapEnd = m;
        break;
      }
    }
    if (firstGapEnd !== null && firstGapEnd >= syStart) newInactive.push(id);

    if (sorted.some((m, i) => i > 0 && m >= syStart && m <= syEnd && m - sorted[i - 1] >= 7)) {
      reactivated.push(id);
    }
  }

  return { allActive, newInactive, reactivated };
}
