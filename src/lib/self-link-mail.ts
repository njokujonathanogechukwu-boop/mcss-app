import "server-only";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { sendEmail, emailConfigured } from "@/lib/email";
import { ensureSelfTokens, requestOrigin } from "@/lib/self-service";

export type SelfLinkMailSummary = {
  configured: boolean;
  sent: number;
  withoutEmail: number;
  failed: string[];
};

const SUBJECT = "Please check your details — Maitama Congregation";

function body(name: string, link: string): string {
  return [
    `Dear ${name},`,
    "",
    "We are checking that the congregation's records are correct. Please open your",
    "personal page below and confirm or correct your details — your date of birth,",
    "baptism, phone number, home address and who to contact in an emergency:",
    "",
    link,
    "",
    "This page is personal to you. Please do not forward it, because anyone holding",
    "the link can change your details.",
    "",
    "If everything on the page is already correct, there is nothing you need to do.",
    "",
    "Thank you for your help.",
    "Maitama Congregation Secretary",
  ].join("\n");
}

/**
 * Emails every publisher who has an email address their personal update link.
 * Sends four at a time so a full congregation stays inside Resend's rate limit
 * and the request's time budget.
 */
export async function sendSelfLinkEmails(): Promise<SelfLinkMailSummary> {
  if (!emailConfigured()) return { configured: false, sent: 0, withoutEmail: 0, failed: [] };

  const origin = await requestOrigin();
  if (!origin) {
    return { configured: true, sent: 0, withoutEmail: 0, failed: ["Could not work out the site address."] };
  }

  const [withEmail, withoutEmail] = await Promise.all([
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] }, email: { not: null } },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.publisher.count({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] }, email: null },
    }),
  ]);
  const tokens = await ensureSelfTokens(withEmail.map((p) => p.id));

  let sent = 0;
  const failed: string[] = [];
  const queue = [...withEmail];

  const worker = async () => {
    for (;;) {
      const p = queue.shift();
      if (!p || !p.email) return;
      const token = tokens.get(p.id);
      if (!token) {
        failed.push(`${displayName(p)}: no link could be created.`);
        continue;
      }
      const result = await sendEmail([p.email], SUBJECT, body(p.firstName, `${origin}/my/${token}`));
      if (result.ok) sent++;
      else failed.push(`${displayName(p)}: ${result.error}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  return { configured: true, sent, withoutEmail, failed };
}
