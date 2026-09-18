"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/auth";
import { verifyCredentials } from "@/lib/credentials";
import { can } from "@/lib/rbac";
import type { LoginState } from "@/app/login/actions";

/**
 * The school overseer's own door. It refuses any account that cannot open the
 * school area — including one whose email and password are right — and says so
 * in the same words either way, so this page gives nothing away about which
 * accounts exist.
 */
export async function signInToSchool(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email address and password." };

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user || !can(user.role, "school:read")) {
    return { error: "That email and password do not open the school area." };
  }

  await prisma.user.update({ where: { id: user.userId }, data: { lastLoginAt: new Date() } });
  await createSession(user);
  await recordAudit(
    user.userId, "signed in", "User", user.userId,
    `${user.name} signed in to the Life and Ministry Meeting School`,
  );

  redirect("/school");
}
