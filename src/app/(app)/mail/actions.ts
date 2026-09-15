"use server";

import { revalidatePath } from "next/cache";
import { guard, recordAudit } from "@/lib/auth";
import { mailSchema, fieldErrors } from "@/lib/validation";
import { emailConfigured, sendEmail, type MailKind } from "@/lib/email";
import { resolveAudience } from "@/lib/mail-audience";

export type MailState = { error?: string; errors?: Record<string, string>; ok?: string };

const NOT_CONFIGURED =
  "Email is not set up yet. Add MAIL_USER and MAIL_APP_PASSWORD (the Gmail account and its app " +
  "password) under Vercel → Settings → Environment variables, then redeploy.";

const AUDIENCE_LABEL: Record<string, string> = {
  manual: "a typed list",
  group: "one service group",
  all: "the whole congregation",
};

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

  let sent = 0;
  const failed: string[] = [];
  const queue = [...recipients];

  const worker = async () => {
    for (;;) {
      const r = queue.shift();
      if (!r) return;
      const result = await sendEmail([r.email], subject, body, kind);
      if (result.ok) sent++;
      else failed.push(`${r.name || r.email}: ${result.error}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  await recordAudit(
    auth.session.userId, "sent", "OutboundMail", null,
    `Emailed "${subject}" to ${sent} address(es) in ${AUDIENCE_LABEL[audience]}; ${failed.length} failed.`,
  );
  revalidatePath("/mail");

  const parts = [
    `${sent} of ${recipients.length} email${recipients.length === 1 ? "" : "s"} went out to ${AUDIENCE_LABEL[audience]}.`,
  ];
  if (withoutEmail) parts.push(`${withoutEmail} publisher(s) have no email address and were skipped.`);
  if (failed.length) parts.push(`Failed: ${failed.slice(0, 4).join(" · ")}`);

  return sent === 0 ? { error: parts.join(" ") } : { ok: parts.join(" ") };
}
