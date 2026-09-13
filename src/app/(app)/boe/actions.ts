"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { decisionSchema, fieldErrors } from "@/lib/validation";

export type DecisionState = { error?: string; errors?: Record<string, string>; ok?: string };

/**
 * Saves every decision reached at one meeting. Rows arrive numbered
 * (agendaItem.0, decision.0, assignedToId.0, targetDate.0, notes.0 …);
 * a row with neither an agenda item nor a decision is skipped. The batch
 * is written in one transaction.
 */
export async function saveMeeting(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const auth = await guard("boe:write");
  if (!auth.ok) return { error: auth.error };

  const meetingDate = String(formData.get("meetingDate") ?? "");
  if (Number.isNaN(Date.parse(meetingDate))) return { errors: { meetingDate: "Enter a valid date" } };

  const indexes = [...new Set([...formData.keys()].map((k) => k.match(/^agendaItem\.(\d+)$/)?.[1]).filter((i): i is string => !!i))];
  const errors: Record<string, string> = {};
  const items: { agendaItem: string; decision: string; assignedToId: string | null; targetDate: Date | null; notes: string | null }[] = [];

  for (const i of indexes) {
    const get = (f: string) => String(formData.get(`${f}.${i}`) ?? "").trim();
    if (!get("agendaItem") && !get("decision")) continue;
    const parsed = decisionSchema.safeParse({
      meetingDate,
      agendaItem: get("agendaItem"),
      decision: get("decision"),
      assignedToId: get("assignedToId"),
      targetDate: get("targetDate"),
      status: "OPEN",
      notes: get("notes"),
    });
    if (!parsed.success) {
      for (const [field, message] of Object.entries(fieldErrors(parsed.error))) errors[`${field}.${i}`] = message;
      continue;
    }
    const { agendaItem, decision, assignedToId, targetDate, notes } = parsed.data;
    items.push({ agendaItem, decision, assignedToId, targetDate, notes });
  }

  if (Object.keys(errors).length) return { errors };
  if (items.length === 0) return { error: "Fill in at least one decision." };

  const date = new Date(`${meetingDate}T00:00:00.000Z`);
  await prisma.$transaction(
    items.map((item) => prisma.boeDecision.create({ data: { ...item, meetingDate: date, status: "OPEN" } })),
  );

  await recordAudit(
    auth.session.userId, "created", "BoeDecision", null,
    `Logged ${items.length} decision${items.length === 1 ? "" : "s"} from the meeting of ${meetingDate}`,
  );

  revalidatePath("/boe");
  revalidatePath("/dashboard");
  return { ok: `${items.length} decision${items.length === 1 ? "" : "s"} recorded.` };
}

export async function setDecisionStatus(formData: FormData) {
  const auth = await guard("boe:write");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["OPEN", "IN_PROGRESS", "COMPLETED", "DEFERRED"].includes(status)) return;

  await prisma.boeDecision.update({
    where: { id },
    data: {
      status: status as "OPEN" | "IN_PROGRESS" | "COMPLETED" | "DEFERRED",
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });

  await recordAudit(auth.session.userId, "updated", "BoeDecision", id, `Marked ${status.toLowerCase()}`);
  revalidatePath("/boe");
  revalidatePath("/dashboard");
}
