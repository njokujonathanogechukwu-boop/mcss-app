"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { userSchema, passwordSchema, fieldErrors } from "@/lib/validation";

export type UserState = { error?: string; errors?: Record<string, string>; ok?: string };

export async function createUser(_prev: UserState, formData: FormData): Promise<UserState> {
  const auth = await guard("user:manage");
  if (!auth.ok) return { error: auth.error };

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    active: formData.get("active") === "true",
    publisherId: formData.get("publisherId") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { errors: { password: password.error.issues[0].message } };

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return { errors: { email: "An account already uses this email." } };
  }

  const user = await prisma.user.create({
    data: {
      ...parsed.data,
      email,
      passwordHash: await bcrypt.hash(password.data, 12),
    },
  });

  await recordAudit(auth.session.userId, "created", "User", user.id, `Created an account for ${user.name}`);
  revalidatePath("/settings");
  return { ok: `Account created for ${user.name}. Ask them to change the password when they first sign in.` };
}

export async function setUserRole(formData: FormData) {
  const auth = await guard("user:manage");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"].includes(role)) return;

  // Never leave the system without an administrator.
  if (id === auth.session.userId && !["SECRETARY", "COORDINATOR"].includes(role)) return;

  await prisma.user.update({
    where: { id },
    data: { role: role as "SECRETARY" | "COORDINATOR" | "ELDER" | "SERVANT" | "VIEWER" },
  });
  await recordAudit(auth.session.userId, "updated", "User", id, `Role set to ${role}`);
  revalidatePath("/settings");
}

export async function toggleUser(formData: FormData) {
  const auth = await guard("user:manage");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  if (id === auth.session.userId) return; // no locking yourself out

  const user = await prisma.user.findUnique({ where: { id }, select: { active: true, name: true } });
  if (!user) return;

  await prisma.user.update({ where: { id }, data: { active: !user.active } });
  await recordAudit(
    auth.session.userId, "updated", "User", id,
    `${user.active ? "Suspended" : "Restored"} ${user.name}`,
  );
  revalidatePath("/settings");
}

export async function changeOwnPassword(_prev: UserState, formData: FormData): Promise<UserState> {
  const auth = await guard("publisher:read");
  if (!auth.ok) return { error: auth.error };

  const current = String(formData.get("currentPassword") ?? "");
  const next = passwordSchema.safeParse(formData.get("newPassword"));
  if (!next.success) return { errors: { newPassword: next.error.issues[0].message } };

  const user = await prisma.user.findUnique({ where: { id: auth.session.userId } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    return { errors: { currentPassword: "That is not your current password." } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next.data, 12) },
  });
  await recordAudit(user.id, "updated", "User", user.id, "Changed their own password");
  return { ok: "Your password has been changed." };
}
