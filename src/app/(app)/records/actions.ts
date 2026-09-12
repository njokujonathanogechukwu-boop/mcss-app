"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { displayName } from "@/lib/format";

export type RecordFixState = { ok?: boolean; error?: string; message?: string };

function parseDate(value: string): Date | null {
  const v = value.trim();
  if (v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function trimmed(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Fixes the gaps the records review flags: bio-data, contact details, service
 * group and this month's report — all from one small inline form. Only the
 * fields actually present in the submission are touched, so a form that shows
 * three missing fields never blanks out the rest of the record.
 */
export async function saveRecordFix(_prev: RecordFixState, formData: FormData): Promise<RecordFixState> {
  const publisherId = String(formData.get("publisherId") ?? "");
  if (!publisherId) return { error: "Missing publisher." };

  const canPublisher = await guard("publisher:write");
  const canReport = await guard("report:write");
  const session = canPublisher.ok ? canPublisher.session : canReport.ok ? canReport.session : null;
  if (!session) return { error: "Your account cannot update records." };

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { id: true, firstName: true, lastName: true, groupId: true, pioneerStatus: true },
  });
  if (!publisher) return { error: "That publisher no longer exists." };

  const done: string[] = [];

  // ---- Publisher bio / contact / group
  if (canPublisher.ok) {
    const data: Prisma.PublisherUpdateInput = {};

    if (formData.has("dateOfBirth")) data.dateOfBirth = parseDate(String(formData.get("dateOfBirth")));
    if (formData.has("baptismDate")) data.baptismDate = parseDate(String(formData.get("baptismDate")));
    for (const key of ["phone", "email", "address", "emergencyContactName", "emergencyContactPhone"] as const) {
      if (formData.has(key)) data[key] = trimmed(formData.get(key));
    }

    let groupChange: { toGroupId: string | null } | null = null;
    if (formData.has("groupId")) {
      const groupId = trimmed(formData.get("groupId"));
      if (groupId !== publisher.groupId) {
        data.group = groupId ? { connect: { id: groupId } } : { disconnect: true };
        groupChange = { toGroupId: groupId };
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.publisher.update({ where: { id: publisherId }, data });

      if (groupChange && groupChange.toGroupId) {
        await prisma.transferLog.create({
          data: {
            publisherId,
            fromGroupId: publisher.groupId,
            toGroupId: groupChange.toGroupId,
            effectiveDate: new Date(),
            reason: "Assigned from records review",
            recordedById: session.userId,
          },
        });
      }
      done.push("record details");
    }
  }

  // ---- This month's field service report
  if (canReport.ok && formData.has("reportYear") && formData.has("reportMonth")) {
    const year = Number(formData.get("reportYear"));
    const month = Number(formData.get("reportMonth"));
    if (Number.isFinite(year) && month >= 1 && month <= 12) {
      const shared = formData.get("reportShared") === "on" || formData.get("reportShared") === "true";
      const isPioneer = publisher.pioneerStatus !== "NONE";
      const bibleStudies = Math.max(0, Math.min(99, Number(formData.get("reportStudies")) || 0));
      const hoursRaw = String(formData.get("reportHours") ?? "").trim();
      const hours = isPioneer && hoursRaw !== "" ? Math.max(0, Math.min(744, Number(hoursRaw) || 0)) : null;
      const usedAux = formData.get("reportAux") === "on" || formData.get("reportAux") === "true";
      const pioneerStatusUsed = isPioneer
        ? publisher.pioneerStatus
        : usedAux
          ? "AUXILIARY"
          : "NONE";

      await prisma.serviceReport.upsert({
        where: { publisherId_year_month: { publisherId, year, month } },
        create: {
          publisherId,
          year,
          month,
          sharedInMinistry: shared,
          bibleStudies: shared ? bibleStudies : 0,
          hours: shared ? hours : null,
          pioneerStatusUsed: pioneerStatusUsed as Prisma.ServiceReportCreateInput["pioneerStatusUsed"],
          submittedById: session.userId,
        },
        update: {
          sharedInMinistry: shared,
          bibleStudies: shared ? bibleStudies : 0,
          hours: shared ? hours : null,
          pioneerStatusUsed: pioneerStatusUsed as Prisma.ServiceReportUpdateInput["pioneerStatusUsed"],
          submittedById: session.userId,
        },
      });
      done.push("field service report");
    }
  }

  if (done.length === 0) return { error: "Nothing to save, or your account cannot make these changes." };

  await recordAudit(
    session.userId,
    "update",
    "publisher",
    publisherId,
    `Records review: updated ${done.join(" and ")} for ${displayName(publisher)}`,
  );

  revalidatePath("/records");
  revalidatePath("/publishers");
  revalidatePath(`/publishers/${publisherId}`);
  revalidatePath("/reports");
  revalidatePath("/m/records");
  revalidatePath("/m/report");

  return { ok: true, message: `Saved ${done.join(" and ")}.` };
}
