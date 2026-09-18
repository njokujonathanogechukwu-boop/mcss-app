"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { publisherSchema, transferSchema, quickPublisherSchema, fieldErrors } from "@/lib/validation";
import { rotateSelfToken } from "@/lib/self-service";

export type FormState = { error?: string; errors?: Record<string, string>; ok?: string };

function readPublisher(formData: FormData) {
  return publisherSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    gender: formData.get("gender"),
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    baptismDate: formData.get("baptismDate") ?? "",
    isBaptized: formData.get("isBaptized") === "true",
    isAnointed: formData.get("isAnointed") === "true",
    appointment: formData.get("appointment"),
    pioneerStatus: formData.get("pioneerStatus"),
    status: formData.get("status"),
    sinceDate: formData.get("sinceDate") ?? "",
    sinceKind: String(formData.get("sinceKind") ?? "") || null,
    privileges: String(formData.get("privileges") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    address: formData.get("address") ?? "",
    emergencyContactName: formData.get("emergencyContactName") ?? "",
    emergencyContactPhone: formData.get("emergencyContactPhone") ?? "",
    groupId: formData.get("groupId") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function createPublisher(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = readPublisher(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const created = await prisma.publisher.create({ data: parsed.data });
  await recordAudit(
    auth.session.userId, "created", "Publisher", created.id,
    `Added ${created.firstName} ${created.lastName}`,
  );

  revalidatePath("/publishers");
  redirect(`/publishers/${created.id}`);
}

export async function updatePublisher(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = readPublisher(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const before = await prisma.publisher.findUnique({ where: { id }, select: { groupId: true } });
  const updated = await prisma.publisher.update({ where: { id }, data: parsed.data });

  // A group change made from the record page is still a transfer and is logged.
  if (before && before.groupId !== updated.groupId) {
    await prisma.transferLog.create({
      data: {
        publisherId: id,
        fromGroupId: before.groupId,
        toGroupId: updated.groupId,
        effectiveDate: new Date(),
        reason: "Changed while editing the publisher record",
        recordedById: auth.session.userId,
      },
    });
  }

  await recordAudit(
    auth.session.userId, "updated", "Publisher", id,
    `Edited ${updated.firstName} ${updated.lastName}`,
  );

  revalidatePath("/publishers");
  revalidatePath(`/publishers/${id}`);
  redirect(`/publishers/${id}?saved=1`);
}

export async function quickUpdatePublisher(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = quickPublisherSchema.safeParse({
    gender: formData.get("gender"),
    isBaptized: formData.get("isBaptized") ?? undefined,
    baptismDate: formData.get("baptismDate") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const updated = await prisma.publisher.update({ where: { id }, data: parsed.data });
  await recordAudit(
    auth.session.userId, "updated", "Publisher", id,
    `Quick-edited sex and baptism for ${updated.firstName} ${updated.lastName}`,
  );

  revalidatePath("/publishers");
  return { ok: "Saved." };
}

export async function transferPublisher(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = transferSchema.safeParse({
    publisherId: formData.get("publisherId"),
    toGroupId: formData.get("toGroupId"),
    effectiveDate: formData.get("effectiveDate"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const publisher = await prisma.publisher.findUnique({
    where: { id: parsed.data.publisherId },
    select: { groupId: true, firstName: true, lastName: true },
  });
  if (!publisher) return { error: "That publisher record no longer exists." };
  if (publisher.groupId === parsed.data.toGroupId) {
    return { error: "That publisher is already in this group." };
  }

  await prisma.$transaction([
    prisma.transferLog.create({
      data: {
        publisherId: parsed.data.publisherId,
        fromGroupId: publisher.groupId,
        toGroupId: parsed.data.toGroupId,
        effectiveDate: new Date(parsed.data.effectiveDate),
        reason: parsed.data.reason,
        recordedById: auth.session.userId,
      },
    }),
    prisma.publisher.update({
      where: { id: parsed.data.publisherId },
      data: { groupId: parsed.data.toGroupId },
    }),
  ]);

  await recordAudit(
    auth.session.userId, "transferred", "Publisher", parsed.data.publisherId,
    `Moved ${publisher.firstName} ${publisher.lastName} to another group`,
  );

  revalidatePath(`/publishers/${parsed.data.publisherId}`);
  revalidatePath("/groups");
  return { ok: "Transfer recorded." };
}

export type RotateLinkState = { error?: string; ok?: string; link?: string };

/**
 * Replaces one publisher's personal update link, killing the old one. This is
 * how a link that was forwarded, lost or printed on a sheet that has gone
 * astray is taken out of circulation — the publisher's record is untouched.
 */
export async function rotatePublisherLink(publisherId: string): Promise<RotateLinkState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!publisher) return { error: "That publisher is not on file." };

  const link = await rotateSelfToken(publisher.id);

  await recordAudit(
    auth.session.userId, "rotated", "Publisher", publisher.id,
    `Replaced ${publisher.firstName} ${publisher.lastName}'s personal update link — the old one stopped working.`,
  );

  revalidatePath("/publishers/links");
  return { ok: "Replaced. The old link no longer works.", link: link ?? undefined };
}

export async function deletePublisher(formData: FormData) {
  const auth = await guard("publisher:delete");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  const publisher = await prisma.publisher.findUnique({ where: { id } });
  if (!publisher) return;

  await prisma.publisher.delete({ where: { id } });
  await recordAudit(
    auth.session.userId, "deleted", "Publisher", id,
    `Removed ${publisher.firstName} ${publisher.lastName} and their service reports`,
  );

  revalidatePath("/publishers");
  redirect("/publishers");
}
