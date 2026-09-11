"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/auth";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email address and password." };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  // Compare against a dummy hash when the account is missing so that a
  // wrong email and a wrong password take the same amount of time.
  const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const valid = await bcrypt.compare(parsed.data.password, hash);

  if (!user || !valid || !user.active) {
    return { error: "That email and password do not match an active account." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
  await recordAudit(user.id, "signed in", "User", user.id, `${user.name} signed in`);

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/dashboard");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}
