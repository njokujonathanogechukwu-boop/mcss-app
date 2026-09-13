import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Returns the publisher's personal link token, creating one the first time it
 * is asked for. Tokens are 192 bits of randomness in URL-safe form, so a link
 * cannot be guessed; it is the only thing standing between a publisher's
 * record and anyone who has the URL.
 */
export async function ensureSelfToken(publisherId: string): Promise<string | null> {
  const existing = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { selfToken: true },
  });
  if (!existing) return null;
  if (existing.selfToken) return existing.selfToken;

  const token = randomBytes(24).toString("base64url");
  await prisma.publisher.update({ where: { id: publisherId }, data: { selfToken: token } });
  return token;
}

/** Absolute origin of the current request, to build shareable /my links. */
export async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
