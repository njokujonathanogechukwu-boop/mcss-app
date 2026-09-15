"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { userSchema, passwordSchema, fieldErrors } from "@/lib/validation";
import { sendEmail } from "@/lib/email";
import { requestOrigin } from "@/lib/self-service";
import { ROLE_LABELS } from "@/lib/rbac";
import { inspectTemplate, type TemplateSummary } from "@/lib/pdf/fill";
import type { FormKind } from "@prisma/client";

export type UserState = { error?: string; errors?: Record<string, string>; ok?: string };

export async function createUser(_prev: UserState, formData: FormData): Promise<UserState> {
  const auth = await guard("user:manage");
  if (!auth.ok) return { error: auth.error };

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    active: formData.get("active") === "true",
    publisherId: formData.get("publisherId") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { errors: { password: password.error.issues[0].message } };

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return { errors: { email: "An account already uses this email." } };
  }

  const user = await prisma.user.create({
    data: {
      ...parsed.data,
      email,
      passwordHash: await bcrypt.hash(password.data, 12),
    },
  });

  await recordAudit(auth.session.userId, "created", "User", user.id, `Created an account for ${user.name}`);
  revalidatePath("/settings");

  let mailNote = "";
  if (formData.get("welcomeEmail") === "true") {
    const origin = await requestOrigin();
    const role = ROLE_LABELS[user.role];
    const firstPassword = formData.get("welcomePassword") === "true" ? password.data : null;
    const result = await sendEmail(
      [email],
      "Your Maitama Congregation account",
      welcomeBody(user.name, origin, email, role, firstPassword),
      "ACCOUNT",
      // The stored copy drops the password: the mail log goes into the backup.
      firstPassword ? welcomeBody(user.name, origin, email, role, null) : undefined,
    );
    mailNote = result.ok
      ? ` A welcome email went to ${email}.`
      : ` The welcome email did not go out: ${result.error}`;
  }

  return {
    ok: `Account created for ${user.name}. Ask them to change the password when they first sign in.${mailNote}`,
  };
}

/** What a new account holder is told when the platform emails them. */
function welcomeBody(
  name: string,
  origin: string | null,
  email: string,
  role: string,
  firstPassword: string | null,
): string {
  return [
    `Dear ${name},`,
    "",
    `An account has been opened for you on the Maitama Congregation Secretary System as ${role}.`,
    "",
    `Sign in at: ${origin ? `${origin}/login` : "the system's sign-in page"}`,
    `Email: ${email}`,
    ...(firstPassword
      ? [`First password: ${firstPassword}`, "", "Change it as soon as you sign in, under Accounts → Change my password."]
      : ["", "The secretary will give you your password separately. Change it once you sign in, under Accounts → Change my password."]),
    "",
    "If you were not expecting this, please tell the congregation secretary.",
    "",
    "Maitama Congregation Secretary",
  ].join("\n");
}

export async function setUserRole(formData: FormData) {
  const auth = await guard("user:manage");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"].includes(role)) return;

  // Never leave the system without an administrator.
  if (id === auth.session.userId && !["SECRETARY", "COORDINATOR"].includes(role)) return;

  await prisma.user.update({
    where: { id },
    data: { role: role as "SECRETARY" | "COORDINATOR" | "ELDER" | "SERVANT" | "VIEWER" },
  });
  await recordAudit(auth.session.userId, "updated", "User", id, `Role set to ${role}`);
  revalidatePath("/settings");
}

export async function renameUser(formData: FormData) {
  const auth = await guard("user:manage");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  const name = userSchema.shape.name.safeParse(formData.get("name"));
  if (!name.success) return;

  await prisma.user.update({ where: { id }, data: { name: name.data } });
  await recordAudit(auth.session.userId, "updated", "User", id, `Renamed an account to ${name.data}`);
  revalidatePath("/settings");
}

