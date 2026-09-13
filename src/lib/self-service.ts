import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Every publisher's personal link token, creating the missing ones in a single
 * transaction. Tokens are 192 bits of randomness in URL-safe form, so a link
 * cannot be guessed; it is the only thing standing between a publisher's
 * record and anyone who has the URL. One read and one write for the whole
 * congregation — a per-publisher loop would cost two database round trips
 * each, far too slow inside one serverless request.
 */
export async function ensureSelfTokens(ids: string[]): Promise<Map<string, string>> {
  const tokens = new Map<string, string>();
  if (ids.length === 0) return tokens;

  const rows = await prisma.publisher.findMany({
    where: { id: { in: ids } },
    select: { id: true, selfToken: true },
  });
  const missing: { id: string; token: string }[] = [];
  for (const r of rows) {
    if (r.selfToken) tokens.set(r.id, r.selfToken);
    else missing.push({ id: r.id, token: randomBytes(24).toString("base64url") });
  }
  if (missing.length) {
    await prisma.$transaction(
      missing.map((m) => prisma.publisher.update({ where: { id: m.id }, data: { selfToken: m.token } })),
    );
    for (const m of missing) tokens.set(m.id, m.token);
  }
  return tokens;
}

/** Absolute origin of the current request, to build shareable /my links. */
export async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
