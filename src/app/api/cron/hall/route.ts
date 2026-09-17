import { NextResponse } from "next/server";
import { recipientAddresses, sendHallMail } from "@/lib/hall-mail";
import { emailConfigured } from "@/lib/email";
import { recordAudit } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron calls this once a day (see vercel.json). It emails the Kingdom
 * Hall operating committee about the bookings a week away, and on the first of
 * a month sends them that month's schedule.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without a secret
 * configured the route refuses to run, so it cannot be used to mail the
 * committee on demand.
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

  const result = await sendHallMail();
  const sent = result.steps.filter((s) => s.sent).length;

  if (sent > 0 || result.steps.some((s) => s.error)) {
    await recordAudit(
      null,
      "sent",
      "HallBooking",
      null,
      `Cron emailed the hall operating committee: ` +
        result.steps
          .map((s) => `${s.what} (${s.label || "—"}): ${s.sent ? "sent" : s.error ?? s.skipped ?? "not sent"}`)
          .join("; "),
    );
  }

  return NextResponse.json({
    recipients: recipientAddresses(result.recipients),
    steps: result.steps,
  });
}
