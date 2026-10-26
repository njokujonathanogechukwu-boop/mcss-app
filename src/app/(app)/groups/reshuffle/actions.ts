"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";

export type ReshuffleState = { error?: string; ok?: string };

type Payload = {
  /** Publisher id → the group they now belong to, or "" for none. */
  moves: Record<string, string>;
  /** Group id → its overseer and assistant, as publisher ids or "" for none. */
  leaders: Record<string, { overseerId: string; assistantId: string }>;
  effectiveDate: string;
  reason: string;
};

/**
 * Saves a reshuffle of the service groups in one go: every publisher moved is
 * recorded as a transfer, with the same effective date and reason, so each
 * one's group history stays whole; and the groups' overseers and assistants
 * are set alongside. Nothing is written unless all of it can be.
 */
export async function saveReshuffle(_prev: ReshuffleState, formData: FormData): Promise<ReshuffleState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };
  const groupsAuth = await guard("group:write");
  if (!groupsAuth.ok) return { error: groupsAuth.error };

  let payload: Payload;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "")) as Payload;
  } catch {
    return { error: "The changes could not be read. Reload the page and try again." };
  }
  if (Number.isNaN(Date.parse(payload.effectiveDate))) return { error: "Enter the date the new groups take effect." };
  const reason = (payload.reason ?? "").trim().slice(0, 200) || "Group reshuffle";

  const [groups, publishers] = await Promise.all([
    prisma.serviceGroup.findMany({ select: { id: true, number: true, overseerId: true, assistantId: true } }),
    prisma.publisher.findMany({
      where: { id: { in: Object.keys(payload.moves ?? {}) } },
      select: { id: true, groupId: true },
    }),
  ]);
  const groupIds = new Set(groups.map((g) => g.id));
  const current = new Map(publishers.map((p) => [p.id, p.groupId]));

  const moves = Object.entries(payload.moves ?? {})
    .map(([publisherId, to]) => ({ publisherId, to: to || null }))
    .filter((m) => current.has(m.publisherId) && (m.to === null || groupIds.has(m.to)))
    .filter((m) => current.get(m.publisherId) !== m.to);

  const leaderIds = Object.values(payload.leaders ?? {}).flatMap((l) => [l.overseerId, l.assistantId]).filter(Boolean);
  const known = new Set(
    (await prisma.publisher.findMany({ where: { id: { in: leaderIds } }, select: { id: true } })).map((p) => p.id),
  );
  const leaderChanges = groups
    .map((g) => {
      const l = payload.leaders?.[g.id];
      if (!l) return null;
      const overseerId = l.overseerId && known.has(l.overseerId) ? l.overseerId : null;
      const assistantId = l.assistantId && known.has(l.assistantId) ? l.assistantId : null;
      if (overseerId === g.overseerId && assistantId === g.assistantId) return null;
      return { id: g.id, number: g.number, overseerId, assistantId };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (moves.length === 0 && leaderChanges.length === 0) return { error: "Nothing has been changed yet." };

  const effectiveDate = new Date(payload.effectiveDate);
  await prisma.$transaction([
    ...moves.map((m) =>
      prisma.transferLog.create({
        data: {
          publisherId: m.publisherId,
          fromGroupId: current.get(m.publisherId) ?? null,
          toGroupId: m.to,
          effectiveDate,
          reason,
          recordedById: auth.session.userId,
        },
      }),
    ),
    ...moves.map((m) =>
      prisma.publisher.update({
        where: { id: m.publisherId },
        data: { group: m.to ? { connect: { id: m.to } } : { disconnect: true } },
      }),
    ),
    ...leaderChanges.map((c) =>
      prisma.serviceGroup.update({
        where: { id: c.id },
        data: { overseerId: c.overseerId, assistantId: c.assistantId },
      }),
    ),
  ]);

  await recordAudit(
    auth.session.userId, "transferred", "ServiceGroup", null,
    `Reshuffled the service groups (${reason}): ${moves.length} publisher${moves.length === 1 ? "" : "s"} moved` +
      (leaderChanges.length ? `, overseers changed in ${leaderChanges.map((c) => `Group ${c.number}`).join(", ")}` : ""),
  );

  revalidatePath("/groups");
  revalidatePath("/groups/reshuffle");
  revalidatePath("/publishers");
  revalidatePath("/reports");
  return {
    ok: [
      moves.length ? `${moves.length} publisher${moves.length === 1 ? "" : "s"} moved` : null,
      leaderChanges.length ? `${leaderChanges.length} group${leaderChanges.length === 1 ? "'s" : "s'"} overseers updated` : null,
    ].filter(Boolean).join(" and ") + ".",
  };
}
