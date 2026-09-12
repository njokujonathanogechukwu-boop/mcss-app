"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";

export type MergeState = { error?: string };

/**
 * Folds one publisher record into another. Everything attached to the
 * record being removed moves to the one being kept: field service reports
 * (a month already on the kept record wins), transfers, privileges, elders'
 * items, group roles and the sign-in account. Blank details on the kept
 * record are filled from the other. The removed record is then deleted.
 * All of it happens in one transaction.
 */
export async function mergePublishers(_prev: MergeState, formData: FormData): Promise<MergeState> {
  const auth = await guard("publisher:delete");
  if (!auth.ok) return { error: auth.error };

  const keepId = String(formData.get("keep") ?? "");
  const removeId = String(formData.get("remove") ?? "");
  if (!keepId || !removeId || keepId === removeId) return { error: "Choose two different records." };
  if (formData.get("confirm") !== "true") return { error: "Tick the box to confirm the merge." };

  const [keep, remove] = await Promise.all([
    prisma.publisher.findUnique({ where: { id: keepId } }),
    prisma.publisher.findUnique({ where: { id: removeId } }),
  ]);
  if (!keep || !remove) return { error: "One of those records no longer exists." };

  let moved = 0;
  let dropped = 0;

  await prisma.$transaction(async (tx) => {
    // Reports: move months the kept record lacks; drop the rest.
    const keptMonths = new Set(
      (await tx.serviceReport.findMany({ where: { publisherId: keepId }, select: { year: true, month: true } }))
        .map((r) => `${r.year}-${r.month}`),
    );
    const reports = await tx.serviceReport.findMany({ where: { publisherId: removeId }, select: { id: true, year: true, month: true } });
    for (const r of reports) {
      if (keptMonths.has(`${r.year}-${r.month}`)) {
        await tx.serviceReport.delete({ where: { id: r.id } });
        dropped++;
      } else {
        await tx.serviceReport.update({ where: { id: r.id }, data: { publisherId: keepId } });
        moved++;
      }
    }

    // Privileges: move, unless the kept record already holds the same one.
    const keptPrivileges = new Set(
      (await tx.publisherPrivilege.findMany({ where: { publisherId: keepId, endDate: null }, select: { privilegeId: true } }))
        .map((p) => p.privilegeId),
    );
    const privileges = await tx.publisherPrivilege.findMany({ where: { publisherId: removeId } });
    for (const p of privileges) {
      if (p.endDate === null && keptPrivileges.has(p.privilegeId)) await tx.publisherPrivilege.delete({ where: { id: p.id } });
      else await tx.publisherPrivilege.update({ where: { id: p.id }, data: { publisherId: keepId } });
    }

    await tx.transferLog.updateMany({ where: { publisherId: removeId }, data: { publisherId: keepId } });
    await tx.boeDecision.updateMany({ where: { assignedToId: removeId }, data: { assignedToId: keepId } });
    await tx.serviceGroup.updateMany({ where: { overseerId: removeId }, data: { overseerId: keepId } });
    await tx.serviceGroup.updateMany({ where: { assistantId: removeId }, data: { assistantId: keepId } });

    // A sign-in account can point at one record only.
    const keptUser = await tx.user.findFirst({ where: { publisherId: keepId }, select: { id: true } });
    if (keptUser) await tx.user.updateMany({ where: { publisherId: removeId }, data: { publisherId: null } });
    else await tx.user.updateMany({ where: { publisherId: removeId }, data: { publisherId: keepId } });

    // Fill blanks on the kept record from the one going.
    const fill: Record<string, unknown> = {};
    for (const key of ["dateOfBirth", "baptismDate", "phone", "email", "address", "emergencyContactName", "emergencyContactPhone", "groupId"] as const) {
      if (keep[key] === null && remove[key] !== null) fill[key] = remove[key];
    }
    if (!keep.isBaptized && remove.isBaptized) fill.isBaptized = true;
    if (keep.pioneerStatus === "NONE" && remove.pioneerStatus !== "NONE") fill.pioneerStatus = remove.pioneerStatus;
    if (keep.appointment === "PUBLISHER" && remove.appointment !== "PUBLISHER") fill.appointment = remove.appointment;
    const notes = [keep.notes, remove.notes].filter(Boolean).join("\n");
    if (notes !== (keep.notes ?? "")) fill.notes = notes;
    fill.privileges = [...new Set([...keep.privileges, ...remove.privileges])];
    await tx.publisher.update({ where: { id: keepId }, data: fill });

    await tx.publisher.delete({ where: { id: removeId } });
  }, { timeout: 30_000 });

  await recordAudit(
    auth.session.userId, "merged", "Publisher", keepId,
    `Merged ${remove.firstName} ${remove.lastName} into ${keep.firstName} ${keep.lastName}: ${moved} report(s) moved, ${dropped} duplicate month(s) dropped`,
  );

  revalidatePath("/publishers");
  revalidatePath(`/publishers/${keepId}`);
  revalidatePath("/dashboard");
  redirect(`/publishers/${keepId}?merged=1`);
}