export async function toggleUser(formData: FormData) {
  const auth = await guard("user:manage");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  if (id === auth.session.userId) return; // no locking yourself out

  const user = await prisma.user.findUnique({ where: { id }, select: { active: true, name: true } });
  if (!user) return;

  await prisma.user.update({ where: { id }, data: { active: !user.active } });
  await recordAudit(
    auth.session.userId, "updated", "User", id,
    `${user.active ? "Suspended" : "Restored"} ${user.name}`,
  );
  revalidatePath("/settings");
}

export async function changeOwnPassword(_prev: UserState, formData: FormData): Promise<UserState> {
  const auth = await guard("publisher:read");
  if (!auth.ok) return { error: auth.error };

  const current = String(formData.get("currentPassword") ?? "");
  const next = passwordSchema.safeParse(formData.get("newPassword"));
  if (!next.success) return { errors: { newPassword: next.error.issues[0].message } };

  const user = await prisma.user.findUnique({ where: { id: auth.session.userId } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    return { errors: { currentPassword: "That is not your current password." } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next.data, 12) },
  });
  await recordAudit(user.id, "updated", "User", user.id, "Changed their own password");
  return { ok: "Your password has been changed." };
}

// ------------------------------------------------------------- official forms


export type FormUploadState = { error?: string; ok?: string; summary?: TemplateSummary; kind?: FormKind };

const KINDS: FormKind[] = ["S21", "S1", "S88"];

export async function uploadForm(_prev: FormUploadState, formData: FormData): Promise<FormUploadState> {
  const auth = await guard("forms:manage");
  if (!auth.ok) return { error: auth.error };

  const kindRaw = String(formData.get("kind") ?? "");
  if (!KINDS.includes(kindRaw as FormKind)) return { error: "Unknown form." };
  const kind = kindRaw as FormKind;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind, error: "Choose the PDF first." };
  if (!file.name.toLowerCase().endsWith(".pdf")) return { kind, error: "That is not a PDF." };
  if (file.size > 3_500_000) return { kind, error: "The file is over 3.5 MB. The official forms are much smaller; check you have the right file." };

  const data = Buffer.from(await file.arrayBuffer());
  let summary: TemplateSummary;
  try {
    summary = await inspectTemplate(data, kind);
  } catch {
    return { kind, error: "Could not read that PDF." };
  }
  if (summary.fieldCount === 0) {
    return { kind, error: "This PDF has no fillable fields, so it cannot be filled in. Use the fillable version from jw.org, not a scan or printout." };
  }

  await prisma.formTemplate.upsert({
    where: { kind },
    create: { kind, fileName: file.name, data, fieldCount: summary.fieldCount, uploadedById: auth.session.userId },
    update: { fileName: file.name, data, fieldCount: summary.fieldCount, uploadedById: auth.session.userId, uploadedAt: new Date() },
  });
  await recordAudit(auth.session.userId, "uploaded", "FormTemplate", kind, `Uploaded the ${kind} form (${file.name})`);

  revalidatePath("/settings");
  const missed = summary.checks.filter((c) => !c.ok).length;
  return {
    kind,
    summary,
    ok: missed
      ? `Saved. ${summary.fieldCount} fields found, but ${missed} thing${missed === 1 ? "" : "s"} the app looks for could not be located; exports will fall back to the built-in layout where needed. Download the field check to see what was read.`
      : `Saved. ${summary.fieldCount} fields found and everything the app needs was located. Exports now use this form.`,
  };
}

export async function removeForm(formData: FormData) {
  const auth = await guard("forms:manage");
  if (!auth.ok) return;
  const kind = String(formData.get("kind")) as FormKind;
  if (!KINDS.includes(kind)) return;
  await prisma.formTemplate.deleteMany({ where: { kind } });
  await recordAudit(auth.session.userId, "removed", "FormTemplate", kind, `Removed the uploaded ${kind} form; exports use the built-in layout`);
  revalidatePath("/settings");
}
