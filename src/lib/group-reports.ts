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
 * personal update link — behind which the overseer sends the reports for the
 * publishers in his group who have not reported. The link is the only thing
 * standing between the group's records and whoever holds the URL, so it is 192
 * bits of randomness, and it can only ever record a month that has nothing on
 * file yet: a report the secretary has already entered is never touched.
 */

export type GroupReportRow = {
  id: string;
  name: string;
  isPioneer: boolean;
  /** True when the secretary noted "no report" rather than nothing at all. */
  noted: boolean;
};

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
 * The publishers in one group still owed for a month: nothing recorded, or the
 * secretary noted that no report came. A publisher recorded as moving in or
 * starting after that month was not on the roll yet, so nothing is expected of
 * them for it.
 */
export async function outstandingForGroup(
  groupId: string,
  year: number,
  month: number,
): Promise<GroupReportRow[]> {
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const publishers = await prisma.publisher.findMany({
    where: { groupId, status: { in: ["ACTIVE", "IRREGULAR"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      pioneerStatus: true,
      sinceDate: true,
      reports: { where: { year, month }, select: { outcome: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return publishers
    .filter((p) => !p.sinceDate || p.sinceDate <= monthEnd)
    .filter((p) => !p.reports[0] || p.reports[0].outcome === "NO_REPORT")
    .map((p) => ({
      id: p.id,
      name: displayName(p),
      isPioneer: p.pioneerStatus !== "NONE",
      noted: p.reports[0]?.outcome === "NO_REPORT",
    }));
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
