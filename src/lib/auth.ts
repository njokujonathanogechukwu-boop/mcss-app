import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSession, type SessionPayload } from "@/lib/session";
import { can, type Permission } from "@/lib/rbac";

export async function getCurrentUser(): Promise<SessionPayload | null> {
  return readSession();
}

/** Use in every page and server action that touches congregation data. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}

export async function requirePermission(permission: Permission): Promise<SessionPayload> {
  const session = await requireUser();
  if (!can(session.role, permission)) redirect("/dashboard?denied=1");
  return session;
}

/** For server actions: returns an error object instead of redirecting. */
export async function guard(permission: Permission) {
  const session = await readSession();
  if (!session) return { ok: false as const, error: "Your session has ended. Sign in again." };
  if (!can(session.role, permission)) {
    return { ok: false as const, error: "Your account cannot perform this action." };
  }
  return { ok: true as const, session };
}

export async function recordAudit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
) {
  try {
    await prisma.auditLog.create({
      data: { actorId, action, entity, entityId, summary },
    });
  } catch {
    // An audit write must never break the operation it is recording.
  }
}
