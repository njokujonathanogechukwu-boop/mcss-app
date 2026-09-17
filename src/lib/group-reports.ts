import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/auth";
import { displayName, type ReportOutcome } from "@/lib/format";
import { isClosed } from "@/lib/report-periods";
import { monthLabel, reportingMonth } from "@/lib/service-year";
import { requestOrigin } from "@/lib/self-service";

/**
 * Each field service group has its own link — the same idea as a publisher's
 * personal update link. Behind it the overseer reads back over his group's
 * months and sends the reports for the month being collected. The link is the
 * only thing standing between the group's records and whoever holds the URL, so
 * it is 192 bits of randomness, and it can only ever write that one month, and
 * only for a publisher who has nothing on file yet: a report the secretary has
 * already entered is never touched, and an earlier month can only be read.
 */

export type GroupReportResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Every group's link token, creating the missing ones in one transaction. One
 * read and at most one write for all the groups — a per-group loop would cost
 * two round trips each, too slow inside one serverless request.
 */
export async function ensureGroupTokens(ids: string[]): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();
  if (ids.length === 0) return tokens;

  const rows = await prisma.serviceGroup.findMany({
    where: { id: { in: ids } },
    select: { id: true, reportToken: true },
  });
  const missing: { id: string; token: string }[] = [];
  for (const r of rows) {
    if (r.reportToken) tokens.set(r.id, r.reportToken);
    else missing.push({ id: r.id, token: randomBytes(24).toString("base64url") });
  }
  if (missing.length) {
    await prisma.$transaction(
      missing.map((m) =>
        prisma.serviceGroup.update({ where: { id: m.id }, data: { reportToken: m.token } }),
      ),
    );
    for (const m of missing) tokens.set(m.id, m.token);
  }
  return tokens;
}

/** The group a link belongs to, or null when the token is not on file. */
export async function groupByToken(token: string) {
  return prisma.serviceGroup.findUnique({
    where: { reportToken: token },
    select: { id: true, number: true, name: true },
  });
}

export function groupTitle(group: { number: number; name: string }): string {
  return `Group ${group.number}${group.name ? ` — ${group.name}` : ""}`;
}

/**
 * One group's link for the month being collected now, minting its token if it
 * has never had one. Null only when the site's own address cannot be worked
 * out from the request.
 */
export async function groupReportLink(groupId: string): Promise<string | null> {
  const [origin, tokens] = await Promise.all([
    requestOrigin(),
    ensureGroupTokens([groupId]),
  ]);
  const token = tokens.get(groupId);
  if (!origin || !token) return null;
  const { year, month } = reportingMonth();
  return `${origin}/group/${token}?period=${year}-${month}`;
}

/**
 * Replaces a group's link. The old one stops working the moment this lands, so
 * a link that has been forwarded, lost or seen by the wrong person can be
 * killed without touching anything the overseer has already sent.
 */
export async function rotateGroupToken(groupId: string): Promise<string | null> {
  const token = randomBytes(24).toString("base64url");
  await prisma.serviceGroup.update({ where: { id: groupId }, data: { reportToken: token } });
  const origin = await requestOrigin();
  if (!origin) return null;
  const { year, month } = reportingMonth();
  return `${origin}/group/${token}?period=${year}-${month}`;
}

/** What is already on file for one publisher's month. */
export type GroupReportRecord = {
  outcome: ReportOutcome;
  studies: number;
  hours: number | null;
  pioneerUsed: string;
  remarks: string | null;
  /** True when it came through a group link rather than from the secretary. */
  fromLink: boolean;
};

export type GroupMonthRow = {
  id: string;
  name: string;
  isPioneer: boolean;
  record: GroupReportRecord | null;
  /** True when the only thing on file is a noted "no report". */
  noted: boolean;
};

/**
 * The months the group's page offers: the one being collected now and the year
 * behind it, so an overseer can read back over the whole service year.
 */
export function reviewMonths(span = 13) {
  const { year, month } = reportingMonth();
  const out: { year: number; month: number; label: string }[] = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    out.push({ year: y, month: m, label: monthLabel(y, m) });
  }
  return out;
}

/**
 * Every publisher on the group's roll for one month, with whatever is already
 * recorded for them. A publisher recorded as moving in or starting after that
 * month was not on the roll yet, so nothing is expected of them for it.
 */
