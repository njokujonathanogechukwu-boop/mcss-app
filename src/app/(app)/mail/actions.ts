"use server";

import { revalidatePath } from "next/cache";
import { guard, recordAudit } from "@/lib/auth";
import { mailSchema, fieldErrors } from "@/lib/validation";
import {
  NOT_CONFIGURED,
  emailConfigured,
  mailDiagnostics,
  sendBatch,
  sendEmail,
  verifyMailConnection,
  type MailKind,
} from "@/lib/email";
import { resolveAudience } from "@/lib/mail-audience";
import { isEmailAddress } from "@/lib/mail-addresses";

export type MailState = { error?: string; errors?: Record<string, string>; ok?: string };

const AUDIENCE_LABEL: Record<string, string> = {
  manual: "a typed list",
  group: "one service group",
  all: "the whole congregation",
};

/** What the running app can see of the mail settings, in one readable line. */
function describeSettings(): string {
  const d = mailDiagnostics();
  const password = d.passwordChars === 0
    ? "not set"
    : `${d.passwordChars} characters${d.passwordChars === 16 ? "" : " — an app password is 16 letters"}`;
  return (
    `What the platform can see: MAIL_USER ${d.user ?? "not set"}, MAIL_APP_PASSWORD ${password}, ` +
    `RESEND_API_KEY ${d.resendKey ? "set" : "not set"}.`
  );
}

/**
 * Sends one composed message to an audience. Each person gets their own email
 * rather than being copied on one long To: line, so no publisher's address is
 * handed to the rest of the congregation.
 */
export async function sendMail(_prev: MailState, formData: FormData): Promise<MailState> {
  const auth = await guard("mail:send");
  if (!auth.ok) return { error: auth.error };

  if (!emailConfigured()) return { error: NOT_CONFIGURED };

  const parsed = mailSchema.safeParse({
    audience: formData.get("audience"),
    addresses: formData.get("addresses") ?? "",
    groupId: formData.get("groupId") ?? "",
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { audience, subject, body } = parsed.data;
  if (audience === "group" && !parsed.data.groupId) {
    return { errors: { groupId: "Choose which service group." } };
  }

  const kind: MailKind = formData.get("kind") === "ANNOUNCEMENT" ? "ANNOUNCEMENT" : "GENERAL";
  const { recipients, withoutEmail, invalid } = await resolveAudience(parsed.data);

  if (invalid.length > 0) {
    return {
      errors: {
        addresses: `Not an email address: ${invalid.slice(0, 5).join(", ")}` +
          (invalid.length > 5 ? ` and ${invalid.length - 5} more` : ""),
      },
    };
  }
  if (recipients.length === 0) {
    return {
      error: withoutEmail
        ? `Nobody in that audience has an email address on file — ${withoutEmail} publisher(s) have none. Use WhatsApp or SMS instead.`
        : "There is nobody to send to.",
    };
  }

  const result = await sendBatch(recipients, subject, body, kind);
  const failed = result.failed.map((f) => `${f.who}: ${f.error}`);

  await recordAudit(
    auth.session.userId, "sent", "OutboundMail", null,
    `Emailed "${subject}" to ${result.sent} address(es) in ${AUDIENCE_LABEL[audience]}; ${failed.length} failed.`,
  );
  revalidatePath("/mail");

  const parts = [
    `${result.sent} of ${recipients.length} email${recipients.length === 1 ? "" : "s"} went out to ${AUDIENCE_LABEL[audience]}.`,
  ];
  if (withoutEmail) parts.push(`${withoutEmail} publisher(s) have no email address and were skipped.`);
  if (failed.length) parts.push(`Failed: ${failed.slice(0, 4).join(" · ")}`);

  return result.sent === 0 ? { error: parts.join(" ") } : { ok: parts.join(" ") };
}

/**
 * Signs in to the mail account and sends one test message, then says in plain
 * words which part broke. The settings line is included on failure because the
 * usual cause is a variable that never reached this deployment.
 */
export async function testMailConnection(_prev: MailState, formData: FormData): Promise<MailState> {
  const auth = await guard("mail:send");
  if (!auth.ok) return { error: auth.error };

  const typed = String(formData.get("to") ?? "").trim();
  const to = typed || auth.session.email;
  if (!isEmailAddress(to)) return { errors: { to: `"${typed}" is not an email address.` } };

  const check = await verifyMailConnection();
  if (!check.ok) {
    return { error: `${check.error}\n\n${describeSettings()}` };
  }

  const provider = mailDiagnostics().provider;
  const result = await sendEmail(
    [to],
    "Test email from Maitama Congregation",
    "This is a test message from the Maitama Congregation Secretary System.\n\n" +
      "If you can read this, the platform is able to send email. Reminders, personal update " +
      "links, announcements and new-account details will all go out this way.",
    "GENERAL",
  );
  revalidatePath("/mail");

  if (!result.ok) {
    return { error: `Signing in to ${provider} worked, but the test message did not go out: ${result.error}` };
  }
  return {
    ok: `Signed in to ${provider} and sent a test message to ${to}. If it has not arrived within a ` +
      `minute, look in the junk folder.`,
  };
}
