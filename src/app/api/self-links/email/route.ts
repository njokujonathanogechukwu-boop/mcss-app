import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { recordAudit } from "@/lib/auth";
import { sendSelfLinkEmails } from "@/lib/self-link-mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!can(session.role, "publisher:write")) {
    return NextResponse.json({ error: "Your account cannot send these emails." }, { status: 403 });
  }

  const summary = await sendSelfLinkEmails();
  await recordAudit(
    session.userId,
    "email",
    "Publisher",
    null,
    `Personal update-link emails: ${summary.sent} sent, ${summary.withoutEmail} without email on file, ${summary.failed.length} failed.`,
  );
  return NextResponse.json(summary);
}
