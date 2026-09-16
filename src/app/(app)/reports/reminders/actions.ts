"use server";

import { revalidatePath } from "next/cache";
import { guard, recordAudit } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { sendReminderEmails } from "@/lib/reminders";

export type SendNowState = { ok?: string; error?: string; warnings?: string[] };

/**
 * Send this month's overseer reminder emails immediately, without waiting for
 * the scheduled job. Guarded by report:write; the same permission that lets a
 * user manage the month's reports.
 */
export async function sendRemindersNow(
  _prev: SendNowState,
  formData: FormData,
): Promise<SendNowState> {
  const auth = await guard("report:write");
  if (!auth.ok) return { error: auth.error };

  if (!emailConfigured()) {
    return {
      error:
        "Email is not set up yet. Add the mail variables on the Email page (Gmail: MAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN; or Resend: RESEND_API_KEY) plus CRON_SECRET for the monthly schedule, under Vercel → Settings → Environment variables, then redeploy.",
    };
  }

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "That reporting month is not valid." };
  }

  const result = await sendReminderEmails(year, month);

  await recordAudit(
    auth.session.userId,
    "sent",
    "Reminder",
    `${year}-${month}`,
    `Emailed ${result.sent} overseer reminder(s) for ${month}/${year}; ` +
      `${result.noEmail} group(s) had no email; ${result.failed} failed.`,
  );
  revalidatePath("/reports/reminders");

  if (result.sent === 0 && result.failed === 0) {
    return {
      ok:
        result.noEmail > 0
          ? `Nothing was emailed: ${result.noEmail} group(s) still to report have no email on file. Use WhatsApp for those.`
          : "Nothing to send — every group has reported for this month.",
    };
  }

  const parts = [`${result.sent} reminder email${result.sent === 1 ? "" : "s"} sent`];
  if (result.noEmail) parts.push(`${result.noEmail} group(s) skipped (no email)`);
  if (result.failed) parts.push(`${result.failed} failed`);

  return {
    ok: `${parts.join(", ")}.`,
    warnings: result.errors.length ? result.errors : undefined,
  };
}
