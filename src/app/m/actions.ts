"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { displayName, REPORT_OUTCOMES, type ReportOutcome } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";

export type MobileReportState = { ok?: boolean; error?: string; message?: string; publisherId?: string };

/**
 * Single-publisher report submission for the phone app. Mirrors the rules of
 * the monthly sheet: only pioneers record hours, and the secretary says which
 * of the three outcomes the month has — shared, did not preach, or no report
 * came in. Submitting no outcome at all clears whatever is on file.
 */
export async function submitMobileReport(
  _prev: MobileReportState,
  formData: FormData,
): Promise<MobileReportState> {
  const auth = await guard("report:write");
  if (!auth.ok) return { error: auth.error };

  const publisherId = String(formData.get("publisherId") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!publisherId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "That submission was incomplete.", publisherId };
  }

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { id: true, firstName: true, lastName: true, pioneerStatus: true },
  });
  if (!publisher) return { error: "That publisher no longer exists.", publisherId };

  const clearing = formData.get("clear") === "true";
  const outcome = (clearing ? "" : String(formData.get("outcome") ?? "").trim()) as ReportOutcome | "";
  if (outcome !== "" && !REPORT_OUTCOMES.includes(outcome as ReportOutcome)) {
    return { error: "Choose what this month means.", publisherId };
  }

  const aux = formData.get("aux") === "true";
  const studiesRaw = String(formData.get("studies") ?? "").trim();
  const hoursRaw = String(formData.get("hours") ?? "").trim();
  const remarks = String(formData.get("remarks") ?? "").trim();

  if (outcome === "") {
    await prisma.serviceReport.deleteMany({ where: { publisherId, year, month } });
    await recordAudit(
      auth.session.userId, "updated", "ServiceReport", publisherId,
      `Phone: cleared ${monthLabel(year, month)} report for ${displayName(publisher)}`,
    );
    revalidatePath("/reports");
    revalidatePath("/records");
    revalidatePath("/m/report");
    revalidatePath("/reports/reminders");
    return { ok: true, message: `Cleared ${displayName(publisher)} for ${monthLabel(year, month)}.`, publisherId };
  }

  const shared = outcome === "SHARED";
  const pioneerStatusUsed = aux && shared ? "AUXILIARY" : publisher.pioneerStatus === "NONE" ? "NONE" : publisher.pioneerStatus;

  let studies = 0;
  let hours: number | null = null;

  if (shared) {
    studies = studiesRaw === "" ? 0 : Number(studiesRaw);
    if (!Number.isInteger(studies) || studies < 0 || studies > 99) {
      return { error: "Bible studies must be a whole number (0–99).", publisherId };
    }
    if (pioneerStatusUsed !== "NONE" && hoursRaw !== "") {
      const parsed = Number(hoursRaw);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 744) {
        return { error: "Hours must be a whole number between 0 and 744.", publisherId };
      }
      hours = parsed;
    }
  }

  const data = {
    outcome,
    bibleStudies: studies,
    hours,
    pioneerStatusUsed: pioneerStatusUsed as "NONE" | "AUXILIARY" | "REGULAR" | "SPECIAL",
    remarks: remarks || null,
    source: "MANUAL" as const,
    submittedById: auth.session.userId,
  };

  await prisma.serviceReport.upsert({
    where: { publisherId_year_month: { publisherId, year, month } },
    create: { publisherId, year, month, ...data },
    update: data,
  });

  const said =
    shared ? `Report saved for ${displayName(publisher)}.`
    : outcome === "DID_NOT_PREACH" ? `Recorded that ${displayName(publisher)} did not preach in ${monthLabel(year, month)}.`
    : `Recorded that no report came in from ${displayName(publisher)} for ${monthLabel(year, month)}.`;

  await recordAudit(
    auth.session.userId, "updated", "ServiceReport", publisherId,
    `Phone: ${said}`,
  );

  revalidatePath("/reports");
  revalidatePath("/records");
  revalidatePath("/m/report");
  revalidatePath("/reports/reminders");

  return { ok: true, message: said, publisherId };
}
