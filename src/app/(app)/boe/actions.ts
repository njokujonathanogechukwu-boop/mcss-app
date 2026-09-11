"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { decisionSchema, fieldErrors } from "@/lib/validation";

export type DecisionState = { error?: string; errors?: Record<string, string>; ok?: string };

export async function saveDecision(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const auth = await guard("boe:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = decisionSchema.safeParse({
    meetingDate: formData.get("meetingDate"),
    agendaItem: formData.get("agendaItem"),
    decision: formData.get("decision"),
    assignedToId: formData.get("assignedToId") ?? "",
    targetDate: formData.get("targetDate") ?? "",
    status: formData.get("status") ?? "OPEN",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const created = await prisma.boeDecision.create({
    data: {
      ...parsed.data,
      meetingDate: new Date(`${parsed.data.meetingDate}T00:00:00.000Z`),
      completedAt: parsed.data.status === "COMPLETED" ? new Date() : null,
    },
  });

  await recordAudit(
    auth.session.userId, "created", "BoeDecision", created.id,
    `Logged "${created.agendaItem}"`,
  );

  revalidatePath("/boe");
  revalidatePath("/dashboard");
  return { ok: "Item recorded." };
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
