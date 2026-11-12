import "server-only";
import { prisma } from "@/lib/prisma";
import { MONTH_SHORT, monthLabel } from "@/lib/service-year";
import { congregationSummary, type S1Summary } from "@/lib/pdf/s1";
import {
  getPeriod, lateReportDetails, outstandingLateReports, parseLateKeys, type LateReportDetail,
} from "@/lib/report-periods";
import { statusFacts, statusForMonth } from "@/lib/pioneer-status";
import { reviewedKeys } from "@/lib/report-audit-review";

/**
 * The audit of one month's congregation report before it goes to the branch:
 * every publisher with the report behind their line of the S-1, the months
 * before it to compare against, and anything that looks out of the ordinary.
 * It is read from the same sources as the S-1 itself, and the totals it adds
 * up are checked against the S-1's own, so a difference shows at once.
 */

export type Bucket = "REGULAR" | "AUXILIARY" | "PUBLISHER" | "SPECIAL";

export type AuditCell = {
  outcome: string;
  status: string;
  hours: number | null;
  credit: number | null;
  studies: number;
} | null;

export type Flag = { level: "warn" | "info"; text: string };

export type AuditRow = {
  publisherId: string;
  name: string;
  group: number | null;
  publisherStatus: string;
  report: AuditCell;
  remarks: string | null;
  /** The line of the S-1 this report is counted on this month, or null when it is not counted. */
  counted: Bucket | null;
  /** Why a report on file is not counted this month. */
  notCounted: string | null;
  /** The months before, newest first, matching `AuditResult.history`. */
  history: AuditCell[];
  flags: Flag[];
  /** The category the pioneer records give for this month. */
  expected: string;
  /** The category the month's report is filed under, when there is one. */
  filed: string | null;
  /** Marked by the secretary as looked at and in order. */
  reviewed: boolean;
};

export type Tally = { reports: number; hours: number; studies: number };

export type AuditResult = {
  year: number;
  month: number;
  label: string;
  closed: boolean;
  history: { year: number; month: number; label: string }[];
  rows: AuditRow[];
  late: (LateReportDetail & { counted: Bucket | null })[];
  s1: S1Summary;
  /** What the rows above add up to, line by line, beside what the S-1 says. */
  check: { bucket: Bucket; label: string; audit: Tally; s1: Tally; hoursCount: boolean }[];
  /** Publishers counted active on the S-1 only through "did not share" reports. */
  activeByNoShare: number;
  inactiveLeftOut: number;
};

const BUCKET_OF: Record<string, Bucket> = {
  NONE: "PUBLISHER", AUXILIARY: "AUXILIARY", REGULAR: "REGULAR", SPECIAL: "SPECIAL",
};
export const BUCKET_LABEL: Record<Bucket, string> = {
  REGULAR: "Regular pioneers", AUXILIARY: "Auxiliary pioneers", PUBLISHER: "Publishers", SPECIAL: "Special pioneers",
};
const STATUS_WORD: Record<string, string> = {
  NONE: "a publisher", AUXILIARY: "an auxiliary pioneer", REGULAR: "a regular pioneer", SPECIAL: "a special pioneer",
};
const GONE = ["TRANSFERRED_OUT", "DECEASED", "DISFELLOWSHIPPED", "DISASSOCIATED"];

