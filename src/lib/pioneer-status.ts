import "server-only";
import { prisma } from "@/lib/prisma";
import { auxCovers } from "@/lib/auxiliary";
import { loadPioneerStarts } from "@/lib/pioneer-review";

export type MonthStatus = "NONE" | "AUXILIARY" | "REGULAR" | "SPECIAL";

/** What decides a publisher's standing in any one month. */
export type StatusFacts = {
  /** Their standing today. */
  pioneerStatus: string;
  auxApprovals: { startYear: number; startMonth: number; months: number | null }[];
  /** When regular (or special) pioneer service began, as the secretary recorded it. */
  regularStart: { year: number; month: number } | null;
};

/**
 * A publisher's standing in a given month, as the S-1 counts it — never simply
 * their standing today. A regular or special pioneer is one only from the month
 * their service began, where that is recorded; before it, and for everyone
 * else, an auxiliary pioneer is one in the months an approval covers (or, for
 * one whose approvals were never recorded, while marked auxiliary).
 */
export function statusForMonth(f: StatusFacts, year: number, month: number): MonthStatus {
  const at = year * 12 + (month - 1);
  if (f.pioneerStatus === "REGULAR" || f.pioneerStatus === "SPECIAL") {
    const start = f.regularStart ? f.regularStart.year * 12 + (f.regularStart.month - 1) : null;
    if (start === null || at >= start) return f.pioneerStatus;
  }
  if (f.auxApprovals.some((a) => auxCovers(a, year, month))) return "AUXILIARY";
  if (f.pioneerStatus === "AUXILIARY" && f.auxApprovals.length === 0) return "AUXILIARY";
  return "NONE";
}

/**
 * The standing to store on a report being saved. Regular and special pioneer
 * service follow the month; otherwise the auxiliary tick decides, when the
 * form offers one. A report already on file as a regular pioneer's is kept so
 * for a publisher no longer pioneering, whose service has no recorded start to
 * judge it by: it is their history, not a mistake.
 */
export function statusToStore(
  f: StatusFacts,
  year: number,
  month: number,
  opts: { shared: boolean; auxTicked?: boolean; existing?: string | null },
): MonthStatus {
  const base = statusForMonth(f, year, month);
  const pioneeringNow = f.pioneerStatus === "REGULAR" || f.pioneerStatus === "SPECIAL";
  if (
    (opts.existing === "REGULAR" || opts.existing === "SPECIAL") &&
    base !== "REGULAR" && base !== "SPECIAL" && !pioneeringNow
  ) {
    return opts.existing;
  }
  if (base === "REGULAR" || base === "SPECIAL") return base;
  if (!opts.shared) return base === "AUXILIARY" ? "AUXILIARY" : "NONE";
  if (opts.auxTicked === undefined) return base;
  return opts.auxTicked ? "AUXILIARY" : "NONE";
}

/** The facts for the given publishers, read in one pass. */
export async function statusFacts(publisherIds: string[]): Promise<Map<string, StatusFacts>> {
  const [rows, starts] = await Promise.all([
    prisma.publisher.findMany({
      where: { id: { in: publisherIds } },
      select: {
        id: true,
        pioneerStatus: true,
        auxApprovals: { select: { startYear: true, startMonth: true, months: true } },
      },
    }),
    loadPioneerStarts(),
  ]);
  return new Map(
    rows.map((r) => [r.id, { pioneerStatus: r.pioneerStatus, auxApprovals: r.auxApprovals, regularStart: starts[r.id] ?? null }]),
  );
}

/**
 * Puts a publisher's reports in step with their recorded start of regular
 * pioneer service: months before it that were stored as a regular pioneer's
 * become auxiliary (when hours were reported, or an approval covers the
 * month) or a publisher's, and months from it on become a regular pioneer's.
 * The figures are not touched, only which line of the S-1 they belong to —
 * including in months already submitted, whose figure on the branch's site
 * may then need the same correction. Returns how many reports moved.
 */
export async function realignPioneerReports(publisherId: string): Promise<{ moved: number; months: string[] }> {
  const facts = (await statusFacts([publisherId])).get(publisherId);
  if (!facts?.regularStart) return { moved: 0, months: [] };
  const reports = await prisma.serviceReport.findMany({
    where: { publisherId, outcome: { in: ["SHARED", "DID_NOT_PREACH"] } },
    select: { id: true, year: true, month: true, hours: true, pioneerStatusUsed: true },
  });
  const changes: { id: string; to: MonthStatus; year: number; month: number }[] = [];
  for (const r of reports) {
    const base = statusForMonth(facts, r.year, r.month);
    let to: MonthStatus = r.pioneerStatusUsed as MonthStatus;
    if (base === "REGULAR" || base === "SPECIAL") to = base;
    else if (r.pioneerStatusUsed === "REGULAR" || r.pioneerStatusUsed === "SPECIAL") {
      to = base === "AUXILIARY" || r.hours !== null ? "AUXILIARY" : "NONE";
    }
    if (to !== r.pioneerStatusUsed) changes.push({ id: r.id, to, year: r.year, month: r.month });
  }
  if (changes.length) {
    await prisma.$transaction(
      changes.map((c) => prisma.serviceReport.update({ where: { id: c.id }, data: { pioneerStatusUsed: c.to } })),
    );
  }
  return {
    moved: changes.length,
    months: changes.sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)).map((c) => `${c.year}-${c.month}`),
  };
}
