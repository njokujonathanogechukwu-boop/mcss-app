import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, type SendResult } from "@/lib/email";
import { requestOrigin } from "@/lib/self-service";
import { signAccountToken, TOKEN_DAYS } from "@/lib/account-tokens";
import { ROLE_LABELS } from "@/lib/rbac";

export const RESET_SUBJECT = "Reset your sign-in password";
const SIGNUP_SUBJECT = "Your account on the Maitama Congregation system";

type AccountRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
};

/**
 * The one-time link is a password key, so the copy kept in the mail log (which
 * ends up in the backup) is written without it.
 */
function signupBody(user: AccountRow, origin: string, token: string | null): string {
  return [
    `Dear ${user.name},`,
    "",
    `You have an account on the Maitama Congregation Secretary System as ${ROLE_LABELS[user.role]}.`,
    "",
    token
      ? `Choose your password with this link. It works once and expires in ${TOKEN_DAYS.invite}:`
      : "The one-time link this email carried is kept out of the mail log.",
    ...(token ? ["", `${origin}/set-password?token=${token}`] : []),
    "",
    `Your sign-in email is ${user.email}.`,
    "If the link does not work, ask the congregation secretary to send a new one.",
    "",
    "If you were not expecting this, please tell the congregation secretary.",
    "",
    "Maitama Congregation Secretary",
  ].join("\n");
}

function resetBody(user: AccountRow, origin: string, token: string | null): string {
  return [
    `Dear ${user.name},`,
    "",
    "Somebody asked to reset the password for your account on the Maitama Congregation Secretary System.",
    "",
    token
      ? `Choose a new password with this link. It works once and expires in ${TOKEN_DAYS.reset}:`
      : "The one-time link this email carried is kept out of the mail log.",
    ...(token ? ["", `${origin}/set-password?token=${token}`] : []),
    "",
    `Your sign-in email is ${user.email}.`,
    "If you did not ask for this, ignore this email and your password stays as it is.",
    "",
    "Maitama Congregation Secretary",
  ].join("\n");
}

export async function sendSignupMail(user: AccountRow): Promise<SendResult> {
  const origin = await requestOrigin();
  if (!origin) return { ok: false, error: "The site address for the link could not be worked out." };
  const token = signAccountToken(user.id, user.passwordHash, "invite");
  return sendEmail(
    [user.email],
    SIGNUP_SUBJECT,
    signupBody(user, origin, token),
    "ACCOUNT",
    signupBody(user, origin, null),
  );
}

/**
 * A reset mail for one account at most once per ten minutes: the request form
 * is public, and without a cooldown it could be used to flood one address —
 * and the congregation's sending reputation — with reset mails.
 */
export async function sendResetMail(user: AccountRow): Promise<SendResult & { skipped?: boolean }> {
  const origin = await requestOrigin();
  if (!origin) return { ok: false, error: "The site address for the link could not be worked out." };

  const recent = await prisma.outboundMail.findFirst({
    where: {
      to: user.email,
      kind: "ACCOUNT",
      subject: RESET_SUBJECT,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (recent) return { ok: true, skipped: true };

  const token = signAccountToken(user.id, user.passwordHash, "reset");
  return sendEmail(
    [user.email],
    RESET_SUBJECT,
    resetBody(user, origin, token),
    "ACCOUNT",
    resetBody(user, origin, null),
  );
}
