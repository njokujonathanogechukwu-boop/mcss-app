import "server-only";
import { prisma } from "@/lib/prisma";
import { calendarMonth, reportingMonth } from "@/lib/service-year";

/**
 * Closing a month records that the congregation's report went to the branch
 * office. From that moment, a report that arrives for the closed month is
 * "late": it is still filed against the month it covers, but it rolls into the
 * next month's submitted figure so the branch sees it, and it is marked as a
 * late report rather than counted twice.
 *
 * Lateness is decided by the snapshot taken at close (`onTimeIds`), not by
 * timestamps, so a publisher who was marked "no report" at close and then
 * reports late is correctly treated as late.
 */

const SUBSTANTIVE = ["SHARED", "DID_NOT_PREACH"] as const;

/** A report's identity across months, used to record which late ones are absorbed. */
export function reportKey(publisherId: string, year: number, month: number): string {
  return `${publisherId}|${year}|${month}`;
}

/** The fields the S-1 needs to bucket a report. */
export type S1Row = {
  pioneerStatusUsed: string;
  bibleStudies: number;
  hours: number | null;
};

const S1_SELECT = {
  publisherId: true,
  year: true,
  month: true,
  outcome: true,
  pioneerStatusUsed: true,
  bibleStudies: true,
  hours: true,
} as const;

export type Period = {
  year: number;
  month: number;
  submittedAt: Date;
  submittedById: string | null;
  onTimeIds: string[];
  lateKeys: string[];
  note: string | null;
};

export async function getPeriod(year: number, month: number): Promise<Period | null> {
  return prisma.reportPeriod.findUnique({ where: { year_month: { year, month } } });
}

export async function isClosed(year: number, month: number): Promise<boolean> {
  return (await getPeriod(year, month)) !== null;
}

const COLLECTING_KEY = "collectingMonth";

/**
 * The month the group links are collecting for. Until the secretary chooses
 * otherwise it is the month just ended, which is what the congregation is
 * normally chasing. It is a setting rather than a rule because the links must
 * follow the congregation's own pace: some months are sent to the branch early
 * and the next month opens before the calendar says so.
 */
export async function collectingMonth(): Promise<{ year: number; month: number }> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: COLLECTING_KEY } });
  const match = /^(\d{4})-(\d{1,2})$/.exec(row?.value ?? "");
  const month = match ? Number(match[2]) : 0;
  if (match && month >= 1 && month <= 12) return { year: Number(match[1]), month };
  return reportingMonth();
}

export async function setCollectingMonth(year: number, month: number): Promise<void> {
  await prisma.congregationSetting.upsert({
    where: { key: COLLECTING_KEY },
    update: { value: `${year}-${month}` },
    create: { key: COLLECTING_KEY, value: `${year}-${month}` },
  });
}

export type LateReport = S1Row & {
  publisherId: string;
  year: number;
  month: number;
  outcome: string;
  key: string;
};

/**
 * Every report that arrived for an already-closed month after that month was
 * submitted, and has not yet been rolled into a later submission. These are the
 * reports waiting to be added to the next month the secretary closes.
 */
export async function outstandingLateReports(): Promise<LateReport[]> {
  const [periods, cleared] = await Promise.all([
    prisma.reportPeriod.findMany({
      select: { year: true, month: true, onTimeIds: true, lateKeys: true },
    }),
    clearedLateKeys(),
  ]);
  if (periods.length === 0) return [];

  // Absorbed into an earlier submission, or cleared by the secretary: either
  // way it does not roll into the next month closed.
  const absorbed = new Set<string>(cleared);
  for (const p of periods) for (const k of p.lateKeys) absorbed.add(k);
  const onTimeByPeriod = new Map(periods.map((p) => [`${p.year}-${p.month}`, new Set(p.onTimeIds)]));

  const reports = await prisma.serviceReport.findMany({
    where: {
      outcome: { in: [...SUBSTANTIVE] },
      OR: periods.map((p) => ({ year: p.year, month: p.month })),
    },
    select: S1_SELECT,
  });

  const out: LateReport[] = [];
  for (const r of reports) {
    const onTime = onTimeByPeriod.get(`${r.year}-${r.month}`);
    if (!onTime) continue; // activity month is not closed
    if (onTime.has(r.publisherId)) continue; // they reported before the close
    const key = reportKey(r.publisherId, r.year, r.month);
    if (absorbed.has(key)) continue; // already rolled into an earlier submission
    out.push({
      publisherId: r.publisherId,
      year: r.year,
      month: r.month,
      outcome: r.outcome,
      key,
      pioneerStatusUsed: r.pioneerStatusUsed,
      bibleStudies: r.bibleStudies,
      hours: r.hours,
    });
  }
  return out;
}

