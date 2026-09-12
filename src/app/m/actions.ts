"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";

export type MobileReportState = { ok?: boolean; error?: string; message?: string; publisherId?: string };

/**
 * Single-publisher report submission for the phone app. Mirrors the rules of
 * the monthly sheet: only pioneers record hours, publishers report
 * participation and studies, and a completely empty submission clears the row
 * rather than saving a nil report.
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

  const shared = formData.get("shared") === "true";
  const aux = formData.get("aux") === "true";
  const studiesRaw = String(formData.get("studies") ?? "").trim();
  const hoursRaw = String(formData.get("hours") ?? "").trim();
  const remarks = String(formData.get("remarks") ?? "").trim();

  if (!shared) {
    await prisma.serviceReport.deleteMany({ where: { publisherId, year, month } });
    await recordAudit(
      auth.session.userId, "updated", "ServiceReport", publisherId,
      `Phone: cleared ${monthLabel(year, month)} report for ${displayName(publisher)}`,
    );
    revalidatePath("/reports");
    revalidatePath("/records");
    revalidatePath("/m/report");
    return { ok: true, message: `Marked ${displayName(publisher)} as not sharing this month.`, publisherId };
  }

  const studies = studiesRaw === "" ? 0 : Number(studiesRaw);
  if (!Number.isInteger(studies) || studies < 0 || studies > 99) {
    return { error: "Bible studies must be a whole number (0–99).", publisherId };
  }

  const pioneerStatusUsed = aux ? "AUXILIARY" : publisher.pioneerStatus === "NONE" ? "NONE" : publisher.pioneerStatus;

  let hours: number | null = null;
  if (pioneerStatusUsed !== "NONE" && hoursRaw !== "") {
    const parsed = Number(hoursRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 744) {
      return { error: "Hours must be a whole number between 0 and 744.", publisherId };
    }
    hours = parsed;
  }

  const data = {
    sharedInMinistry: true,
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

  await recordAudit(
    auth.session.userId, "updated", "ServiceReport", publisherId,
    `Phone: saved ${monthLabel(year, month)} report for ${displayName(publisher)}`,
  );

  revalidatePath("/reports");
  revalidatePath("/records");
  revalidatePath("/m/report");

  return { ok: true, message: `Report saved for ${displayName(publisher)}.`, publisherId };
}
