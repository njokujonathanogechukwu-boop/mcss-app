import "server-only";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";

/**
 * Outbound email goes through Gmail's mail server when the app has an account
 * and app password, and through Resend's HTTP API when it only has a key. No
 * credential lives here: both come from the environment, so the same code is
 * inert on a laptop with nothing set and live in production.
 */

const GMAIL_USER = process.env.MAIL_USER?.trim() || null;
// Google shows an app password in blocks of four, so it is usually pasted with
// spaces in it — and Gmail's server rejects it exactly as typed.
const GMAIL_PASSWORD = process.env.MAIL_APP_PASSWORD?.replace(/\s+/g, "") || null;
const FROM_NAME = process.env.MAIL_FROM_NAME?.trim() || "Maitama Congregation";

// The placeholder printed in .env.example is 16 letters once its spaces go, so
// it passes every length check and is rejected by Gmail every time.
const EXAMPLE_PASSWORD = "abcdefghijklmnop";

export type MailProvider = "gmail" | "resend" | null;

export const NOT_CONFIGURED =
  "Email is not set up yet. Add MAIL_USER and MAIL_APP_PASSWORD (the Gmail account and its app " +
  "password) under Vercel → Settings → Environment variables, then redeploy — environment " +
  "variables only reach the app on the next deployment.";

export function mailProvider(): MailProvider {
  if (GMAIL_USER && GMAIL_PASSWORD) return "gmail";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

/** True once the app is able to send at all. */
export function emailConfigured(): boolean {
  return mailProvider() !== null;
}

/**
 * What the running app can see of the mail settings, safe to put on screen: the
 * account and whether a password arrived, never the password itself.
 */
export function mailDiagnostics() {
  return {
    provider: mailProvider(),
    user: GMAIL_USER,
    passwordChars: GMAIL_PASSWORD?.length ?? 0,
    isExamplePassword: GMAIL_PASSWORD?.toLowerCase() === EXAMPLE_PASSWORD,
    fromName: FROM_NAME,
    resendKey: Boolean(process.env.RESEND_API_KEY),
  };
}

/**
 * The address mail appears to come from. Gmail only lets an account send as
 * itself, so the display name is the only part that can be chosen.
 */
export function emailFrom(): string {
  if (mailProvider() === "gmail") return `"${FROM_NAME}" <${GMAIL_USER}>`;
  return process.env.REMINDER_EMAIL_FROM || "Maitama Congregation <onboarding@resend.dev>";
}

export type SendResult = { ok: boolean; error?: string };

export type MailKind = "REMINDER" | "UPDATE_LINK" | "ANNOUNCEMENT" | "ACCOUNT" | "GENERAL";

const SIGN_IN_HINT =
  "Gmail refused the sign-in. MAIL_APP_PASSWORD has to be a 16-letter app password made at " +
  "Google → Security → App passwords, and that account must have 2-Step Verification turned on — " +
  "an ordinary Gmail password is always rejected. Replace it in Vercel and redeploy.";

const WEB_LOGIN_HINT =
  "Gmail knows the password but wants one sign-in from a browser before it trusts mail from a server. " +
  "On a phone or computer, sign in to the Gmail account in an ordinary browser and clear any security " +
  "prompt it shows. Then, still signed in, open https://accounts.google.com/b/0/DisplayUnlockCaptcha " +
  "and press Continue. If it still refuses afterwards, delete the app password, make a fresh 16-letter " +
  "one and paste that into Vercel.";

const REACH_HINT =
  "The platform could not reach Gmail's mail server. This is usually a momentary network fault; " +
  "if it keeps happening the account's outbound connections are being blocked.";

/**
 * Turns a raw SMTP or network failure into something the secretary can act on.
 * The original text is kept at the end because it is what makes the unusual
 * cases diagnosable.
 */
function describeMailError(err: unknown, fallback: string): string {
  const e = err as { message?: string; code?: string; responseCode?: number; response?: string };
  const raw = String(e?.message || e?.response || fallback).slice(0, 200);
  const code = e?.responseCode ?? 0;

  if (code === 534 || /web.?login.?required|\b5\.7\.9\b/i.test(raw)) {
    return `${WEB_LOGIN_HINT} (${raw})`;
  }
  if (code === 535 || e?.code === "EAUTH" ||
      /username and password not accepted|invalid credentials|authentication fail/i.test(raw)) {
    return `${SIGN_IN_HINT} (${raw})`;
  }
  if (code === 421 || code === 454 || /too many|rate.?limit|quota|try again later/i.test(raw)) {
    return `Gmail is holding mail back from this account — its daily allowance is used up, or too ` +
      `many messages went out at once. Wait and send again tomorrow. (${raw})`;
  }
  if (["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ESOCKET", "EPIPE", "EHOSTUNREACH"].includes(e?.code ?? "") ||
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
 * A serverless function is kept warm and reused, and Gmail drops a connection
 * that sits idle between requests — so a transport held at module level hands
 * the next send a socket that is already dead. One transport per burst, closed
 * when the burst ends, keeps every message on a connection this request opened.
 */
function makeGmailTransport(): Transporter {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER!, pass: GMAIL_PASSWORD! },
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

/**
 * Signs in to the mail account and reports what happened, without sending
 * anything. This is how the secretary finds out whether the credentials reached
 * production and whether Gmail accepts them.
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
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) {
      return { ok: false, error: `Resend rejected the API key (responded ${res.status}).` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeMailError(err, "Network error contacting Resend.") };
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

async function sendViaResend(to: string[], subject: string, text: string): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: emailFrom(), to, subject, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend responded ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describeMailError(err, "Network error contacting Resend.") };
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
