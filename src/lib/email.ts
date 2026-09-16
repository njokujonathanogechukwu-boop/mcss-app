import "server-only";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

/**
 * Outbound email goes through Gmail with OAuth2 when the app has the account and
 * a Google OAuth client plus refresh token, and through Resend's HTTP API when it
 * only has a Resend key. No credential lives here: everything comes from the
 * environment, so the same code is inert on a laptop with nothing set and live in
 * production.
 *
 * Gmail is signed into with OAuth2, not a password. Google refuses password
 * (app-password) logins from datacenter IP addresses — Vercel included — with
 * 534-5.7.9, but it accepts an OAuth2 bearer token from anywhere, which is what
 * makes sending from a serverless function possible without owning a domain.
 */

const GMAIL_USER = process.env.MAIL_USER?.trim() || null;
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID?.trim() || null;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET?.trim() || null;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN?.trim() || null;
const RESEND_KEY = process.env.RESEND_API_KEY?.trim() || null;
const FROM_NAME = process.env.MAIL_FROM_NAME?.trim() || "Maitama Congregation";

// Resend's shared test sender. It only ever delivers to the address on your own
// Resend account, so it is enough to prove the wiring but not to reach publishers.
const TEST_SENDER = "onboarding@resend.dev";

const GMAIL_READY = Boolean(
  GMAIL_USER && GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN,
);

export type MailProvider = "gmail" | "resend" | null;

export const NOT_CONFIGURED =
  "Email is not set up yet. For Gmail add MAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and " +
  "GMAIL_REFRESH_TOKEN, or for Resend add RESEND_API_KEY — under Vercel → Settings → Environment " +
  "variables, then redeploy. Environment variables only reach the app on the next deployment.";

export function mailProvider(): MailProvider {
  if (GMAIL_READY) return "gmail";
  if (RESEND_KEY) return "resend";
  return null;
}

/** True once the app is able to send at all. */
export function emailConfigured(): boolean {
  return mailProvider() !== null;
}

/**
 * The address mail appears to come from. Gmail only lets an account send as
 * itself, so there the display name is the only part that can be chosen; Resend
 * uses the verified sender address until a domain is set.
 */
export function emailFrom(): string {
  if (mailProvider() === "gmail") return `"${FROM_NAME}" <${GMAIL_USER}>`;
  return process.env.REMINDER_EMAIL_FROM?.trim() || `"${FROM_NAME}" <${TEST_SENDER}>`;
}

/**
 * What the running app can see of the mail settings, safe to put on screen: the
 * account and which credentials arrived, never the secrets themselves.
 */
export function mailDiagnostics() {
  const provider = mailProvider();
  const from = emailFrom();
  return {
    provider,
    gmailReady: GMAIL_READY,
    gmailUser: GMAIL_USER,
    gmailClientId: Boolean(GMAIL_CLIENT_ID),
    gmailClientSecret: Boolean(GMAIL_CLIENT_SECRET),
    gmailRefreshToken: Boolean(GMAIL_REFRESH_TOKEN),
    resendKey: Boolean(RESEND_KEY),
    from,
    usingTestSender: provider === "resend" && from.includes(TEST_SENDER),
  };
}

export type SendResult = { ok: boolean; error?: string };

export type MailKind = "REMINDER" | "UPDATE_LINK" | "ANNOUNCEMENT" | "ACCOUNT" | "GENERAL";

const REACH_HINT =
  "The platform could not reach Gmail's mail server. This is usually a momentary network fault; " +
  "if it keeps happening the account's outbound connections are being blocked.";

/**
 * Turns a raw SMTP, OAuth or network failure into something the secretary can act
 * on. The original text is kept at the end because it is what makes the unusual
 * cases diagnosable.
 */
function describeMailError(err: unknown, fallback: string): string {
  const e = err as { message?: string; code?: string; responseCode?: number; response?: string };
  const raw = String(e?.message || e?.response || fallback).slice(0, 200);
  const code = e?.responseCode ?? 0;

  if (/invalid_grant|token has been expired|revoked|refresh.?token|invalid_client|bad request/i.test(raw)) {
    return `Google rejected the sign-in token. GMAIL_REFRESH_TOKEN was revoked or has expired — this happens ` +
      `if the Google password changed, the OAuth app was left in "Testing" (tokens then last 7 days), or it ` +
      `sat unused for six months. Make a fresh refresh token in the OAuth Playground, put it in Vercel and ` +
      `redeploy. (${raw})`;
  }
  if (code === 400 || /invalid.?scope|invalid.?audience|access.?token/i.test(raw)) {
    return `Google did not grant the mail scope. The token has to be created with the https://mail.google.com/ ` +
      `scope. Redo the Playground authorisation with that scope and update GMAIL_REFRESH_TOKEN. (${raw})`;
  }
  if (code === 535 || code === 534 || e?.code === "EAUTH" ||
      /username and password not accepted|invalid credentials|authentication fail|web.?login/i.test(raw)) {
    return `Gmail refused the OAuth2 sign-in. Check that MAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and ` +
      `GMAIL_REFRESH_TOKEN all come from the same Google Cloud project and the same account, and that the ` +
      `Gmail API is enabled for that project. (${raw})`;
  }
  if (code === 421 || code === 454 || /too many|rate.?limit|quota|try again later/i.test(raw)) {
    return `Gmail is holding mail back from this account — its daily allowance is used up, or too many ` +
      `messages went out at once. Wait and send again tomorrow. (${raw})`;
  }
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ESOCKET", "EPIPE", "EHOSTUNREACH", "ENOTFOUND"].includes(e?.code ?? "") ||
      /socket hang up|getaddrinfo|timeout|connection closed|connect ECONN/i.test(raw)) {
    return `${REACH_HINT} (${raw})`;
  }
  if (/self.signed|certificate|unable to verify|\bssl\b|\btls\b/i.test(raw)) {
    return `The secure connection to Gmail was not trusted, so nothing was sent. (${raw})`;
  }
  if (code === 550 || /recipient address rejected|mailbox unavailable|no such user|relay/i.test(raw)) {
    return `Gmail did not accept that address. Check the spelling of the address on the publisher's ` +
      `record. (${raw})`;
  }
  return raw;
}

