"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { auxSchema, fieldErrors } from "@/lib/validation";
import { auxCovers, monthIndexOf } from "@/lib/auxiliary";
import { monthLabel } from "@/lib/service-year";
import { displayName } from "@/lib/format";

export type FormState = { error?: string; errors?: Record<string, string>; ok?: string };

/**
 * Records an approved auxiliary pioneer application and sets the publisher's
 * pioneer status to Auxiliary so the report sheet expects hours from them.
 */
export async function recordApproval(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = auxSchema.safeParse({
    publisherId: formData.get("publisherId"),
    start: formData.get("start"),
    months: formData.get("months") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { publisherId, start, months, notes } = parsed.data;
  const [startYear, startMonth] = start.split("-").map(Number);

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { firstName: true, lastName: true },
  });
  if (!publisher) return { error: "That publisher record no longer exists." };

  await prisma.$transaction([
    prisma.auxiliaryPioneer.create({
      data: { publisherId, startYear, startMonth, months, notes },
    }),
    prisma.publisher.update({
      where: { id: publisherId },
      data: { pioneerStatus: "AUXILIARY" },
    }),
  ]);

  await recordAudit(
    auth.session.userId, "created", "AuxiliaryPioneer", publisherId,
    `Approved ${displayName(publisher)} as an auxiliary pioneer from ${monthLabel(startYear, startMonth)}`,
  );

  revalidatePath("/reports/auxiliary");
  revalidatePath("/reports");
  revalidatePath(`/publishers/${publisherId}`);
  return { ok: `Approved ${displayName(publisher)}; their status is now Auxiliary.` };
}

/**
 * Announces the auxiliary pioneers approved for a month that have not been
 * announced yet, as a finalised announcement, and marks them announced.
 */
export async function announceAux(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await guard("announcement:approve");
  if (!auth.ok) return { error: auth.error };

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!year || !month) return { error: "Choose a month first." };

  const approvals = await prisma.auxiliaryPioneer.findMany({
    where: { announcedAt: null },
    include: { publisher: { select: { firstName: true, lastName: true } } },
    orderBy: [{ publisher: { lastName: "asc" } }, { publisher: { firstName: "asc" } }],
  });
  const due = approvals.filter((a) => auxCovers(a, year, month));
  if (due.length === 0) {
    return { ok: `Nothing new to announce for ${monthLabel(year, month)}.` };
  }

  const names = due.map((a) => displayName(a.publisher));
  const body = [
    `The following ${names.length === 1 ? "publisher has" : "publishers have"} been approved to serve as`,
    `auxiliary ${names.length === 1 ? "pioneer" : "pioneers"} for ${monthLabel(year, month)}:`,
    "",
    ...names.map((n) => `• ${n}`),
    "",
    "Please support them in reaching the auxiliary pioneer hour goal.",
  ].join("\n");

  await prisma.$transaction([
    prisma.announcement.create({
      data: {
        title: `Auxiliary pioneers for ${monthLabel(year, month)}`,
        body,
        status: "APPROVED",
        approvedAt: new Date(),
        createdById: auth.session.userId,
      },
    }),
    prisma.auxiliaryPioneer.updateMany({
      where: { id: { in: due.map((a) => a.id) } },
      data: { announcedAt: new Date() },
    }),
  ]);

  await recordAudit(
    auth.session.userId, "created", "Announcement", null,
    `Announced ${names.length} auxiliary pioneer approval(s) for ${monthLabel(year, month)}`,
  );

  revalidatePath("/reports/auxiliary");
  revalidatePath("/tasks");
  return { ok: `Announcement created for ${names.length} approval(s); see Tasks & announcements.` };
}

/** Closes an indefinite approval at the chosen month (turns it into a fixed span). */
export async function closeApproval(formData: FormData) {
  const auth = await guard("publisher:write");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!id || !year || !month) return;

  const approval = await prisma.auxiliaryPioneer.findUnique({ where: { id } });
  if (!approval || approval.months != null) return;

  const months = monthIndexOf(year, month) - monthIndexOf(approval.startYear, approval.startMonth) + 1;
  if (months < 1) return;

  await prisma.auxiliaryPioneer.update({ where: { id }, data: { months } });
  await recordAudit(auth.session.userId, "updated", "AuxiliaryPioneer", id, `Closed an indefinite approval at ${monthLabel(year, month)}`);
  revalidatePath("/reports/auxiliary");
}