export type S1Source = {
  /** Every shared report to count in this month's congregation figure. */
  rows: S1Row[];
  /** How many of those were rolled in late from earlier months. */
  lateCount: number;
  closed: boolean;
  closedAt: Date | null;
};

/**
 * The reports behind one month's S-1. For an open month this is everything
 * shared so far plus the late reports still outstanding; for a closed month it
 * reconstructs exactly what was submitted (on-time publishers plus the late
 * reports absorbed at close).
 */
export async function reportsForS1(year: number, month: number): Promise<S1Source> {
  const period = await getPeriod(year, month);

  if (!period) {
    const onTime = await prisma.serviceReport.findMany({
      where: { year, month, outcome: "SHARED" },
      select: S1_SELECT,
    });
    const late = (await outstandingLateReports()).filter((r) => r.outcome === "SHARED");
    return {
      rows: [...onTime.map(toRow), ...late.map(toRow)],
      lateCount: late.length,
      closed: false,
      closedAt: null,
    };
  }

  const onTime = await prisma.serviceReport.findMany({
    where: { year, month, outcome: "SHARED", publisherId: { in: period.onTimeIds } },
    select: S1_SELECT,
  });
  const late = await fetchSharedByKeys(period.lateKeys);
  return {
    rows: [...onTime.map(toRow), ...late.map(toRow)],
    lateCount: late.length,
    closed: true,
    closedAt: period.submittedAt,
  };
}

function toRow(r: { pioneerStatusUsed: string; bibleStudies: number; hours: number | null }): S1Row {
  return { pioneerStatusUsed: r.pioneerStatusUsed, bibleStudies: r.bibleStudies, hours: r.hours };
}

async function fetchSharedByKeys(keys: string[]): Promise<S1Row[]> {
  if (keys.length === 0) return [];
  const parsed = keys
    .map((k) => k.split("|"))
    .filter((parts) => parts.length === 3)
    .map(([publisherId, y, m]) => ({ publisherId, year: Number(y), month: Number(m) }));
  if (parsed.length === 0) return [];
  const rows = await prisma.serviceReport.findMany({
    where: {
      outcome: "SHARED",
      OR: parsed.map((p) => ({ publisherId: p.publisherId, year: p.year, month: p.month })),
    },
    select: S1_SELECT,
  });
  return rows.map(toRow);
}

/**
 * Submit a month to the branch: freeze who had reported on time and absorb
 * every outstanding late report into this month's figure so it is counted once
 * here and never rolls again.
 */
export async function closeMonth(
  year: number,
  month: number,
  submittedById: string | null,
  note?: string | null,
): Promise<{ onTimeCount: number; lateCount: number }> {
  const existing = await getPeriod(year, month);

  let onTimeIds = existing?.onTimeIds;
  if (!onTimeIds) {
    const substantive = await prisma.serviceReport.findMany({
      where: { year, month, outcome: { in: [...SUBSTANTIVE] } },
      select: { publisherId: true },
    });
    onTimeIds = substantive.map((r) => r.publisherId);
  }

  const outstanding = await outstandingLateReports();
  const lateKeys = existing
    ? [...new Set([...existing.lateKeys, ...outstanding.map((r) => r.key)])]
    : outstanding.map((r) => r.key);

  await prisma.reportPeriod.upsert({
    where: { year_month: { year, month } },
    create: { year, month, submittedById, onTimeIds, lateKeys, note: note ?? null },
    update: { submittedAt: new Date(), submittedById, onTimeIds, lateKeys, note: note ?? null },
  });

  // Closing the month the group links are collecting moves them on by one, so
  // an overseer's link is never left pointing at a month that has gone to the
  // branch. Never ahead of the month the congregation is living in, though.
  const collecting = await collectingMonth();
  if (collecting.year === year && collecting.month === month) {
    const next = new Date(Date.UTC(year, month, 1));
    const now = calendarMonth();
    if (next.getUTCFullYear() * 12 + next.getUTCMonth() + 1 <= now.year * 12 + now.month) {
      await setCollectingMonth(next.getUTCFullYear(), next.getUTCMonth() + 1);
    }
  }

  return { onTimeCount: onTimeIds.length, lateCount: lateKeys.length };
}

/** Undo a close: the month becomes open again and its late reports roll free. */
export async function reopenMonth(year: number, month: number): Promise<void> {
  await prisma.reportPeriod.deleteMany({ where: { year, month } });
}

