import "server-only";

/**
 * Outbound email goes through Resend's HTTP API. Nothing here holds a key:
 * the API key and the verified sender come from the environment, so the same
 * code is inert on a laptop with no credentials and live in production.
 */

/**
 * The sender address. Until a domain is verified in Resend this defaults to
 * the Resend test sender, which only delivers to the account's own inbox —
 * set REMINDER_EMAIL_FROM to a real verified address before relying on it.
 */
export const EMAIL_FROM =
  process.env.REMINDER_EMAIL_FROM || "Maitama Congregation <onboarding@resend.dev>";

/** True once a Resend API key is present, i.e. the app is able to send at all. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export type SendResult = { ok: boolean; error?: string };

/** Send one plain-text email to one or more recipients. Never throws. */
export async function sendEmail(
  to: string[],
  subject: string,
  text: string,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not set." };

  const recipients = to.map((r) => r.trim()).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "No recipient address." };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: recipients, subject, text }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend responded ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting Resend.",
    };
  }
}
