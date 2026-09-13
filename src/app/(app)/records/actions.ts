"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";
import { recordFixSchema, fieldErrors } from "@/lib/validation";

export type RecordFixState = {
  ok?: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
};

/** A field the form never rendered stays absent, so it is not blanked out. */
function offered(formData: FormData, key: string): string | undefined {
  return formData.has(key) ? String(formData.get(key) ?? "") : undefined;
}

/**
 * Fixes the gaps the records review flags: bio-data, contact details, service
 * group and any month still missing a field service report — all from one
 * small inline form. Only the fields actually present in the submission are
 * touched, so a form that shows three missing fields never blanks out the rest
 * of the record.
 */
export async function saveRecordFix(_prev: RecordFixState, formData: FormData): Promise<RecordFixState> {
  const canPublisher = await guard("publisher:write");
  const canReport = await guard("report:write");
  const session = canPublisher.ok ? canPublisher.session : canReport.ok ? canReport.session : null;
  if (!session) return { error: "Your account cannot update records." };

  const parsed = recordFixSchema.safeParse({
    publisherId: String(formData.get("publisherId") ?? ""),
    dateOfBirth: offered(formData, "dateOfBirth"),
    baptismDate: offered(formData, "baptismDate"),
    phone: offered(formData, "phone"),
    email: offered(formData, "email"),
    address: offered(formData, "address"),
    emergencyContactName: offered(formData, "emergencyContactName"),
    emergencyContactPhone: offered(formData, "emergencyContactPhone"),
    groupId: offered(formData, "groupId"),
    reportPeriod: offered(formData, "reportPeriod"),
    reportShared: formData.get("reportShared") === "true",
    reportAux: formData.get("reportAux") === "true",
    reportStudies: String(formData.get("reportStudies") ?? "").trim(),
    reportHours: String(formData.get("reportHours") ?? "").trim(),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const input = parsed.data;

  const publisher = await prisma.publisher.findUnique({
    where: { id: input.publisherId },
    select: { id: true, firstName: true, lastName: true, groupId: true, pioneerStatus: true },
  });
  if (!publisher) return { error: "That publisher no longer exists." };

  const done: string[] = [];
  const notes: string[] = [];

  // ---- Publisher bio / contact / group
  if (canPublisher.ok) {
    const data: Prisma.PublisherUpdateInput = {};

    if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth;
    if (input.baptismDate !== undefined) data.baptismDate = input.baptismDate;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.email !== undefined) data.email = input.email;
    if (input.address !== undefined) data.address = input.address;
    if (input.emergencyContactName !== undefined) data.emergencyContactName = input.emergencyContactName;
    if (input.emergencyContactPhone !== undefined) data.emergencyContactPhone = input.emergencyContactPhone;

    let movedToGroupId: string | null = null;
    if (input.groupId !== undefined && input.groupId !== publisher.groupId) {
      data.group = input.groupId ? { connect: { id: input.groupId } } : { disconnect: true };
      movedToGroupId = input.groupId;
    }

    if (Object.keys(data).length > 0) {
      await prisma.publisher.update({ where: { id: publisher.id }, data });

      if (movedToGroupId) {
        await prisma.transferLog.create({
          data: {
            publisherId: publisher.id,
            fromGroupId: publisher.groupId,
            toGroupId: movedToGroupId,
            effectiveDate: new Date(),
            reason: "Assigned from records review",
            recordedById: session.userId,
          },
        });
      }
      done.push("record details");
    }
  }

  // ---- A month still missing its field service report
  if (canReport.ok && input.reportPeriod) {
    const { year, month } = input.reportPeriod;
    const marked =
      input.reportShared || input.reportAux || input.reportStudies !== "" || input.reportHours !== "";

    const existing = await prisma.serviceReport.findUnique({
      where: { publisherId_year_month: { publisherId: publisher.id, year, month } },
      select: { id: true },
    });

    if (existing && !marked) {
      // Someone filled this month in after the form was rendered. Leaving the
      // report alone beats overwriting real figures with an empty submission.
      notes.push(`${monthLabel(year, month)} already has a report on file, so it was left as it is.`);
    } else {
      const isPioneer = publisher.pioneerStatus !== "NONE";
      const pioneerStatusUsed = isPioneer
        ? publisher.pioneerStatus
        : input.reportAux
          ? "AUXILIARY"
          : "NONE";

      const data = {
        sharedInMinistry: input.reportShared,
        bibleStudies: input.reportShared && input.reportStudies !== "" ? input.reportStudies : 0,
        hours:
          input.reportShared && pioneerStatusUsed !== "NONE" && input.reportHours !== ""
            ? input.reportHours
            : null,
        pioneerStatusUsed: pioneerStatusUsed as "NONE" | "AUXILIARY" | "REGULAR" | "SPECIAL",
        submittedById: session.userId,
      };

      await prisma.serviceReport.upsert({
        where: { publisherId_year_month: { publisherId: publisher.id, year, month } },
        create: { publisherId: publisher.id, year, month, ...data },
        update: data,
      });
      done.push(`the ${monthLabel(year, month)} report`);
    }
  }

  if (done.length === 0) {
    return {
      error: notes.length
        ? notes.join(" ")
        : "Nothing to save, or your account cannot make these changes.",
    };
  }

  await recordAudit(
    session.userId,
    "update",
    "publisher",
    publisher.id,
    `Records review: updated ${done.join(", ")} for ${displayName(publisher)}`,
  );

  revalidatePath("/records");
  revalidatePath("/publishers");
  revalidatePath(`/publishers/${publisher.id}`);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/m/records");
  revalidatePath("/m/report");

  return {
    ok: true,
    message: `Saved ${done.join(" and ")}.${notes.length ? ` ${notes.join(" ")}` : ""}`,
  };
}
