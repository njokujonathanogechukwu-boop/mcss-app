import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/session";

/**
 * Checks an email and password against an active account. Shared by the two
 * sign-in pages — the main one and the school overseer's — so that both time a
 * wrong email exactly as a wrong password. The result is already in the shape
 * `createSession` wants.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Compare against a dummy hash when the account is missing so that a wrong
  // email and a wrong password take the same amount of time.
  const hash = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid || !user.active) return null;
  return { userId: user.id, email: user.email, name: user.name, role: user.role };
}