/**
 * Turns a Resend HTTP failure into something the secretary can act on.
 */
function describeResendError(status: number, detail: string): string {
  const raw = detail.replace(/\s+/g, " ").slice(0, 200);

  if (/only send (testing|test) emails|to your own email/i.test(raw)) {
    return `Resend's test sender (${TEST_SENDER}) can only email the address on your own Resend account. To ` +
      `reach publishers, verify a domain at resend.com/domains, set REMINDER_EMAIL_FROM to an address on it, ` +
      `and redeploy. (${raw})`;
  }
  if (status === 401 || status === 403) {
    if (/domain|from address|not verified|verification/i.test(raw)) {
      return `Resend will only send from an address on a domain verified in your Resend account. Add and verify ` +
        `a domain at resend.com/domains, set REMINDER_EMAIL_FROM to an address on it, and redeploy. (${raw})`;
    }
    return `Resend rejected the API key. Check RESEND_API_KEY in Vercel — it starts with re_ — and that it has ` +
      `not been revoked, then redeploy. (${raw})`;
  }
  if (status === 429) {
    return `Resend is holding mail back from this account — too many messages at once, or the daily allowance is ` +
      `used up. Wait a little and send again. (${raw})`;
  }
  if (status === 422) {
    return `Resend did not accept that message — usually a malformed address or a missing verified sender. (${raw})`;
  }
  return `Resend responded ${status}. (${raw})`;
}

function describeNetworkError(err: unknown): string {
  const e = err as { message?: string };
  const raw = String(e?.message || "network error").slice(0, 200);
  return `The platform could not reach the mail service. This is usually a momentary network fault; if it keeps ` +
    `happening, outbound connections are being blocked. (${raw})`;
}

/**
 * A serverless function is kept warm and reused, and Gmail drops a connection
 * that sits idle between requests — so a transport held at module level hands the
 * next send a socket that is already dead. One transport per burst, closed when
 * the burst ends, keeps every message on a connection this request opened.
 * nodemailer refreshes the OAuth2 access token itself from the refresh token.
 */
function makeGmailTransport(): Transporter {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: GMAIL_USER!,
      clientId: GMAIL_CLIENT_ID!,
      clientSecret: GMAIL_CLIENT_SECRET!,
      refreshToken: GMAIL_REFRESH_TOKEN!,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 200,
  });
}

function closeTransport(transport: Transporter) {
  try {
    transport.close();
  } catch {
    // ignored: the platform tears the connection down with the function anyway
  }
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
 * Signs in to the mail service and reports what happened, without sending
 * anything. This is how the secretary finds out whether the credentials reached
 * production and whether they are accepted.
 */
export async function verifyMailConnection(): Promise<SendResult> {
  const provider = mailProvider();
  if (!provider) return { ok: false, error: NOT_CONFIGURED };

  if (provider === "gmail") {
    const transport = makeGmailTransport();
    try {
      await transport.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: describeMailError(err, "Gmail would not let the account sign in.") };
    } finally {
      closeTransport(transport);
    }
  }

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
  const provider = mailProvider();
  if (!provider) return { ok: false, error: NOT_CONFIGURED };

  const recipients = to.map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "No recipient address." };

  let result: SendResult;
  if (provider === "gmail") {
    const transport = makeGmailTransport();
    try {
      await transport.sendMail({ from: emailFrom(), to: recipients, subject, text });
      result = { ok: true };
    } catch (err) {
      result = { ok: false, error: describeMailError(err, "Gmail refused the message.") };
    } finally {
      closeTransport(transport);
    }
  } else {
    result = await sendViaResend(recipients, subject, text);
  }

  await record({
    to: recipients.join(", "),
    subject,
    body: loggedText ?? text,
    kind,
    provider,
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
 * Sends one message to each recipient in turn over a single connection, so a
 * congregation-wide mail fits inside a function's time budget. Every recipient
 * still gets their own email: nobody is copied on a long To: line.
 */
export async function sendBatch(
  recipients: BatchRecipient[],
  subject: string,
  text: string,
  kind: MailKind = "GENERAL",
): Promise<BatchResult> {
  const provider = mailProvider();
  if (!provider) {
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
      provider,
      ok: result.ok,
      error: result.error ?? null,
      sentById,
    });
  };

  if (provider === "gmail") {
    const transport = makeGmailTransport();
    const worker = async () => {
      for (;;) {
        const r = queue.shift();
        if (!r) return;
        const subject = r.subject ?? shared.subject;
        const text = r.text ?? shared.text;
        let result: SendResult;
        try {
          await transport.sendMail({ from: emailFrom(), to: [r.email], subject, text });
          result = { ok: true };
        } catch (err) {
          result = { ok: false, error: describeMailError(err, "Gmail refused the message.") };
        }
        await note(r, subject, text, result);
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
    } finally {
      closeTransport(transport);
    }
  } else {
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
  }

  return { sent, failed: failures };
}
