import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, self-contained links that let someone choose a password for an
 * account: "invite" is the signup mail the secretary sends, "reset" is the
 * forgot-password mail. Nothing is stored in the database, so a link carries
 * its own proof — an HMAC over the payload with SESSION_SECRET — plus a
 * fingerprint of the password hash as it was when the mail went out. Once the
 * password changes the fingerprint no longer matches and every older link for
 * that account dies, which is what makes each link single-use.
 */
export type TokenPurpose = "invite" | "reset";

const TTL_MS: Record<TokenPurpose, number> = {
  invite: 7 * 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

export const TOKEN_DAYS: Record<TokenPurpose, string> = {
  invite: "seven days",
  reset: "one hour",
};

function key(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set a value of at least 32 characters.",
    );
  }
  return value;
}

function fingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

export function signAccountToken(
  userId: string,
  passwordHash: string,
  purpose: TokenPurpose,
): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid: userId,
      p: purpose,
      exp: Date.now() + TTL_MS[purpose],
      g: fingerprint(passwordHash),
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", key()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

type Payload = { uid: string; p: TokenPurpose; exp: number; g: string };

function decode(token: string): Payload | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", key()).update(payload).digest("base64url"));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof data?.uid !== "string" ||
      typeof data?.exp !== "number" ||
      typeof data?.g !== "string" ||
      (data.p !== "invite" && data.p !== "reset")
    ) {
      return null;
    }
    return data as Payload;
  } catch {
    return null;
  }
}

/** The account a link points at, without checking expiry or use. For lookups. */
export function accountTokenUserId(token: string): string | null {
  return decode(token)?.uid ?? null;
}

/** Full check: signature, expiry, and that the password has not changed since. */
export function verifyAccountToken(
  token: string,
  passwordHash: string,
): { userId: string; purpose: TokenPurpose } | null {
  const data = decode(token);
  if (!data) return null;
  if (data.exp < Date.now()) return null;
  if (data.g !== fingerprint(passwordHash)) return null;
  return { userId: data.uid, purpose: data.p };
}
