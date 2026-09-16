import "server-only";

import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

/**
 * Outbound email goes through Resend's HTTP API. The key comes from the
 * environment, so nothing here holds a credential and the same code is inert on
 * a laptop with nothing set and live in production.
 *
 * Resend is an API, not a mail server: there is no sign-in for Google to block,
 * so a serverless function on a datacenter IP sends the same as anywhere else.
 */

const RESEND_KEY = process.env.RESEND_API_KEY?.trim() || null;
const FROM_NAME = process.env.MAIL_FROM_NAME?.trim() || "Maitama Congregation";

// Resend's shared test sender. It only ever delivers to the address on your own
// Resend account, so it is enough to prove the wiring but not to reach publishers.
const TEST_SENDER = "onboarding@resend.dev";

export type MailProvider = "resend" | null;

export const NOT_CONFIGURED =
  "Email is not set up yet. Add RESEND_API_KEY (create one at resend.com/api-keys, it starts with " +
  "re_) under Vercel → Settings → Environment variables, then redeploy — environment variables only " +
  "reach the app on the next deployment.";

export function mailProvider(): MailProvider {
  return RESEND_KEY ? "resend" : null;
}

/** True once the app is able to send at all. */
export function emailConfigured(): boolean {
  return mailProvider() !== null;
}

/**
 * The address mail appears to come from. Until a domain is verified this is
 * Resend's test sender, which only reaches the Resend account's own inbox.
 */
export function emailFrom(): string {
  return process.env.REMINDER_EMAIL_FROM?.trim() || `"${FROM_NAME}" <${TEST_SENDER}>`;
}

/**
 * What the running app can see of the mail settings, safe to put on screen: the
 * key's presence and the sending address, never the key itself.
 */
export function mailDiagnostics() {
  const from = emailFrom();
  return {
    provider: mailProvider(),
    resendKey: Boolean(RESEND_KEY),
    from,
    usingTestSender: from.includes(TEST_SENDER),
  };
}

export type SendResult = { ok: boolean; error?: string };

export type MailKind = "REMINDER" | "UPDATE_LINK" | "ANNOUNCEMENT" | "ACCOUNT" | "GENERAL";

/**
 * Turns a Resend HTTP failure into something the secretary can act on. The raw
 * response is kept at the end because it is what makes the unusual cases
 * diagnosable.
 */
function describeResendError(status: number, detail: string): string {
  const raw = detail.replace(/\s+/g, " ").slice(0, 200);

  if (/only send (testing|test) emails|to your own email/i.test(raw)) {
    return `Resend's test sender (${TEST_SENDER}) can only email the address on your own Resend ` +
      `account. To reach publishers, verify a domain at resend.com/domains, set REMINDER_EMAIL_FROM to ` +
      `an address on it, and redeploy. (${raw})`;
  }
  if (status === 401 || status === 403) {
    if (/domain|from address|not verified|verification/i.test(raw)) {
      return `Resend will only send from an address on a domain verified in your Resend account. Add and ` +
        `verify a domain at resend.com/domains, set REMINDER_EMAIL_FROM to an address on it, and redeploy. (${raw})`;
    }
    return `Resend rejected the API key. Check RESEND_API_KEY in Vercel — it starts with re_ — and that it ` +
      `has not been revoked, then redeploy. (${raw})`;
  }
  if (status === 429) {
    return `Resend is holding mail back from this account — too many messages at once, or the daily ` +
      `allowance is used up. Wait a little and send again. (${raw})`;
  }
  if (status === 422) {
    return `Resend did not accept that message — usually a malformed address or a missing verified sender. (${raw})`;
  }
  return `Resend responded ${status}. (${raw})`;
}

function describeNetworkError(err: unknown): string {
  const e = err as { message?: string };
  const raw = String(e?.message || "network error").slice(0, 200);
  return `The platform could not reach Resend's API. This is usually a momentary network fault; if it ` +
    `keeps happening, outbound connections are being blocked. (${raw})`;
}

