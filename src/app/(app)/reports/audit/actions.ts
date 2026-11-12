"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { auxCovers } from "@/lib/auxiliary";
import { displayName } from "@/lib/format";
import { monthLabel, reportingMonth } from "@/lib/service-year";
import { lockedMessage, lockedReportKeys, reportKey } from "@/lib/report-periods";
import { setReviewed } from "@/lib/report-audit-review";

export type FixState = { error?: string; ok?: string };

const CATEGORIES = ["NONE", "AUXILIARY", "REGULAR", "SPECIAL"] as const;
type Category = (typeof CATEGORIES)[number];
const CATEGORY_WORD: Record<Category, string> = {
  NONE: "a publisher", AUXILIARY: "an auxiliary pioneer", REGULAR: "a regular pioneer", SPECIAL: "a special pioneer",
};

function revalidate(publisherId: string) {
  revalidatePath("/reports", "layout");
  revalidatePath(`/publishers/${publisherId}`);
  revalidatePath("/dashboard");
}

/**
 * Puts right what the audit flagged, one publisher and one month at a time.
 * Which fix is wanted travels in a hidden `op`:
 *
 * - `category`  file the month's report under another line of the S-1 (`to`)
 * - `approveAux` record an auxiliary approval for that one month and file the report as one
 * - `notAux`    file the report as a publisher's, and drop an auxiliary standing nothing supports
 * - `movedOut`  mark the publisher as moved to another congregation (`date`, `where`)
 * - `reviewed` / `unreviewed` note that the flags were looked at and are in order
 *
 * A report already submitted to the branch is locked, as everywhere else.
 */
export async function auditFix(_prev: FixState, formData: FormData): Promise<FixState> {
  const op = String(formData.get("op") ?? "");
  const publisherId = String(formData.get("publisherId") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!publisherId || !year || month < 1 || month > 12) return { error: "That line could not be read. Reload the page." };

  const needs = op === "approveAux" || op === "movedOut" ? "publisher:write" : "report:write";
  const auth = await guard(needs);
  if (!auth.ok) return { error: auth.error };

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { firstName: true, lastName: true, pioneerStatus: true, status: true, groupId: true },
  });
  if (!publisher) return { error: "That publisher record no longer exists." };
  const name = displayName(publisher);
  const label = monthLabel(year, month);
  const key = reportKey(publisherId, year, month);

  const report = await prisma.serviceReport.findUnique({
    where: { publisherId_year_month: { publisherId, year, month } },
    select: { id: true, pioneerStatusUsed: true },
  });
  const ensureUnlocked = async () => ((await lockedReportKeys()).has(key) ? lockedMessage(name, label) : null);

  if (op === "reviewed" || op === "unreviewed") {
    await setReviewed(key, op === "reviewed");
    await recordAudit(auth.session.userId, "updated", "ServiceReport", report?.id ?? null,
      `${op === "reviewed" ? "Marked" : "Unmarked"} ${name}'s ${label} report as reviewed in the audit`);
    revalidate(publisherId);
    return { ok: op === "reviewed" ? "Marked as reviewed." : "Back on the list to check." };
  }

  if (op === "category") {
    const to = String(formData.get("to")) as Category;
    if (!CATEGORIES.includes(to)) return { error: "Choose where the report belongs." };
    if (!report) return { error: `${name} has no report for ${label} to move.` };
    const locked = await ensureUnlocked();
    if (locked) return { error: locked };
    await prisma.serviceReport.update({ where: { id: report.id }, data: { pioneerStatusUsed: to } });
    await recordAudit(auth.session.userId, "updated", "ServiceReport", report.id,
      `Filed ${name}'s ${label} report as ${CATEGORY_WORD[to]} (was ${CATEGORY_WORD[report.pioneerStatusUsed as Category]}) from the audit`);
    revalidate(publisherId);
    return { ok: `Now counted as ${CATEGORY_WORD[to]}.` };
  }

  if (op === "approveAux") {
    const locked = report ? await ensureUnlocked() : null;
    if (locked) return { error: locked };
    const approvals = await prisma.auxiliaryPioneer.findMany({
      where: { publisherId },
      select: { startYear: true, startMonth: true, months: true },
    });
    const already = approvals.some((a) => auxCovers(a, year, month));
    const now = reportingMonth();
    await prisma.$transaction([
      ...(already
        ? []
        : [prisma.auxiliaryPioneer.create({
            data: { publisherId, startYear: year, startMonth: month, months: 1, notes: "Approved from the report audit" },
          })]),
      ...(report ? [prisma.serviceReport.update({ where: { id: report.id }, data: { pioneerStatusUsed: "AUXILIARY" } })] : []),
      // Their standing today follows only when the approval covers the month now being reported.
      ...(publisher.pioneerStatus === "NONE" && year === now.year && month === now.month
        ? [prisma.publisher.update({ where: { id: publisherId }, data: { pioneerStatus: "AUXILIARY" } })]
        : []),
    ]);
    await recordAudit(auth.session.userId, "created", "AuxiliaryPioneer", publisherId,
      `Approved ${name} as an auxiliary pioneer for ${label} from the audit`);
    revalidate(publisherId);
    return { ok: `${name} is approved as an auxiliary pioneer for ${label}.` };
  }

  if (op === "notAux") {
    const locked = report ? await ensureUnlocked() : null;
    if (locked) return { error: locked };
    const approvals = await prisma.auxiliaryPioneer.findMany({
      where: { publisherId },
      select: { startYear: true, startMonth: true, months: true },
    });
    const now = reportingMonth();
    // An "auxiliary" standing with no approval behind it for the month being reported is dropped.
    const dropStanding =
      publisher.pioneerStatus === "AUXILIARY" && !approvals.some((a) => auxCovers(a, now.year, now.month));
    await prisma.$transaction([
      ...(report ? [prisma.serviceReport.update({ where: { id: report.id }, data: { pioneerStatusUsed: "NONE" } })] : []),
      ...(dropStanding ? [prisma.publisher.update({ where: { id: publisherId }, data: { pioneerStatus: "NONE" } })] : []),
    ]);
    await recordAudit(auth.session.userId, "updated", "ServiceReport", report?.id ?? null,
      `Filed ${name}'s ${label} report as a publisher's, not an auxiliary pioneer's, from the audit${dropStanding ? "; auxiliary standing removed" : ""}`);
    revalidate(publisherId);
    return { ok: `Now counted as a publisher${dropStanding ? "; their auxiliary standing is removed" : ""}.` };
  }

  if (op === "movedOut") {
    const date = String(formData.get("date") ?? "");
    const where = String(formData.get("where") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: "Enter the date they moved." };
    if (publisher.status === "TRANSFERRED_OUT") return { ok: `${name} is already marked as moved out.` };
    await prisma.$transaction([
      prisma.transferLog.create({
        data: {
          publisherId,
          fromGroupId: publisher.groupId,
          toGroupId: null,
          effectiveDate: new Date(`${date}T00:00:00.000Z`),
          reason: where ? `Moved to ${where}` : "Moved out of the congregation",
          recordedById: auth.session.userId,
        },
      }),
      prisma.publisher.update({ where: { id: publisherId }, data: { status: "TRANSFERRED_OUT" } }),
    ]);
    await recordAudit(auth.session.userId, "transferred", "Publisher", publisherId,
      `Marked ${name} as moved out${where ? ` to ${where}` : ""} from the audit`);
    revalidate(publisherId);
    revalidatePath("/publishers");
    revalidatePath("/groups");
    return { ok: `${name} is marked as moved out. Their record and reports are kept.` };
  }

  return { error: "That fix is not known." };
}
