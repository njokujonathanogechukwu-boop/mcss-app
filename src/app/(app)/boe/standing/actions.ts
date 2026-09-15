"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { standingSchema, liftSchema, restrictionSchema, fieldErrors } from "@/lib/validation";
import { displayName, safeFileName, STANDING_LABELS } from "@/lib/format";

export type StandingState = { error?: string; errors?: Record<string, string>; ok?: string };

/** Recording one of these also moves the publisher's place on the roll. */
const STATUS_FOR_KIND: Record<string, "ACTIVE" | "DISFELLOWSHIPPED" | "DISASSOCIATED"> = {
  DISFELLOWSHIPPED: "DISFELLOWSHIPPED",
  DISASSOCIATED: "DISASSOCIATED",
  REINSTATED: "ACTIVE",
};

function revalidate(publisherId: string) {
  revalidatePath("/boe/standing");
  revalidatePath("/publishers");
  revalidatePath(`/publishers/${publisherId}`);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

/**
 * Records a reproof, removal, reinstatement or restriction. A removal takes the
 * publisher off the roll — every count, roster and export already filters to
 * active and irregular publishers, so they drop out of all of them — and a
 * reinstatement puts them back.
 */
export async function recordStanding(
  _prev: StandingState,
  formData: FormData,
): Promise<StandingState> {
  const auth = await guard("standing:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = standingSchema.safeParse({
    publisherId: formData.get("publisherId"),
    kind: formData.get("kind"),
    eventDate: formData.get("eventDate"),
    announcedDate: formData.get("announcedDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { publisherId, kind, eventDate, announcedDate, notes } = parsed.data;
  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { firstName: true, lastName: true },
  });
  if (!publisher) return { error: "That publisher record no longer exists." };

  const status = STATUS_FOR_KIND[kind];
  await prisma.$transaction([
    prisma.standingRecord.create({
      data: {
        publisherId,
        kind,
        eventDate,
        announcedDate,
        notes,
        recordedById: auth.session.userId,
      },
    }),
    ...(status ? [prisma.publisher.update({ where: { id: publisherId }, data: { status } })] : []),
  ]);

  await recordAudit(
    auth.session.userId, "created", "StandingRecord", publisherId,
    `${STANDING_LABELS[kind]} — ${displayName(publisher)}`,
  );

  revalidate(publisherId);
  return {
    ok: status
      ? `${STANDING_LABELS[kind]} recorded for ${displayName(publisher)}; their record status is now ${status === "ACTIVE" ? "Active" : STANDING_LABELS[status]}.`
      : `${STANDING_LABELS[kind]} recorded for ${displayName(publisher)}.`,
  };
}

/**
 * Records restrictions placed as part of an entry already on file — a reproof,
 * a removal or a reinstatement — so they are read against that decision. They
 * take the publisher from the entry and are lifted on their own later.
 */
export async function addRestriction(
  _prev: StandingState,
  formData: FormData,
): Promise<StandingState> {
  const auth = await guard("standing:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = restrictionSchema.safeParse({
    parentId: formData.get("parentId"),
    eventDate: formData.get("eventDate"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const parent = await prisma.standingRecord.findUnique({
    where: { id: parsed.data.parentId },
    select: {
      id: true,
      kind: true,
      publisherId: true,
      publisher: { select: { firstName: true, lastName: true } },
    },
  });
  if (!parent) return { error: "That entry is no longer on file." };
  if (parent.kind === "RESTRICTION") {
    return { error: "Record restrictions against the decision they came from, not against another restriction." };
  }
  if (parsed.data.eventDate > new Date()) {
    return { errors: { eventDate: "That date is in the future." } };
  }

  const record = await prisma.standingRecord.create({
    data: {
      publisherId: parent.publisherId,
      parentId: parent.id,
      kind: "RESTRICTION",
      eventDate: parsed.data.eventDate,
      notes: parsed.data.notes,
      recordedById: auth.session.userId,
    },
  });

  const under = STANDING_LABELS[parent.kind].toLowerCase();
  await recordAudit(
    auth.session.userId, "created", "StandingRecord", record.id,
    `Restrictions placed on ${displayName(parent.publisher)}, under the ${under} entry`,
  );

  revalidate(parent.publisherId);
  return { ok: `Restrictions recorded under the ${under} entry for ${displayName(parent.publisher)}.` };
}

/** Closes off a restriction on the date the elders lifted it. */
export async function liftRestriction(
  _prev: StandingState,
  formData: FormData,
): Promise<StandingState> {
  const auth = await guard("standing:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = liftSchema.safeParse({
    id: formData.get("id"),
    liftedDate: formData.get("liftedDate"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const record = await prisma.standingRecord.findUnique({
    where: { id: parsed.data.id },
    include: { publisher: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!record || record.kind !== "RESTRICTION") {
    return { error: "That restriction is no longer on file." };
  }
  if (record.liftedDate) return { error: "Those restrictions have already been lifted." };
  if (parsed.data.liftedDate < record.eventDate) {
    return { errors: { liftedDate: "The lift date cannot come before the restrictions were placed." } };
  }

  await prisma.standingRecord.update({
    where: { id: record.id },
    data: { liftedDate: parsed.data.liftedDate },
  });
  await recordAudit(
    auth.session.userId, "updated", "StandingRecord", record.id,
    `Lifted the restrictions on ${displayName(record.publisher)}`,
  );

  revalidate(record.publisherId);
  return { ok: `Restrictions on ${displayName(record.publisher)} marked as lifted.` };
}

/** Corrects the dates or notes of an entry that was recorded wrongly. */
export async function correctStanding(
  _prev: StandingState,
  formData: FormData,
): Promise<StandingState> {
  const auth = await guard("standing:write");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id"));
  const parsed = standingSchema.safeParse({
    publisherId: formData.get("publisherId"),
    kind: formData.get("kind"),
    eventDate: formData.get("eventDate"),
    announcedDate: formData.get("announcedDate") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const existing = await prisma.standingRecord.findUnique({ where: { id } });
  if (!existing) return { error: "That entry is no longer on file." };
  if (parsed.data.eventDate > new Date()) {
    return { errors: { eventDate: "That date is in the future." } };
  }

  await prisma.standingRecord.update({
    where: { id },
    data: {
      eventDate: parsed.data.eventDate,
      announcedDate: parsed.data.announcedDate,
      notes: parsed.data.notes,
    },
  });
  await recordAudit(
    auth.session.userId, "updated", "StandingRecord", id,
    `Corrected the ${STANDING_LABELS[existing.kind].toLowerCase()} entry`,
  );

  revalidate(existing.publisherId);
  return { ok: "Changes saved." };
}

/**
 * Deletes an entry made in error and puts the publisher's record status back to
 * what the remaining entries say it should be.
 */
export async function deleteStanding(formData: FormData) {
  const auth = await guard("standing:write");
  if (!auth.ok) return;

  const id = String(formData.get("id"));
  const record = await prisma.standingRecord.findUnique({ where: { id } });
  if (!record) return;

  await prisma.standingRecord.delete({ where: { id } });

  const remaining = await prisma.standingRecord.findMany({
    where: { publisherId: record.publisherId, kind: { in: ["DISFELLOWSHIPPED", "DISASSOCIATED", "REINSTATED"] } },
    orderBy: { eventDate: "desc" },
    take: 1,
  });
  const publisher = await prisma.publisher.findUnique({
    where: { id: record.publisherId },
    select: { status: true },
  });
  if (publisher) {
    const latest = remaining[0];
    const status = latest
      ? STATUS_FOR_KIND[latest.kind]
      : publisher.status === "DISFELLOWSHIPPED" || publisher.status === "DISASSOCIATED"
        ? "ACTIVE"
        : null;
    if (status && status !== publisher.status) {
      await prisma.publisher.update({ where: { id: record.publisherId }, data: { status } });
    }
  }

  await recordAudit(
    auth.session.userId, "deleted", "StandingRecord", record.publisherId,
    `Deleted a ${STANDING_LABELS[record.kind].toLowerCase()} entry`,
  );

  revalidate(record.publisherId);
}

/** Scanned letters, the completed S-77 and anything else the committee kept. */
const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "txt", "rtf", "msg", "eml"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENTS = 20;

export type DocumentState = { error?: string; errors?: Record<string, string>; ok?: string };

/**
 * Adds documents to a case file. They are kept in the database beside the entry
 * so the folder export can carry the whole case with it.
 */
export async function uploadCaseDocuments(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const auth = await guard("standing:write");
  if (!auth.ok) return { error: auth.error };

  const recordId = String(formData.get("recordId"));
  const record = await prisma.standingRecord.findUnique({
    where: { id: recordId },
    include: { publisher: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!record) return { error: "That entry is no longer on file." };

  const files = formData
    .getAll("documents")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { errors: { documents: "Choose at least one file first." } };

  const existing = await prisma.standingDocument.count({ where: { standingRecordId: recordId } });
  if (existing + files.length > MAX_DOCUMENTS) {
    return {
      errors: {
        documents: `A case file holds ${MAX_DOCUMENTS} documents at most, and this one already has ${existing}.`,
      },
    };
  }

  const rejected: string[] = [];
  const accepted: { fileName: string; mimeType: string; size: number; bytes: Uint8Array<ArrayBuffer> }[] = [];
  for (const file of files) {
    const name = safeFileName(file.name);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      rejected.push(`${name}: keep scans, photos and documents.`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push(`${name}: over 10 MB.`);
      continue;
    }
    accepted.push({
      fileName: name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      bytes: new Uint8Array((await file.arrayBuffer()) as ArrayBuffer),
    });
  }

  if (accepted.length === 0) return { errors: { documents: rejected.join(" ") } };

  await prisma.standingDocument.createMany({
    data: accepted.map((d) => ({
      standingRecordId: recordId,
      fileName: d.fileName,
      mimeType: d.mimeType,
      size: d.size,
      bytes: d.bytes,
      uploadedById: auth.session.userId,
    })),
  });

  await recordAudit(
    auth.session.userId, "created", "StandingRecord", recordId,
    `Added ${accepted.length} document${accepted.length === 1 ? "" : "s"} to the case file of ${displayName(record.publisher)}`,
  );

  revalidate(record.publisherId);
  const message = `${accepted.length} document${accepted.length === 1 ? "" : "s"} added to the ${STANDING_LABELS[record.kind].toLowerCase()} case file.`;
  return rejected.length > 0
    ? { ok: `${message} Not added: ${rejected.join(" ")}` }
    : { ok: message };
}

/** Takes a document off a case file. The entry itself is untouched. */
export async function deleteCaseDocument(_prev: DocumentState, formData: FormData): Promise<DocumentState> {
  const auth = await guard("standing:write");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("documentId"));
  const doc = await prisma.standingDocument.findUnique({
    where: { id },
    include: {
      standingRecord: { select: { publisherId: true, publisher: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!doc) return { error: "That document is no longer on file." };

  await prisma.standingDocument.delete({ where: { id } });
  await recordAudit(
    auth.session.userId, "deleted", "StandingRecord", doc.standingRecordId,
    `Removed ${doc.fileName} from the case file of ${displayName(doc.standingRecord.publisher)}`,
  );

  revalidate(doc.standingRecord.publisherId);
  return { ok: `${doc.fileName} taken off the case file.` };
}
