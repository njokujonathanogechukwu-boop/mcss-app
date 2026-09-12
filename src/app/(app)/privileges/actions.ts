"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { privilegeSchema, assignmentSchema, fieldErrors } from "@/lib/validation";

export type PrivilegeState = { error?: string; errors?: Record<string, string>; ok?: string };

export async function createPrivilege(
  _prev: PrivilegeState,
  formData: FormData,
): Promise<PrivilegeState> {
  const auth = await guard("privilege:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = privilegeSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const existing = await prisma.privilege.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
  });
  if (existing) {
    if (existing.active) return { errors: { name: "That privilege already exists." } };
    await prisma.privilege.update({ where: { id: existing.id }, data: { active: true, ...parsed.data } });
  } else {
    const last = await prisma.privilege.aggregate({ _max: { sortOrder: true } });
    await prisma.privilege.create({ data: { ...parsed.data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }

  await recordAudit(auth.session.userId, "created", "Privilege", null, `Added the privilege "${parsed.data.name}"`);
  revalidatePath("/privileges");
  return { ok: `"${parsed.data.name}" added.` };
}

export async function retirePrivilege(formData: FormData) {
  const auth = await guard("privilege:write");
  if (!auth.ok) return;
  const id = String(formData.get("id"));
  const p = await prisma.privilege.findUnique({ where: { id }, select: { name: true } });
  if (!p) return;
  // Retired rather than deleted, so the history of who held it survives.
  await prisma.privilege.update({ where: { id }, data: { active: false } });
  await prisma.publisherPrivilege.updateMany({ where: { privilegeId: id, endDate: null }, data: { endDate: new Date() } });
  await recordAudit(auth.session.userId, "retired", "Privilege", id, `Retired the privilege "${p.name}"`);
  revalidatePath("/privileges");
}

export async function assignPrivilege(
  _prev: PrivilegeState,
  formData: FormData,
): Promise<PrivilegeState> {
  const auth = await guard("privilege:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = assignmentSchema.safeParse({
    publisherId: formData.get("publisherId"),
    privilegeId: formData.get("privilegeId"),
    role: formData.get("role") ?? "ASSIGNEE",
    startDate: formData.get("startDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const { publisherId, privilegeId, role, startDate, notes } = parsed.data;

  const [publisher, privilege, current] = await Promise.all([
    prisma.publisher.findUnique({ where: { id: publisherId }, select: { firstName: true, lastName: true } }),
    prisma.privilege.findUnique({ where: { id: privilegeId }, select: { name: true, active: true } }),
    prisma.publisherPrivilege.findFirst({ where: { publisherId, privilegeId, role, endDate: null } }),
  ]);
  if (!publisher || !privilege || !privilege.active) return { error: "That publisher or privilege no longer exists." };
  if (current) return { errors: { publisherId: `${publisher.firstName} ${publisher.lastName} already holds this.` } };

  await prisma.publisherPrivilege.create({ data: { publisherId, privilegeId, role, startDate, notes } });
  await recordAudit(
    auth.session.userId, "assigned", "PublisherPrivilege", null,
    `${publisher.firstName} ${publisher.lastName}: ${privilege.name} (${role.toLowerCase()})`,
  );

  revalidatePath("/privileges");
  revalidatePath(`/publishers/${publisherId}`);
  return { ok: `${publisher.firstName} ${publisher.lastName} added to ${privilege.name} as ${role.toLowerCase()}.` };
}

export async function endAssignment(formData: FormData) {
  const auth = await guard("privilege:write");
  if (!auth.ok) return;
  const id = String(formData.get("id"));
  const a = await prisma.publisherPrivilege.findUnique({
    where: { id },
    include: { publisher: { select: { firstName: true, lastName: true } }, privilege: { select: { name: true } } },
  });
  if (!a) return;
  // The assignment is closed, not deleted, so the record shows who held what and when.
  await prisma.publisherPrivilege.update({ where: { id }, data: { endDate: new Date() } });
  await recordAudit(
    auth.session.userId, "ended", "PublisherPrivilege", id,
    `${a.publisher.firstName} ${a.publisher.lastName} no longer holds ${a.privilege.name}`,
  );
  revalidatePath("/privileges");
  revalidatePath(`/publishers/${a.publisherId}`);
}
