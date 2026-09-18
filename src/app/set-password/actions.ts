"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { passwordSchema } from "@/lib/validation";
import { accountTokenUserId, verifyAccountToken } from "@/lib/account-tokens";
import { homeFor } from "@/lib/rbac";

export type SetPasswordState = { error?: string; errors?: Record<string, string> };

const INVALID =
  "This link does not work any more. Each link works once and then expires — a signup link " +
  "lasts seven days, a reset link one hour. Ask the secretary to send a new signup email, or " +
  "request a reset from the sign-in page.";

/**
 * Chooses a password behind a signed one-time link (signup or reset) and signs
 * the person straight in, so nobody has to type a password they just set.
 */
export async function setPasswordWithToken(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const token = String(formData.get("token") ?? "");

  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { errors: { password: parsed.error.issues[0].message } };
  if (String(formData.get("confirm") ?? "") !== parsed.data) {
    return { errors: { confirm: "The two passwords do not match." } };
  }

  const userId = accountTokenUserId(token);
  const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user || !user.active) return { error: INVALID };

  const checked = verifyAccountToken(token, user.passwordHash);
  if (!checked) return { error: INVALID };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data, 12) },
  });
  await recordAudit(
    user.id, "updated", "User", user.id,
    checked.purpose === "invite"
      ? "Chose their password from a signup email"
      : "Reset their password from an email link",
  );

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  redirect(homeFor(user.role));
}