export async function groupMonthRows(
  groupId: string,
  year: number,
  month: number,
): Promise<GroupMonthRow[]> {
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const publishers = await prisma.publisher.findMany({
    where: { groupId, status: { in: ["ACTIVE", "IRREGULAR"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      pioneerStatus: true,
      sinceDate: true,
      reports: {
        where: { year, month },
        select: {
          outcome: true,
          bibleStudies: true,
          hours: true,
          pioneerStatusUsed: true,
          remarks: true,
          source: true,
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return publishers
    .filter((p) => !p.sinceDate || p.sinceDate <= monthEnd)
    .map((p) => {
      const r = p.reports[0];
      return {
        id: p.id,
        name: displayName(p),
        isPioneer: p.pioneerStatus !== "NONE",
        noted: r?.outcome === "NO_REPORT",
        record: r
          ? {
              outcome: r.outcome,
              studies: r.bibleStudies,
              hours: r.hours,
              pioneerUsed: r.pioneerStatusUsed,
              remarks: r.remarks,
              fromLink: r.source === "FORM",
            }
          : null,
      };
    });
}

export type GroupReportInput = {
  outcome: ReportOutcome;
  studies: number;
  hours: number | null;
  aux: boolean;
  remarks: string | null;
};

/**
 * Records one publisher's month through his group's link. Refuses a publisher
 * who is not in that group, a month already submitted to the branch, and a
 * publisher whose month the secretary has already entered — so a forwarded link
 * or a page left open cannot overwrite anything.
 */
export async function saveGroupReport(
  token: string,
  publisherId: string,
  year: number,
  month: number,
  input: GroupReportInput,
): Promise<GroupReportResult> {
  const group = await groupByToken(token);
  if (!group) {
    return { ok: false, error: "This link is no longer valid. Please ask the secretary for a new one." };
  }

  const publisher = await prisma.publisher.findFirst({
    where: { id: publisherId, groupId: group.id },
    select: { id: true, firstName: true, lastName: true, pioneerStatus: true },
  });
  if (!publisher) {
    return { ok: false, error: "That publisher is not in your group." };
  }

  // An earlier month is on the group's page to be read, not rewritten — once
  // the secretary has taken a month forward, only he can change it.
  const current = reportingMonth();
  if (year * 12 + month < current.year * 12 + current.month) {
    return {
      ok: false,
      error: `${monthLabel(year, month)} is past. This link can only send ${monthLabel(
        current.year,
        current.month,
      )} — please ask the secretary about an earlier month.`,
    };
  }

  if (await isClosed(year, month)) {
    return {
      ok: false,
      error: `${monthLabel(year, month)} has already been submitted to the branch. Please send it to the secretary instead.`,
    };
  }

  const existing = await prisma.serviceReport.findUnique({
    where: { publisherId_year_month: { publisherId: publisher.id, year, month } },
    select: { outcome: true },
  });
  if (existing && existing.outcome !== "NO_REPORT") {
    return {
      ok: false,
      error: `${displayName(publisher)} already has a report on file for ${monthLabel(year, month)}, so it was left as it is.`,
    };
  }

  const shared = input.outcome === "SHARED";
  const pioneerStatusUsed =
    input.aux && shared
      ? "AUXILIARY"
      : publisher.pioneerStatus === "NONE"
        ? "NONE"
        : publisher.pioneerStatus;

  const data = {
    outcome: input.outcome,
    bibleStudies: shared ? input.studies : 0,
    hours: shared && pioneerStatusUsed !== "NONE" ? input.hours : null,
    pioneerStatusUsed: pioneerStatusUsed as "NONE" | "AUXILIARY" | "REGULAR" | "SPECIAL",
    remarks: input.remarks,
    source: "FORM" as const,
    submittedById: null,
  };

  await prisma.serviceReport.upsert({
    where: { publisherId_year_month: { publisherId: publisher.id, year, month } },
    create: { publisherId: publisher.id, year, month, ...data },
    update: data,
  });

  const name = displayName(publisher);
  await recordAudit(
    null,
    "group-report",
    "ServiceReport",
    publisher.id,
    `${groupTitle(group)} sent the ${monthLabel(year, month)} report for ${name} ` +
      `through the group's own link: ` +
      `${input.outcome === "SHARED" ? "shared" : input.outcome === "DID_NOT_PREACH" ? "did not preach" : "no report"}` +
      (shared && input.hours ? `, ${input.hours} hours` : "") +
      (shared ? `, ${input.studies} Bible studies` : "") +
      ".",
  );

  return { ok: true, message: `Thank you — ${name} is recorded for ${monthLabel(year, month)}.` };
}