export type LateReportDetail = {
  key: string;
  publisherId: string;
  name: string;
  group: string | null;
  year: number;
  month: number;
  outcome: string;
  pioneerStatusUsed: string;
  bibleStudies: number;
  hours: number | null;
  remarks: string | null;
  /** When the report was last entered — after its month had gone to the branch. */
  receivedAt: Date;
};

/**
 * The late reports behind a count, with whose they are and what they say:
 * the ones waiting to roll into the next month closed, or, given a closed
 * month's late keys, the ones it absorbed. Oldest month first.
 */
export async function lateReportDetails(
  which: { publisherId: string; year: number; month: number }[],
): Promise<LateReportDetail[]> {
  if (which.length === 0) return [];
  const rows = await prisma.serviceReport.findMany({
    where: { OR: which.map((w) => ({ publisherId: w.publisherId, year: w.year, month: w.month })) },
    select: {
      publisherId: true, year: true, month: true, outcome: true, pioneerStatusUsed: true,
      bibleStudies: true, hours: true, remarks: true, updatedAt: true,
      publisher: { select: { firstName: true, lastName: true, group: { select: { number: true } } } },
    },
  });
  return rows
    .map((r) => ({
      key: reportKey(r.publisherId, r.year, r.month),
      publisherId: r.publisherId,
      name: `${r.publisher.firstName} ${r.publisher.lastName}`,
      group: r.publisher.group ? `Group ${r.publisher.group.number}` : null,
      year: r.year,
      month: r.month,
      outcome: r.outcome,
      pioneerStatusUsed: r.pioneerStatusUsed,
      bibleStudies: r.bibleStudies,
      hours: r.hours,
      remarks: r.remarks,
      receivedAt: r.updatedAt,
    }))
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month) || a.name.localeCompare(b.name));
}

/** A closed month's late keys back into the reports they name. */
export function parseLateKeys(keys: string[]): { publisherId: string; year: number; month: number }[] {
  return keys
    .map((k) => k.split("|"))
    .filter((parts) => parts.length === 3)
    .map(([publisherId, y, m]) => ({ publisherId, year: Number(y), month: Number(m) }));
}

// ------------------------------------------------------- cleared late reports

/**
 * Late reports the secretary has cleared: dealt with some other way — entered
 * on the branch's site by hand, say — so they no longer roll into the next
 * month closed. Held as one congregation setting of report keys, so it needs
 * no change to the database, and a cleared report can be put back.
 */
const CLEARED_LATE_KEY = "reports:clearedLate";

export async function clearedLateKeys(): Promise<string[]> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: CLEARED_LATE_KEY } });
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export async function setLateCleared(keys: string[], cleared: boolean): Promise<void> {
  const current = new Set(await clearedLateKeys());
  for (const k of keys) {
    if (cleared) current.add(k);
    else current.delete(k);
  }
  const value = JSON.stringify([...current]);
  await prisma.congregationSetting.upsert({
    where: { key: CLEARED_LATE_KEY },
    update: { value },
    create: { key: CLEARED_LATE_KEY, value },
  });
}

/**
 * Cleared late reports still waiting to be counted somewhere: not yet absorbed
 * by a closed month, so putting one back makes it roll in again.
 */
export async function clearedLateReports(): Promise<{ publisherId: string; year: number; month: number }[]> {
  const [cleared, periods] = await Promise.all([
    clearedLateKeys(),
    prisma.reportPeriod.findMany({ select: { lateKeys: true } }),
  ]);
  const absorbed = new Set(periods.flatMap((p) => p.lateKeys));
  return parseLateKeys(cleared.filter((k) => !absorbed.has(k)));
}

// ------------------------------------------------------------------ the lock

/**
 * The reports a submitted month carries, which are locked: every report that
 * was on file when its own month went to the branch, and every late report a
 * later month absorbed when it went. They are not changed or removed until the
 * month that counted them is reopened. A report still missing from a closed
 * month is not locked: entering it is how a late report comes in, and it is
 * locked in turn once the month that counts it is closed.
 */
export async function lockedReportKeys(): Promise<Set<string>> {
  const periods = await prisma.reportPeriod.findMany({
    select: { year: true, month: true, onTimeIds: true, lateKeys: true },
  });
  const keys = new Set<string>();
  for (const p of periods) {
    for (const id of p.onTimeIds) keys.add(reportKey(id, p.year, p.month));
    for (const k of p.lateKeys) keys.add(k);
  }
  return keys;
}

/** Why a locked report cannot be changed, in the words every form uses. */
export function lockedMessage(name: string, label: string): string {
  return `${name}'s ${label} report was submitted to the branch and is locked. Reopen the month to change it.`;
}
