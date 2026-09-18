"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/auth";
import { verifyCredentials } from "@/lib/credentials";
import { homeFor } from "@/lib/rbac";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email address and password." };

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) return { error: "That email and password do not match an active account." };

  await prisma.user.update({ where: { id: user.userId }, data: { lastLoginAt: new Date() } });
  await createSession(user);
  await recordAudit(user.userId, "signed in", "User", user.userId, `${user.name} signed in`);

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : homeFor(user.role));
}

export async function signOut() {
  // Signing out of the school area returns to the school's own sign-in page.
  const from = (await headers()).get("referer") ?? "";
  await destroySession();
  redirect(from.includes("/school") ? "/school/login" : "/login");
}
