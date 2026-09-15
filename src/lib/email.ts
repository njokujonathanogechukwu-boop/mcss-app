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

const GMAIL_USER = process.env.MAIL_USER?.trim();
const GMAIL_PASSWORD = process.env.MAIL_APP_PASSWORD?.trim();
const FROM_NAME = process.env.MAIL_FROM_NAME?.trim() || "Maitama Congregation";

export type MailProvider = "gmail" | "resend" | null;

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
 * The address mail appears to come from. Gmail only lets an account send as
 * itself, so the display name is the only part that can be chosen.
 */
export function emailFrom(): string {
  if (mailProvider() === "gmail") return `"${FROM_NAME}" <${GMAIL_USER}>`;
  return process.env.REMINDER_EMAIL_FROM || "Maitama Congregation <onboarding@resend.dev>";
}

export type SendResult = { ok: boolean; error?: string };

export type MailKind = "REMINDER" | "UPDATE_LINK" | "ANNOUNCEMENT" | "ACCOUNT" | "GENERAL";

// One pooled connection shared by a burst of sends: a fresh TLS handshake per
// message would not get 100+ publishers out inside a function's time budget.
let transport: Transporter | null = null;

function gmailTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_PASSWORD },
      pool: true,
      maxConnections: 3,
      maxMessages: 200,
    });
  }
  return transport;
}

async function sendViaGmail(to: string[], subject: string, text: string): Promise<SendResult> {
  try {
    await gmailTransport().sendMail({ from: emailFrom(), to, subject, text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: describe(err, "Gmail refused the message.") };
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
    return { ok: false, error: describe(err, "Network error contacting Resend.") };
  }
}

function describe(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message.slice(0, 300) : fallback;
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
  if (!provider) return { ok: false, error: "No mail account is configured." };

  const recipients = to.map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "No recipient address." };

  const result = provider === "gmail"
    ? await sendViaGmail(recipients, subject, text)
    : await sendViaResend(recipients, subject, text);

  // The copy is a convenience, so a logging failure must not fail the send.
  try {
    await prisma.outboundMail.create({
      data: {
        to: recipients.join(", "),
        subject,
        body: loggedText ?? text,
        kind,
        provider,
        ok: result.ok,
        error: result.error ?? null,
        sentById: await currentSenderId(),
      },
    });
  } catch {
    // ignored
  }

  return result;
}
