"use server";

import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/auth";
import { userSchema } from "@/lib/validation";
import { sendResetMail } from "@/lib/account-mail";

export type ForgotState = { ok?: string; errors?: Record<string, string> };

// The same words whether or not the address exists, so the form cannot be used
// to find out who has an account.
const GENERIC =
  "If an account matches that address, a link to choose a new password is on its way. It works " +
  "once and expires in one hour — check the junk folder if it does not appear.";

export async function requestPasswordReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = userSchema.shape.email.safeParse(formData.get("email") ?? "");
  if (!parsed.success) return { errors: { email: "Enter the email address on your account." } };

  const user = await prisma.user.findUnique({ where: { email: parsed.data } });
  if (!user || !user.active) return { ok: GENERIC };

  const result = await sendResetMail(user);
  if (result.ok && !result.skipped) {
    await recordAudit(null, "requested", "User", user.id, `Password reset requested for ${user.name}`);
  }
  return { ok: GENERIC };
}
