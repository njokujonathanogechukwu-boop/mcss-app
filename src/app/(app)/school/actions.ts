"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { MidweekHall, MidweekSlot, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { displayName, formatDate, safeFileName } from "@/lib/format";
import { PART_KINDS, WEEK_SKELETON, hallsFor, meetingDateIn, meetingDates, parsePersonRef, periodLabel, slotField } from "@/lib/school";
import { WorkbookError, readWorkbook, toPreview, type WorkbookPreview } from "@/lib/workbook";
import {
  addWeekSchema, fieldErrors, partSchema, periodSchema, periodSettingsSchema,
  schoolStudentSchema, weekHeaderSchema, workbookSettingsSchema,
} from "@/lib/validation";

export type SchoolState = { error?: string; errors?: Record<string, string>; ok?: string };

/**
 * The school's pages all read the same handful of rows, and a change to one
 * week shows on the overview too, so one revalidation of the whole area is
 * both simpler and safer than naming each page.
 */
function revalidateSchool() {
  revalidatePath("/school", "layout");
}

/** The parts a new week starts with, in the order the S-140 prints them. */
function skeletonParts(): Prisma.MidweekPartCreateWithoutWeekInput[] {
  return WEEK_SKELETON.map((part, index) => ({
    position: index + 1,
    section: part.section,
    title: part.title,
    minutes: part.minutes,
    slots: [...PART_KINDS[part.kind].slots],
    dualHall: part.dualHall ?? false,
  }));
}

// ------------------------------------------------------------------- periods

