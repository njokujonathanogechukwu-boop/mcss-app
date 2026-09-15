import { NextResponse } from "next/server";
import { reportingMonth } from "@/lib/service-year";
import { sendReminderEmails } from "@/lib/reminders";
import { emailConfigured } from "@/lib/email";
import { recordAudit } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron calls this on a schedule (see vercel.json) to email each field
 * service overseer about the publishers in their group who have not reported
 * for the month just ended — the one the congregation report to the branch is
 * due for by the 20th.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without a secret
 * configured the route refuses to run, so it can never be used as an open
 * relay to email overseers.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!emailConfigured()) {
    return NextResponse.json({ error: "No mail account is configured; nothing sent." }, { status: 200 });
  }

  const { year, month } = reportingMonth();
  const result = await sendReminderEmails(year, month);

  await recordAudit(
    null,
    "sent",
    "Reminder",
    `${year}-${month}`,
    `Cron emailed ${result.sent} overseer reminder(s) for ${month}/${year}; ` +
      `${result.noEmail} group(s) had no email; ${result.failed} failed.`,
  );

  return NextResponse.json({ period: `${year}-${month}`, ...result });
}
