"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { groupSchema, fieldErrors } from "@/lib/validation";

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