export async function createPeriod(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = periodSchema.safeParse({
    startYear: formData.get("startYear"),
    startMonth: formData.get("startMonth"),
    meetingWeekday: formData.get("meetingWeekday"),
    startHour: formData.get("startHour"),
    startMinute: formData.get("startMinute"),
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { startYear, startMonth, meetingWeekday, startHour, startMinute, label } = parsed.data;

  const clash = await prisma.midweekPeriod.findUnique({
    where: { startYear_startMonth: { startYear, startMonth } },
    select: { id: true },
  });
  if (clash) {
    return { errors: { startMonth: `A schedule for ${periodLabel(startYear, startMonth)} is already on file.` } };
  }

  const dates = meetingDates(startYear, startMonth, meetingWeekday);
  const name = label || periodLabel(startYear, startMonth);

  const period = await prisma.midweekPeriod.create({
    data: {
      label: name,
      startYear,
      startMonth,
      meetingWeekday,
      startHour,
      startMinute,
      createdById: auth.session.userId,
      weeks: { create: dates.map((weekOf) => ({ weekOf, parts: { create: skeletonParts() } })) },
    },
    select: { id: true },
  });

  await recordAudit(
    auth.session.userId, "created", "MidweekPeriod", period.id,
    `Started the ${name} midweek schedule with ${dates.length} weeks`,
  );

  revalidateSchool();
  return { ok: `${name} is ready: ${dates.length} weeks, each with the usual parts to fill in.` };
}

export async function savePeriod(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = periodSettingsSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    meetingWeekday: formData.get("meetingWeekday"),
    startHour: formData.get("startHour"),
    startMinute: formData.get("startMinute"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { id, ...settings } = parsed.data;
  const period = await prisma.midweekPeriod.findUnique({ where: { id }, select: { id: true } });
  if (!period) return { error: "That schedule is no longer on file." };

  await prisma.midweekPeriod.update({ where: { id }, data: settings });
  await recordAudit(
    auth.session.userId, "updated", "MidweekPeriod", id,
    `Changed the settings of the ${parsed.data.label} midweek schedule`,
  );

  revalidateSchool();
  return { ok: "Saved." };
}

/**
 * Takes a whole schedule off the file, weeks, parts and assignments with it.
 * The button asks first: this is the one action here that cannot be undone.
 */
export async function deletePeriod(formData: FormData) {
  const auth = await guard("school:write");
  if (!auth.ok) redirect("/school");

  const id = String(formData.get("id"));
  const period = await prisma.midweekPeriod.findUnique({
    where: { id },
    select: { label: true, _count: { select: { weeks: true } } },
  });
  if (!period) redirect("/school");

  await prisma.midweekPeriod.delete({ where: { id } });
  await recordAudit(
    auth.session.userId, "deleted", "MidweekPeriod", id,
    `Deleted the ${period.label} midweek schedule and its ${period._count.weeks} weeks`,
  );

  revalidateSchool();
  redirect("/school");
}

// --------------------------------------------------------------------- weeks

export async function addWeek(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = addWeekSchema.safeParse({
    periodId: formData.get("periodId"),
    weekOf: formData.get("weekOf"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { periodId, weekOf } = parsed.data;
  const clash = await prisma.midweekWeek.findUnique({
    where: { periodId_weekOf: { periodId, weekOf } },
    select: { id: true },
  });
  if (clash) return { errors: { weekOf: "This schedule already has a week on that date." } };

  await prisma.midweekWeek.create({
    data: { periodId, weekOf, parts: { create: skeletonParts() } },
  });
  await recordAudit(
    auth.session.userId, "created", "MidweekWeek", periodId,
    `Added the meeting of ${formatDate(weekOf)} to the midweek schedule`,
  );

  revalidateSchool();
  return { ok: `The week of ${formatDate(weekOf)} is ready to fill in.` };
}

export async function deleteWeek(formData: FormData) {
  const auth = await guard("school:write");
  if (!auth.ok) redirect("/school");

  const id = String(formData.get("id"));
  const week = await prisma.midweekWeek.findUnique({
    where: { id },
    select: { periodId: true, weekOf: true },
  });
  if (!week) redirect("/school");

  await prisma.midweekWeek.delete({ where: { id } });
  await recordAudit(
    auth.session.userId, "deleted", "MidweekWeek", id,
    `Took the meeting of ${formatDate(week.weekOf)} off the midweek schedule`,
  );

  revalidateSchool();
  redirect(`/school/periods/${week.periodId}`);
}

function readWeekHeader(formData: FormData) {
  return weekHeaderSchema.safeParse({
    weekOf: formData.get("weekOf"),
    bibleReading: formData.get("bibleReading") ?? "",
    chairmanId: formData.get("chairmanId") ?? "",
    counselorId: formData.get("counselorId") ?? "",
    openingPrayerId: formData.get("openingPrayerId") ?? "",
    closingPrayerId: formData.get("closingPrayerId") ?? "",
    openingSong: formData.get("openingSong") ?? "",
    livingSong: formData.get("livingSong") ?? "",
    closingSong: formData.get("closingSong") ?? "",
    cancelled: formData.get("cancelled") === "true",
    cancelledReason: formData.get("cancelledReason") ?? "",
    note: formData.get("note") ?? "",
  });
}

export async function saveWeekHeader(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id"));
  const parsed = readWeekHeader(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const week = await prisma.midweekWeek.findUnique({
    where: { id },
    select: { periodId: true },
  });
  if (!week) return { error: "That week is no longer on the schedule." };

  const clash = await prisma.midweekWeek.findUnique({
    where: { periodId_weekOf: { periodId: week.periodId, weekOf: parsed.data.weekOf } },
    select: { id: true },
  });
  if (clash && clash.id !== id) {
    return { errors: { weekOf: "Another week of this schedule already falls on that date." } };
  }

  await prisma.midweekWeek.update({ where: { id }, data: parsed.data });
  await recordAudit(
    auth.session.userId, "updated", "MidweekWeek", id,
    parsed.data.cancelled
      ? `Marked the meeting of ${formatDate(parsed.data.weekOf)} as not held`
      : `Updated the heading of the meeting of ${formatDate(parsed.data.weekOf)}`,
  );

  revalidateSchool();
  return { ok: "Saved." };
}

// --------------------------------------------------------------------- parts

function readPart(formData: FormData) {
  return partSchema.safeParse({
    title: formData.get("title"),
    section: formData.get("section"),
    kind: formData.get("kind"),
    minutes: formData.get("minutes") ?? "",
    detail: formData.get("detail") ?? "",
    dualHall: formData.get("dualHall") === "true",
  });
}

/**
 * Saves one line of the schedule and everyone assigned to it. One form per part
 * rather than one for the week: the overseer fills a schedule a part at a time,
 * often days apart, and a single large form would put the whole week at risk.
 */
export async function savePart(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const partId = String(formData.get("partId"));
  const parsed = readPart(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const part = await prisma.midweekPart.findUnique({
    where: { id: partId },
    select: { position: true, week: { select: { weekOf: true } } },
  });
  if (!part) return { error: "That part is no longer on the schedule." };

  const slots = [...PART_KINDS[parsed.data.kind].slots] as MidweekSlot[];
  const assignments: {
    partId: string;
    hall: MidweekHall;
    slot: MidweekSlot;
    publisherId: string | null;
    studentId: string | null;
  }[] = [];

  for (const slot of slots) {
    for (const hall of hallsFor(parsed.data.dualHall)) {
      // One picker offers both publishers and the students of the school, so
      // the value says which of the two tables it points at.
      const person = parsePersonRef(String(formData.get(slotField(slot, hall)) ?? ""));
      if (!person) continue;
      assignments.push({
        partId,
        hall,
        slot,
        publisherId: person.kind === "publisher" ? person.id : null,
        studentId: person.kind === "student" ? person.id : null,
      });
    }
  }

  const { title, section, minutes, detail, dualHall } = parsed.data;
  await prisma.$transaction([
    prisma.midweekPart.update({
      where: { id: partId },
      data: { title, section, minutes, detail, slots, dualHall },
    }),
    prisma.midweekAssignment.deleteMany({ where: { partId } }),
    prisma.midweekAssignment.createMany({ data: assignments }),
  ]);

  await recordAudit(
    auth.session.userId, "updated", "MidweekPart", partId,
    `Set part ${part.position} (${title}) of the meeting of ${formatDate(part.week.weekOf)}` +
      ` with ${assignments.length} name${assignments.length === 1 ? "" : "s"}`,
  );

  revalidateSchool();
  return { ok: "Saved." };
}

export async function addPart(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const weekId = String(formData.get("weekId"));
  const parsed = readPart(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const week = await prisma.midweekWeek.findUnique({
    where: { id: weekId },
    select: { weekOf: true, parts: { select: { position: true } } },
  });
  if (!week) return { error: "That week is no longer on the schedule." };

  // Added below the part the button sits on, or at the end of the schedule.
  const after = Number(formData.get("afterPosition"));
  const position = Number.isInteger(after) && after > 0 ? after + 1 : week.parts.length + 1;

  const { title, section, minutes, detail, dualHall, kind } = parsed.data;
  await prisma.$transaction([
    prisma.midweekPart.updateMany({
      where: { weekId, position: { gte: position } },
      data: { position: { increment: 1 } },
    }),
    prisma.midweekPart.create({
      data: {
        weekId, position, section, title, minutes, detail, dualHall,
        slots: [...PART_KINDS[kind].slots] as MidweekSlot[],
      },
    }),
  ]);

  await recordAudit(
    auth.session.userId, "created", "MidweekPart", weekId,
    `Added “${title}” to the meeting of ${formatDate(week.weekOf)}`,
  );

  revalidateSchool();
  return { ok: `“${title}” added at number ${position}.` };
}

export async function deletePart(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("partId"));
  const part = await prisma.midweekPart.findUnique({
    where: { id },
    select: { weekId: true, position: true, title: true, week: { select: { weekOf: true } } },
  });
  if (!part) return { error: "That part is no longer on the schedule." };

  await prisma.$transaction([
    prisma.midweekPart.delete({ where: { id } }),
    prisma.midweekPart.updateMany({
      where: { weekId: part.weekId, position: { gt: part.position } },
      data: { position: { decrement: 1 } },
    }),
  ]);

  await recordAudit(
    auth.session.userId, "deleted", "MidweekPart", id,
    `Removed “${part.title}” from the meeting of ${formatDate(part.week.weekOf)} and renumbered the rest`,
  );

  revalidateSchool();
  return { ok: `“${part.title}” removed.` };
}

/**
 * Moves a part up or down the schedule. The two positions are swapped through a
 * negative one because the order is unique within a week: setting either row to
 * the other's number while it is still held would break the constraint.
 */
export async function movePart(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("partId"));
  const direction = formData.get("direction") === "up" ? "up" : "down";

  const part = await prisma.midweekPart.findUnique({
    where: { id },
    select: { weekId: true, position: true },
  });
  if (!part) return { error: "That part is no longer on the schedule." };

  const neighbour = await prisma.midweekPart.findFirst({
    where: {
      weekId: part.weekId,
      position: direction === "up" ? { lt: part.position } : { gt: part.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
    select: { id: true, position: true },
  });
  if (!neighbour) return { error: "That part is already at the end of the schedule." };

  await prisma.$transaction(async (tx) => {
    await tx.midweekPart.update({ where: { id }, data: { position: -part.position } });
    await tx.midweekPart.update({ where: { id: neighbour.id }, data: { position: part.position } });
    await tx.midweekPart.update({ where: { id }, data: { position: neighbour.position } });
  });

  revalidateSchool();
  return { ok: `Moved to number ${neighbour.position}.` };
}

// ------------------------------------------------------------------ students

function readStudent(formData: FormData) {
  return schoolStudentSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    gender: formData.get("gender"),
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    phone: formData.get("phone") ?? "",
    guardianName: formData.get("guardianName") ?? "",
    guardianPhone: formData.get("guardianPhone") ?? "",
    conductorId: formData.get("conductorId") ?? "",
    enrolledAt: formData.get("enrolledAt") ?? "",
    notes: formData.get("notes") ?? "",
    publisherId: formData.get("publisherId") ?? "",
  });
}

/**
 * Registers a student of the school, or saves changes to one already on the
 * roll. Enrollment is a matter for the overseer with the Bible study conductor
 * or a believing parent present (S-38 par. 1); the app only records the result.
 */
export async function saveStudent(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = readStudent(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const id = String(formData.get("id") ?? "");
  // The publisher link is not on this form; it is changed by linkStudentToPublisher
  // alone, and writing the empty value from here would quietly undo it.
  const { publisherId: _publisherId, ...student } = parsed.data;
  const data = { ...student, enrolledAt: student.enrolledAt ?? new Date() };
  const name = displayName(parsed.data);

  if (id) {
    const existing = await prisma.schoolStudent.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return { error: "That student is no longer on the roll." };
    await prisma.schoolStudent.update({ where: { id }, data });
    await recordAudit(auth.session.userId, "updated", "SchoolStudent", id, `Edited the school record of ${name}`);
    revalidateSchool();
    return { ok: `${name} saved.` };
  }

  const created = await prisma.schoolStudent.create({ data, select: { id: true } });
  await recordAudit(
    auth.session.userId, "created", "SchoolStudent", created.id,
    `Enrolled ${name} as a student of the Life and Ministry Meeting School`,
  );

  revalidateSchool();
  return { ok: `${name} is on the roll of the school.` };
}

/**
 * Takes a student off the roll, or puts them back. The row is kept either way:
 * the assignments they handled are part of the school's history, and deleting
 * them would blank the names off old schedules.
 */
export async function setStudentActive(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";

  const student = await prisma.schoolStudent.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  if (!student) return { error: "That student is no longer on the roll." };

  await prisma.schoolStudent.update({ where: { id }, data: { active } });
  await recordAudit(
    auth.session.userId, active ? "reinstated" : "removed", "SchoolStudent", id,
    `${active ? "Put" : "Took"} ${displayName(student)} ${active ? "back on" : "off"} the roll of the school`,
  );

  revalidateSchool();
  return { ok: `${displayName(student)} ${active ? "is back on the roll." : "is off the roll. Their past assignments stay on the old schedules."}` };
}

/** Joins a student who has become a publisher to the record the secretary keeps. */
export async function linkStudentToPublisher(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id"));
  const publisherId = String(formData.get("publisherId") ?? "");

  const student = await prisma.schoolStudent.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true } });
  if (!student) return { error: "That student is no longer on the roll." };

  const publisher = publisherId
    ? await prisma.publisher.findUnique({ where: { id: publisherId }, select: { firstName: true, lastName: true } })
    : null;
  if (publisherId && !publisher) return { errors: { publisherId: "That publisher record is no longer on file." } };

  await prisma.schoolStudent.update({ where: { id }, data: { publisherId: publisherId || null } });
  await recordAudit(
    auth.session.userId, "updated", "SchoolStudent", id,
    publisher
      ? `Joined the school record of ${displayName(student)} to the publisher record of ${displayName(publisher)}`
      : `Unlinked ${displayName(student)} from their publisher record`,
  );

  revalidateSchool();
  return { ok: publisher ? `${displayName(student)} is now linked to their publisher record.` : "Link removed." };
}

// ----------------------------------------------------------------- documents

/** Schedules printed before the app, workbook pages, and the odd letter. */
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "jpg", "jpeg", "png", "webp", "txt", "rtf"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function uploadSchoolDocuments(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { errors: { label: "Say what these files are, so they can be found later." } };

  const weekId = String(formData.get("weekId") ?? "") || null;
  let periodId = String(formData.get("periodId") ?? "") || null;

  if (weekId) {
    const week = await prisma.midweekWeek.findUnique({ where: { id: weekId }, select: { periodId: true } });
    if (!week) return { error: "That week is no longer on the schedule." };
    periodId = week.periodId;
  } else if (periodId) {
    const period = await prisma.midweekPeriod.findUnique({ where: { id: periodId }, select: { id: true } });
    if (!period) return { error: "That schedule is no longer on file." };
  }

  const files = formData.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { errors: { documents: "Choose at least one file first." } };

  const rejected: string[] = [];
  const accepted: { fileName: string; mimeType: string; size: number; bytes: Uint8Array<ArrayBuffer> }[] = [];
  for (const file of files) {
    const name = safeFileName(file.name);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      rejected.push(`${name}: keep Word files, PDFs and photos.`);
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

  await prisma.midweekDocument.createMany({
    data: accepted.map((d) => ({ ...d, label, weekId, periodId, uploadedById: auth.session.userId })),
  });

  await recordAudit(
    auth.session.userId, "created", "MidweekDocument", periodId,
    `Filed ${accepted.length} document${accepted.length === 1 ? "" : "s"} under “${label}”`,
  );

  revalidateSchool();
  const message = `${accepted.length} file${accepted.length === 1 ? "" : "s"} filed under “${label}”.`;
  return rejected.length > 0 ? { ok: `${message} Not added: ${rejected.join(" ")}` } : { ok: message };
}

export async function deleteSchoolDocument(_prev: SchoolState, formData: FormData): Promise<SchoolState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id"));
  const doc = await prisma.midweekDocument.findUnique({ where: { id }, select: { label: true, fileName: true } });
  if (!doc) return { error: "That file is no longer on the record." };

  await prisma.midweekDocument.delete({ where: { id } });
  await recordAudit(
    auth.session.userId, "deleted", "MidweekDocument", id,
    `Deleted “${doc.fileName}” filed under ${doc.label}`,
  );

  revalidateSchool();
  return { ok: `${doc.fileName} deleted.` };
}

// --------------------------------------------------------------- the workbook

export type WorkbookState = SchoolState & {
  preview?: WorkbookPreview;
  /** The clock chosen on the first pass, echoed so the confirmed pass keeps it. */
  settings?: { meetingWeekday: number; startHour: number; startMinute: number; label: string };
  periodId?: string;
};

const MAX_WORKBOOK_BYTES = 30 * 1024 * 1024;

/** The uploaded workbook, read off the form. Shared by both passes of the import. */
async function uploadedWorkbook(formData: FormData) {
  const file = formData.get("workbook");
  if (!(file instanceof File) || file.size === 0) {
    return { error: { workbook: "Choose the workbook file first." } as const };
  }
  if (!/\.epub$/i.test(file.name)) {
    return {
      error: {
        workbook:
          "Upload the EPUB of the workbook — on jw.org, pick EPUB from the download options. The PDF and the JWPUB cannot be read as text, so they can only be filed under the archive.",
      } as const,
    };
  }
  if (file.size > MAX_WORKBOOK_BYTES) {
    return { error: { workbook: "That workbook is over 30 MB." } as const };
  }

  const bytes = new Uint8Array((await file.arrayBuffer()) as ArrayBuffer);
  try {
    return { file, bytes, workbook: await readWorkbook(bytes) };
  } catch (error) {
    return {
      error: {
        workbook: error instanceof WorkbookError ? error.message : "That workbook could not be read.",
      } as const,
    };
  }
}

/**
 * Builds the schedule for one workbook. The first pass reads the file and hands
 * back what it found for the overseer to check; the second writes it. Both read
 * the same upload, so nothing is written that was not shown first.
 */
export async function importWorkbook(_prev: WorkbookState, formData: FormData): Promise<WorkbookState> {
  const auth = await guard("school:write");
  if (!auth.ok) return { error: auth.error };

  const clock = workbookSettingsSchema.safeParse({
    meetingWeekday: formData.get("meetingWeekday"),
    startHour: formData.get("startHour"),
    startMinute: formData.get("startMinute"),
    label: formData.get("label") ?? "",
  });
  if (!clock.success) return { errors: fieldErrors(clock.error) };
  const { meetingWeekday, startHour, startMinute } = clock.data;
  const wanted = (clock.data.label ?? "").trim();

  const read = await uploadedWorkbook(formData);
  if ("error" in read) return { errors: read.error };
  const { file, bytes, workbook } = read;

  if (formData.get("confirm") !== "1") {
    return {
      preview: toPreview(workbook, meetingWeekday),
      settings: { meetingWeekday, startHour, startMinute, label: wanted },
      ok: "Read the workbook. Check the weeks below, then build the schedule.",
    };
  }

  const { startYear, startMonth } = workbook;
  const name = wanted || periodLabel(startYear, startMonth);

  const existing = await prisma.midweekPeriod.findUnique({
    where: { startYear_startMonth: { startYear, startMonth } },
    select: { id: true, label: true },
  });
  if (existing) {
    const assigned = await prisma.midweekAssignment.count({
      where: { part: { week: { periodId: existing.id } } },
    });
    if (assigned > 0) {
      return {
        error: `${existing.label} is already on file with ${assigned} name${assigned === 1 ? "" : "s"} given out against it. Change that schedule week by week, or take it off the file first and upload the workbook again.`,
      };
    }
  }

  const weeks = workbook.weeks.map((week) => {
    // A week the workbook prints no parts for is a week with no meeting: an
    // assembly or a convention. It is kept on the schedule so the gap shows.
    const empty = week.parts.length === 0;
    return {
      weekOf: meetingDateIn(week.monday, meetingWeekday),
      bibleReading: week.bibleReading,
      openingSong: week.openingSong,
      livingSong: week.livingSong,
      closingSong: week.closingSong,
      cancelled: empty,
      cancelledReason: empty ? "The workbook prints no parts for this week." : null,
      note: week.label,
      parts: {
        create: week.parts.map((part) => ({
          position: part.position,
          section: part.section,
          title: part.title,
          minutes: part.minutes,
          detail: part.detail,
          slots: [...PART_KINDS[part.kind].slots],
          dualHall: part.dualHall,
        })),
      },
    };
  });

  const shared = {
    label: name,
    meetingWeekday,
    startHour,
    startMinute,
    weeks: { create: weeks },
    documents: {
      create: {
        label: `${name} workbook`,
        fileName: safeFileName(file.name),
        mimeType: file.type || "application/epub+zip",
        size: file.size,
        bytes,
        uploadedById: auth.session.userId,
      },
    },
  };

  const totalParts = workbook.weeks.reduce((count, week) => count + week.parts.length, 0);
  let periodId: string;
  if (existing) {
    await prisma.$transaction([
      prisma.midweekWeek.deleteMany({ where: { periodId: existing.id } }),
      prisma.midweekPeriod.update({ where: { id: existing.id }, data: shared }),
    ]);
    periodId = existing.id;
  } else {
    const created = await prisma.midweekPeriod.create({
      data: { ...shared, startYear, startMonth, createdById: auth.session.userId },
      select: { id: true },
    });
    periodId = created.id;
  }

  await recordAudit(
    auth.session.userId, existing ? "updated" : "created", "MidweekPeriod", periodId,
    `Built the ${name} midweek schedule from the workbook: ${weeks.length} weeks, ${totalParts} parts`,
  );

  revalidateSchool();
  return {
    periodId,
    ok: `${name} is ready: ${weeks.length} weeks and ${totalParts} parts, with the songs and the Bible readings filled in. Now put a name against each part.`,
  };
}