/** Who pressed the button, when there is a signed-in account to attribute it to. */
async function currentSenderId(): Promise<string | null> {
  try {
    const session = await readSession();
    return session?.userId ?? null;
  } catch {
    return null;
  }
}

type LogEntry = {
  to: string;
  subject: string;
  body: string;
  kind: MailKind;
  provider: NonNullable<MailProvider>;
  ok: boolean;
  error: string | null;
  sentById: string | null;
};

// The copy is a convenience, so a logging failure must not fail the send.
async function record(entry: LogEntry) {
  try {
    await prisma.outboundMail.create({ data: entry });
  } catch {
    // ignored
  }
}

/**
 * Checks the API key against Resend without sending anything. This is how the
 * secretary finds out whether the key reached production and is accepted.
 */
export async function verifyMailConnection(): Promise<SendResult> {
  if (!RESEND_KEY) return { ok: false, error: NOT_CONFIGURED };

  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: describeResendError(res.status, detail) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeNetworkError(err) };
  }
}

async function sendViaResend(to: string[], subject: string, text: string): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: emailFrom(), to, subject, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: describeResendError(res.status, detail) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeNetworkError(err) };
  }
}

/**
 * Sends one plain-text email to one or more recipients and keeps a copy of it.
 * Never throws: a failed send comes back as a result the caller can show.
 *
 * `loggedText` overrides what is stored. Use it when the message carries
 * something that must not sit in the database — the copy is part of the JSON
 * backup, so a first password belongs in the mail and nowhere else.
 */
export async function sendEmail(
  to: string[],
  subject: string,
  text: string,
  kind: MailKind = "GENERAL",
  loggedText?: string,
): Promise<SendResult> {
  if (!RESEND_KEY) return { ok: false, error: NOT_CONFIGURED };

  const recipients = to.map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "No recipient address." };

  const result = await sendViaResend(recipients, subject, text);

  await record({
    to: recipients.join(", "),
    subject,
    body: loggedText ?? text,
    kind,
    provider: "resend",
    ok: result.ok,
    error: result.error ?? null,
    sentById: await currentSenderId(),
  });

  return result;
}

export type BatchRecipient = {
  name?: string | null;
  email: string;
  /** Overrides the shared subject — used when each person's message differs. */
  subject?: string;
  /** Overrides the shared body. */
  text?: string;
};
export type BatchFailure = { who: string; error: string };
export type BatchResult = { sent: number; failed: BatchFailure[] };

/**
 * Sends one message to each recipient in turn, a few at a time, so a
 * congregation-wide mail fits inside a function's time budget. Every recipient
 * still gets their own email: nobody is copied on a long To: line.
 */
export async function sendBatch(
  recipients: BatchRecipient[],
  subject: string,
  text: string,
  kind: MailKind = "GENERAL",
): Promise<BatchResult> {
  if (!RESEND_KEY) {
    return {
      sent: 0,
      failed: recipients.map((r) => ({ who: r.name || r.email, error: NOT_CONFIGURED })),
    };
  }

  const sentById = await currentSenderId();
  const shared = { subject, text };
  const queue = [...recipients];
  const failures: BatchFailure[] = [];
  let sent = 0;

  const note = async (r: BatchRecipient, subject: string, text: string, result: SendResult) => {
    if (result.ok) sent++;
    else failures.push({ who: r.name || r.email, error: result.error ?? "send failed" });
    await record({
      to: r.email,
      subject,
      body: text,
      kind,
      provider: "resend",
      ok: result.ok,
      error: result.error ?? null,
      sentById,
    });
  };

  const worker = async () => {
    for (;;) {
      const r = queue.shift();
      if (!r) return;
      const subject = r.subject ?? shared.subject;
      const text = r.text ?? shared.text;
      await note(r, subject, text, await sendViaResend([r.email], subject, text));
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  return { sent, failed: failures };
}
