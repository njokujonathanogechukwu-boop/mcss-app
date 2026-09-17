"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { groupSchema, fieldErrors } from "@/lib/validation";
import { rotateGroupToken } from "@/lib/group-reports";

export type GroupState = { error?: string; errors?: Record<string, string>; ok?: string };

export async function saveGroup(
  id: string | null,
  _prev: GroupState,
  formData: FormData,
): Promise<GroupState> {
  const auth = await guard("group:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = groupSchema.safeParse({
    number: formData.get("number"),
    name: formData.get("name"),
    overseerId: formData.get("overseerId") ?? "",
    assistantId: formData.get("assistantId") ?? "",
    active: formData.get("active") === "true",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const clash = await prisma.serviceGroup.findFirst({
    where: { number: parsed.data.number, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  });
  if (clash) return { errors: { number: "Another group already uses this number." } };

  if (
    parsed.data.overseerId &&
    parsed.data.overseerId === parsed.data.assistantId
  ) {
    return { errors: { assistantId: "The assistant must be someone other than the overseer." } };
  }

  const group = id
    ? await prisma.serviceGroup.update({ where: { id }, data: parsed.data })
    : await prisma.serviceGroup.create({ data: parsed.data });

  await recordAudit(
    auth.session.userId, id ? "updated" : "created", "ServiceGroup", group.id,
    `Group ${group.number} — ${group.name}`,
  );

  revalidatePath("/groups");
  return { ok: id ? "Group updated." : "Group created." };
}

export type RotateLinkState = { error?: string; ok?: string; link?: string };

/**
 * Replaces a group's report link, so the one already given out stops working.
 * Nothing the overseer has sent is touched — only the address changes.
 */
export async function rotateGroupReportLink(groupId: string): Promise<RotateLinkState> {
  const auth = await guard("group:write");
  if (!auth.ok) return { error: auth.error };

  const group = await prisma.serviceGroup.findUnique({
    where: { id: groupId },
    select: { id: true, number: true, name: true },
  });
  if (!group) return { error: "That group is not on file." };

  const link = await rotateGroupToken(group.id);

  await recordAudit(
    auth.session.userId, "rotated", "ServiceGroup", group.id,
    `Replaced Group ${group.number}'s report link — the old one stopped working.`,
  );

  revalidatePath(`/groups/${group.id}`);
  revalidatePath("/reports/reminders");
  return { ok: "Replaced. The old link no longer works.", link: link ?? undefined };
}