const shift = (year: number, month: number, by: number) => {
  const d = new Date(Date.UTC(year, month - 1 + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};
const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export async function auditMonth(year: number, month: number, back = 6): Promise<AuditResult> {
  const history = Array.from({ length: back }, (_, i) => {
    const p = shift(year, month, -(i + 1));
    return { ...p, label: `${MONTH_SHORT[p.month - 1]} ${String(p.year).slice(2)}` };
  });
  const months = [{ year, month }, ...history];

  const [period, s1, reports, publishers, reviewed] = await Promise.all([
    getPeriod(year, month),
    congregationSummary(year, month),
    prisma.serviceReport.findMany({
      where: { OR: months.map((m) => ({ year: m.year, month: m.month })) },
      select: {
        publisherId: true, year: true, month: true, outcome: true, pioneerStatusUsed: true,
        hours: true, creditHours: true, bibleStudies: true, remarks: true,
      },
    }),
    prisma.publisher.findMany({
      select: {
        id: true, firstName: true, lastName: true, status: true, pioneerStatus: true,
        group: { select: { number: true } },
      },
    }),
    reviewedKeys(),
  ]);

  const byKey = new Map(reports.map((r) => [`${r.publisherId}|${r.year}|${r.month}`, r]));
  const cell = (id: string, y: number, m: number): AuditCell => {
    const r = byKey.get(`${id}|${y}|${m}`);
    return r
      ? { outcome: r.outcome, status: r.pioneerStatusUsed, hours: r.hours, credit: r.creditHours, studies: r.bibleStudies }
      : null;
  };
  const withReports = new Set(reports.map((r) => r.publisherId));

  // Everyone still in the congregation, and anyone with a report in the window.
  const roster = publishers.filter(
    (p) => withReports.has(p.id) || (!GONE.includes(p.status) && p.status !== "INACTIVE"),
  );
  const inactiveLeftOut = publishers.filter((p) => p.status === "INACTIVE" && !withReports.has(p.id)).length;
  const facts = await statusFacts(roster.map((p) => p.id));
  const onTime = period ? new Set(period.onTimeIds) : null;

  const rows: AuditRow[] = roster.map((p) => {
    const report = cell(p.id, year, month);
    const raw = byKey.get(`${p.id}|${year}|${month}`);
    const past = history.map((h) => cell(p.id, h.year, h.month));
    const shared = report?.outcome === "SHARED";

    let counted: Bucket | null = null;
    let notCounted: string | null = null;
    if (shared && onTime && !onTime.has(p.id)) {
      notCounted = "Came in after this month was submitted, so it counts with a later month";
    } else if (shared) {
      counted = BUCKET_OF[report!.status] ?? "PUBLISHER";
    } else if (report?.outcome === "DID_NOT_PREACH") {
      notCounted = "Did not share in the ministry";
    } else if (report?.outcome === "NO_REPORT") {
      notCounted = "Marked no report";
    } else {
      notCounted = "Not recorded yet";
    }

    const flags: Flag[] = [];
    const f = facts.get(p.id);
    const expected = f ? statusForMonth(f, year, month) : "NONE";
    const pastShared = past.filter((c): c is NonNullable<AuditCell> => c?.outcome === "SHARED");
    const last = past[0];

    if (report && report.outcome !== "NO_REPORT") {
      const st = report.status;
      if (st !== expected) {
        if (st === "AUXILIARY" && expected === "NONE") {
          flags.push({ level: "warn", text: "Counted as an auxiliary pioneer, but no approval covers this month" });
        } else {
          flags.push({
            level: "warn",
            text: `Counted as ${STATUS_WORD[st]}, but the pioneer records make them ${STATUS_WORD[expected]} this month`,
          });
        }
      }
      if (last && last.outcome === "SHARED" && last.status !== st && shared) {
        flags.push({ level: "info", text: `Was ${STATUS_WORD[last.status]} last month` });
      }
    }

    if (shared) {
      const st = report!.status;
      const h = report!.hours;
      if ((st === "REGULAR" || st === "AUXILIARY") && !h) {
        flags.push({ level: "warn", text: "No hours on a pioneer's report" });
      }
      if (st === "NONE" && h) {
        flags.push({ level: "info", text: `${h} hours recorded on a publisher's report; the S-1 does not count them` });
      }
      if (st === "REGULAR" && h) {
        if (h < 30) flags.push({ level: "warn", text: `Only ${h} hours for a regular pioneer` });
        else if (h > 100) flags.push({ level: "warn", text: `${h} hours is unusually high` });
      }
      if (st === "AUXILIARY" && h) {
        if (h < 15) flags.push({ level: "warn", text: `Only ${h} hours for an auxiliary pioneer` });
        else if (h < 30) flags.push({ level: "info", text: `${h} hours: below 30, unless this month's requirement is 15` });
        else if (h > 100) flags.push({ level: "warn", text: `${h} hours is unusually high` });
      }
      if (report!.credit) flags.push({ level: "info", text: `${report!.credit} hours credit` });

      // Against their own recent months.
      const pastHours = pastShared.filter((c) => c.status === st && c.hours != null).map((c) => c.hours!);
      if (h != null && pastHours.length >= 2) {
        const avg = average(pastHours);
        if (Math.abs(h - avg) >= Math.max(20, avg * 0.5)) {
          flags.push({ level: "warn", text: `${h} hours against about ${Math.round(avg)} in recent months` });
        }
      }
      const studies = report!.studies;
      const pastStudies = pastShared.map((c) => c.studies);
      if (pastStudies.length >= 2) {
        const avg = average(pastStudies);
        const max = Math.max(...pastStudies);
        if (studies >= max + 3) {
          flags.push({ level: "warn", text: `${studies} Bible studies, up from ${max === Math.round(avg) ? max : `about ${Math.round(avg)}`}` });
        } else if (studies === 0 && avg >= 2) {
          flags.push({ level: "info", text: `No Bible studies; about ${Math.round(avg)} in recent months` });
        }
      } else if (studies >= 8) {
        flags.push({ level: "warn", text: `${studies} Bible studies` });
      }
      if (p.status === "INACTIVE") flags.push({ level: "info", text: "Marked inactive, but shared this month" });
      if (st === "SPECIAL") flags.push({ level: "info", text: "Special pioneers report to the branch and are left off the S-1" });
    }

    if (report?.outcome === "DID_NOT_PREACH" && (expected === "REGULAR" || expected === "SPECIAL")) {
      flags.push({ level: "warn", text: "A pioneer recorded as not sharing in the ministry" });
    }
    if (!shared && last?.outcome === "SHARED" && !report) {
      flags.push({ level: "info", text: "Not recorded yet; shared last month" });
    }

    return {
      publisherId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      group: p.group?.number ?? null,
      publisherStatus: p.status,
      report,
      remarks: raw?.remarks ?? null,
      counted,
      notCounted,
      history: past,
      flags,
      expected,
      filed: report && report.outcome !== "NO_REPORT" ? report.status : null,
      reviewed: Boolean(reviewed[`${p.id}|${year}|${month}`]),
    };
  });

  rows.sort((a, b) => (a.group ?? 999) - (b.group ?? 999) || a.name.localeCompare(b.name));

  // Late reports rolled into this month's figure.
  const lateWhich = period
    ? parseLateKeys(period.lateKeys)
    : (await outstandingLateReports()).map((r) => ({ publisherId: r.publisherId, year: r.year, month: r.month }));
  const late = (await lateReportDetails(lateWhich)).map((l) => ({
    ...l,
    counted: l.outcome === "SHARED" ? (BUCKET_OF[l.pioneerStatusUsed] ?? "PUBLISHER") : null,
  }));

  const tally = (bucket: Bucket): Tally => {
    const all = [
      ...rows.filter((r) => r.counted === bucket).map((r) => ({ hours: r.report!.hours, studies: r.report!.studies })),
      ...late.filter((l) => l.counted === bucket).map((l) => ({ hours: l.hours, studies: l.bibleStudies })),
    ];
    return {
      reports: all.length,
      hours: all.reduce((t, x) => t + (x.hours ?? 0), 0),
      studies: all.reduce((t, x) => t + x.studies, 0),
    };
  };
  const s1Row = (b: Bucket): Tally => {
    const r = b === "PUBLISHER" ? s1.rows.publishers : b === "AUXILIARY" ? s1.rows.auxiliary : b === "REGULAR" ? s1.rows.regular : s1.rows.special;
    return { reports: r.reports, studies: r.studies, hours: "hours" in r ? (r as Tally).hours : 0 };
  };
  const check = (["PUBLISHER", "AUXILIARY", "REGULAR"] as Bucket[]).map((b) => ({
    bucket: b,
    label: BUCKET_LABEL[b],
    audit: tally(b),
    s1: s1Row(b),
    hoursCount: b !== "PUBLISHER",
  }));

  // The S-1's active publishers include anyone with a "did not share" report in
  // the six months; how many are counted on that alone.
  const window6 = [{ year, month }, ...history.slice(0, 5)];
  const sharedIn6 = new Set(
    reports.filter((r) => r.outcome === "SHARED" && window6.some((w) => w.year === r.year && w.month === r.month)).map((r) => r.publisherId),
  );
  const noShareOnly = new Set(
    reports
      .filter((r) => r.outcome === "DID_NOT_PREACH" && window6.some((w) => w.year === r.year && w.month === r.month))
      .map((r) => r.publisherId)
      .filter((id) => !sharedIn6.has(id)),
  );
  const goneIds = new Set(publishers.filter((p) => GONE.includes(p.status)).map((p) => p.id));
  const activeByNoShare = back >= 5 ? [...noShareOnly].filter((id) => !goneIds.has(id)).length : 0;

  return {
    year,
    month,
    label: monthLabel(year, month),
    closed: period !== null,
    history,
    rows,
    late,
    s1,
    check,
    activeByNoShare,
    inactiveLeftOut,
  };
}
