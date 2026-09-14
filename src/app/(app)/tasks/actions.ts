"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { taskSchema, announcementSchema, fieldErrors } from "@/lib/validation";
import { composeAnnouncement, type ComposeInput, type ComposeResult } from "@/lib/ai";

export type FormState = { error?: string; errors?: Record<string, string>; ok?: string };

const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

// --------------------------------------------------------------------- tasks

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  const auth = await guard("task:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    detail: formData.get("detail") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    assigneeId: formData.get("assigneeId") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { title, detail, dueDate, assigneeId } = parsed.data;
  await prisma.task.create({
    data: { title, detail, dueDate, assigneeId, createdById: auth.session.userId },
  });

  await recordAudit(auth.session.userId, "created", "Task", null, `Added task "${title}"`);
  revalidatePath("/tasks");
  return { ok: "Task added." };
}

export async function setTaskStatus(formData: FormData) {
  const auth = await guard("task:write");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!id || !TASK_STATUSES.includes(status as TaskStatus)) return;

  await prisma.task.update({
    where: { id },
    data: {
      status: status as TaskStatus,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });

  await recordAudit(auth.session.userId, "updated", "Task", id, `Marked task ${status.toLowerCase()}`);
  revalidatePath("/tasks");
}

export async function deleteTask(formData: FormData) {
  const auth = await guard("task:write");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  if (!id) return;
  await prisma.task.delete({ where: { id } });

  await recordAudit(auth.session.userId, "deleted", "Task", id, "Removed a task");
  revalidatePath("/tasks");
}

// ------------------------------------------------------------- announcements

/** Drafts announcement text with the AI gateway. Only the typed details are sent. */
export async function composeDraft(input: ComposeInput): Promise<ComposeResult> {
  const auth = await guard("announcement:write");
  if (!auth.ok) return { ok: false, error: auth.error };
  return composeAnnouncement(input);
}

export async function saveAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const intent = String(formData.get("intent") ?? "DRAFT");
  // Finalising an announcement is the self-approval step.
  const auth = await guard(intent === "APPROVED" ? "announcement:approve" : "announcement:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    eventDate: formData.get("eventDate") ?? "",
    status: intent === "APPROVED" ? "APPROVED" : "DRAFT",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { title, body, eventDate, status } = parsed.data;
  const aiDrafted = formData.get("aiDrafted") === "true";
  const id = String(formData.get("id") ?? "");

  if (id) {
    await prisma.announcement.update({
      where: { id },
      data: {
        title,
        body,
        eventDate,
        status,
        aiDrafted,
        approvedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    await recordAudit(auth.session.userId, "updated", "Announcement", id, `Edited "${title}"`);
  } else {
    const created = await prisma.announcement.create({
      data: {
        title,
        body,
        eventDate,
        status,
        aiDrafted,
        approvedAt: status === "APPROVED" ? new Date() : null,
        createdById: auth.session.userId,
      },
    });
    await recordAudit(
      auth.session.userId, "created", "Announcement", created.id,
      `${status === "APPROVED" ? "Approved" : "Drafted"} "${title}"`,
    );
  }

  revalidatePath("/tasks");
  redirect("/tasks");
}

export async function markAnnounced(formData: FormData) {
  const auth = await guard("announcement:approve");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  if (!id) return;
  await prisma.announcement.update({
    where: { id },
    data: { status: "ANNOUNCED", announcedAt: new Date() },
  });

  await recordAudit(auth.session.userId, "updated", "Announcement", id, "Marked an announcement as announced");
  revalidatePath("/tasks");
}

export async function deleteAnnouncement(formData: FormData) {
  const auth = await guard("announcement:write");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  if (!id) return;
  await prisma.announcement.delete({ where: { id } });

  await recordAudit(auth.session.userId, "deleted", "Announcement", id, "Removed an announcement");
  revalidatePath("/tasks");
}
