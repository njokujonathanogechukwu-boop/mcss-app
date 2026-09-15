import "server-only";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { sendBatch, emailConfigured, type BatchRecipient } from "@/lib/email";
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
 * The whole congregation goes out over one connection to the mail account, so
 * it stays inside both the sending account's daily allowance and the request's
 * time budget.
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

  const failed: string[] = [];
  const recipients: BatchRecipient[] = [];
  for (const p of withEmail) {
    const token = p.email ? tokens.get(p.id) : undefined;
    if (!p.email || !token) {
      failed.push(`${displayName(p)}: no link could be created.`);
      continue;
    }
    recipients.push({
      name: displayName(p),
      email: p.email,
      text: body(p.firstName, `${origin}/my/${token}`),
    });
  }

  const result = await sendBatch(recipients, SUBJECT, "", "UPDATE_LINK");
  failed.push(...result.failed.map((f) => `${f.who}: ${f.error}`));

  return { configured: true, sent: result.sent, withoutEmail, failed };
}
