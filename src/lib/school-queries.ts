import "server-only";
import type { MidweekSlot, Prisma, PublisherStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import {
  SLOT_LABELS, personRef, slotField, weekBanner,
  type SchoolPools, type SchedulePart, type ScheduleWeek,
} from "@/lib/school";
import type { RollEntry } from "@/lib/rotation";
import type { NameOption } from "@/components/name-picker";

/**
 * Reads for the Life and Ministry Meeting School. Kept together because the
 * editor, the printer and the assignment history all need the same week read
 * the same way, and a person may come from either of two tables.
 */

const ROLL: PublisherStatus[] = ["ACTIVE", "IRREGULAR"];

export const weekInclude = {
  period: true,
  chairman: { select: { firstName: true, lastName: true } },
  openingPrayer: { select: { firstName: true, lastName: true } },
  closingPrayer: { select: { firstName: true, lastName: true } },
  parts: {
    orderBy: { position: "asc" as const },
    include: {
      assignments: {
        include: {
          publisher: { select: { firstName: true, lastName: true } },
          student: { select: { firstName: true, lastName: true } },
        },
      },
    },
  },
} satisfies Prisma.MidweekWeekInclude;

export type WeekRow = Prisma.MidweekWeekGetPayload<{ include: typeof weekInclude }>;
export type PartRow = WeekRow["parts"][number];
export type AssignmentRow = PartRow["assignments"][number];

export async function loadWeek(id: string): Promise<WeekRow | null> {
  return prisma.midweekWeek.findUnique({ where: { id }, include: weekInclude });
}

/**
 * The day the congregation meets, taken from the newest schedule on file. The
 * history correction step offers it as the default; Tuesday when nothing is on
 * file yet, because that is the day this congregation has always met.
 */
export async function defaultMeetingWeekday(): Promise<number> {
  const latest = await prisma.midweekPeriod.findFirst({
    orderBy: [{ startYear: "desc" }, { startMonth: "desc" }],
    select: { meetingWeekday: true },
  });
  return latest?.meetingWeekday ?? 2;
}

export async function loadWeeks(periodId: string): Promise<WeekRow[]> {
  return prisma.midweekWeek.findMany({
    where: { periodId },
    orderBy: { weekOf: "asc" },
    include: weekInclude,
  });
}

/**
 * The schedules on file, each with enough of its weeks to say how far the
 * overseer has got: one read for the overview rather than a count per week.
 */
export async function loadPeriods() {
  return prisma.midweekPeriod.findMany({
    orderBy: [{ startYear: "desc" }, { startMonth: "desc" }],
    include: {
      weeks: {
        orderBy: { weekOf: "asc" },
        select: {
          id: true,
          weekOf: true,
          cancelled: true,
          cancelledReason: true,
          note: true,
          chairman: { select: { firstName: true, lastName: true } },
          parts: {
            select: { slots: true, assignments: { select: { id: true } } },
          },
        },
      },
      _count: { select: { documents: true } },
    },
  });
}

export type PeriodRow = Awaited<ReturnType<typeof loadPeriods>>[number];
export type WeekSummary = PeriodRow["weeks"][number];

/** One schedule with the same read as the list, for its own page. */
export async function loadPeriod(id: string): Promise<PeriodRow | null> {
  return prisma.midweekPeriod.findUnique({
    where: { id },
    include: {
      weeks: {
        orderBy: { weekOf: "asc" },
        select: {
          id: true,
          weekOf: true,
          cancelled: true,
          cancelledReason: true,
          note: true,
          chairman: { select: { firstName: true, lastName: true } },
          parts: {
            select: { slots: true, assignments: { select: { id: true } } },
          },
        },
      },
      _count: { select: { documents: true } },
    },
  });
}

/**
 * How many names a week still owes: every slot of every part, since each part
 * is handled once.
 */
export function weekProgress(week: { parts: { slots: MidweekSlot[]; assignments: { id: string }[] }[] }) {
  let need = 0;
  let have = 0;
  for (const part of week.parts) {
    need += part.slots.length;
    have += part.assignments.length;
  }
  return { need, have };
}

export type TallyEntry = {
  key: string;
  name: string;
  isStudent: boolean;
  total: number;
  /** The parts they handle, oldest meeting first. */
  parts: { date: Date; title: string; slot: string }[];
};

/**
 * Everyone given a part across one schedule, and what they were given. This is
 * the tracking the overseer works from: a brother who has not been used for a
 * while, a student who has had the same kind of part three weeks running.
 */
export async function periodTally(periodId: string): Promise<TallyEntry[]> {
  const rows = await prisma.midweekAssignment.findMany({
    where: { part: { week: { periodId } } },
    select: {
      slot: true,
      publisherId: true,
      studentId: true,
      publisher: { select: { firstName: true, lastName: true } },
      student: { select: { firstName: true, lastName: true } },
      part: {
        select: {
          title: true,
          position: true,
          week: { select: { weekOf: true } },
        },
      },
    },
    orderBy: { part: { week: { weekOf: "asc" } } },
  });

  const byPerson = new Map<string, TallyEntry>();
  for (const row of rows) {
    let key: string;
    let name: string;
    let isStudent: boolean;
    if (row.publisher && row.publisherId) {
      key = personRef("publisher", row.publisherId);
      name = displayName(row.publisher);
      isStudent = false;
    } else if (row.student && row.studentId) {
      key = personRef("student", row.studentId);
      name = displayName(row.student);
      isStudent = true;
    } else {
      continue;
    }

    const entry = byPerson.get(key) ?? { key, name, isStudent, total: 0, parts: [] };
    entry.total += 1;
    entry.parts.push({
      date: row.part.week.weekOf,
      title: row.part.title,
      slot: SLOT_LABELS[row.slot],
    });
    byPerson.set(key, entry);
  }

  return [...byPerson.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export type Usage = { total: number; last: Date };

/**
 * How many midweek parts each person has ever handled, and when they were last
 * given one, keyed by person reference. The overseer's publisher list uses it to
 * spot the brothers who have not been used for a while.
 */
export async function assignmentUsage(): Promise<Map<string, Usage>> {
  const rows = await prisma.midweekAssignment.findMany({
    select: {
      publisherId: true,
      studentId: true,
      part: { select: { week: { select: { weekOf: true } } } },
    },
  });

  const usage = new Map<string, Usage>();
  for (const row of rows) {
    const key = row.publisherId
      ? personRef("publisher", row.publisherId)
      : row.studentId
        ? personRef("student", row.studentId)
        : null;
    if (!key) continue;
    const seen = usage.get(key) ?? { total: 0, last: row.part.week.weekOf };
    seen.total += 1;
    if (row.part.week.weekOf > seen.last) seen.last = row.part.week.weekOf;
    usage.set(key, seen);
  }
  return usage;
}

/** The roll of the school: those still enrolled, then those who have left it. */
export async function loadStudents() {
  return prisma.schoolStudent.findMany({
    orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    include: {
      conductor: { select: { firstName: true, lastName: true } },
      publisher: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { assignments: true } },
    },
  });
}

export async function loadStudent(id: string) {
  return prisma.schoolStudent.findUnique({
    where: { id },
    include: {
      conductor: { select: { id: true, firstName: true, lastName: true } },
      publisher: { select: { id: true, firstName: true, lastName: true } },
      assignments: {
        orderBy: { part: { week: { weekOf: "desc" } } },
        include: {
          part: {
            select: {
              title: true,
              position: true,
              section: true,
              week: { select: { id: true, weekOf: true, period: { select: { label: true } } } },
            },
          },
        },
      },
    },
  });
}

/** The filed schedules and workbook pages, newest first. */
export async function schoolDocuments(where?: { periodId?: string | null; weekId?: string | null }) {
  return prisma.midweekDocument.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      fileName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      period: { select: { id: true, label: true } },
      week: { select: { id: true, weekOf: true } },
      uploadedBy: { select: { name: true } },
    },
  });
}

export type DocumentRow = Awaited<ReturnType<typeof schoolDocuments>>[number];

/**
 * The publisher list the overseer plans from: names, groups and appointments,
 * with no contact details. Chairmen come only from brothers the body of elders
 * approved (S-38 par. 24), so the appointment is worth showing.
 */
export async function rollForSchool(filter?: { q?: string; groupId?: string }) {
  return prisma.publisher.findMany({
    where: {
      status: { in: ROLL },
      ...(filter?.groupId ? { groupId: filter.groupId } : {}),
      ...(filter?.q
        ? {
            OR: [
              { firstName: { contains: filter.q, mode: "insensitive" as const } },
              { lastName: { contains: filter.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      appointment: true,
      pioneerStatus: true,
      privileges: true,
      group: { select: { number: true, name: true } },
    },
    orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
  });
}

/**
 * The brothers the body of elders has approved to read the Scriptures at the
 * meeting. The list is the overseer's to keep and the secretary's to correct, so
 * it lives in a congregation setting rather than on each publisher record.
 */
export const APPROVED_READERS_KEY = "school:approvedReaders";

export async function approvedReaderIds(): Promise<Set<string>> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: APPROVED_READERS_KEY } });
  if (!row) return new Set();
  try {
    const parsed: unknown = JSON.parse(row.value);
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export async function approvedReaders() {
  const ids = await approvedReaderIds();
  if (ids.size === 0) return [];
  return prisma.publisher.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, firstName: true, lastName: true, appointment: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

/**
 * Publishers under restrictions that have not been lifted are not eligible for
 * a part. Only the ids travel: the standing behind them is elders-only and is
 * never shown on a school page.
 */
export async function restrictedPublisherIds(): Promise<Set<string>> {
  const rows = await prisma.standingRecord.findMany({
    where: { kind: "RESTRICTION", liftedDate: null },
    select: { publisherId: true },
  });
  return new Set(rows.map((row) => row.publisherId));
}

/**
 * Fills the picker pools from the two rolls and the approved-reader list.
 */
export async function loadPools(): Promise<SchoolPools> {
  const [publishers, students, readers, restricted] = await Promise.all([
    prisma.publisher.findMany({
      where: { status: { in: ROLL } },
      select: { id: true, firstName: true, lastName: true, gender: true, appointment: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.schoolStudent.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true, gender: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    approvedReaderIds(),
    restrictedPublisherIds(),
  ]);

  const eligible = publishers.filter((p) => !restricted.has(p.id));
  const brothers = eligible.filter((p) => p.gender === "MALE");
  const elders = brothers.filter((p) => p.appointment === "ELDER");
  // The talks, the features and the congregation Bible study belong to the
  // appointed brothers; the chair stays with the elders alone.
  const appointed = brothers.filter((p) => p.appointment === "ELDER" || p.appointment === "MINISTERIAL_SERVANT");
  const maleStudents = students.filter((s) => s.gender === "MALE");

  const publisher = (p: { id: string; firstName: string; lastName: string }): NameOption => ({
    value: personRef("publisher", p.id),
    label: displayName(p),
  });
  const student = (s: { id: string; firstName: string; lastName: string }): NameOption => ({
    value: personRef("student", s.id),
    label: `${displayName(s)} (student)`,
  });

  const gender: Record<string, "MALE" | "FEMALE"> = {};
  for (const p of publishers) gender[personRef("publisher", p.id)] = p.gender;
  for (const s of students) gender[personRef("student", s.id)] = s.gender;

  return {
    chairman: elders.map(publisher),
    prayer: brothers.map(publisher),
    speaker: appointed.map(publisher),
    reading: [...brothers.map(publisher), ...maleStudents.map(student)].sort(byLabel),
    ministry: [...eligible.map(publisher), ...students.map(student)].sort(byLabel),
    conductor: appointed.map(publisher),
    reader: eligible.filter((p) => readers.has(p.id)).map(publisher),
    gender,
  };
}

const byLabel = (a: NameOption, b: NameOption) => a.label.localeCompare(b.label);

/**
 * Everyone currently eligible for a part, as the rotation counts them: the
 * publishers on the roll who are not under restrictions, and the students of
 * the school still on its roll.
 */
export async function rotationRoll(): Promise<RollEntry[]> {
  const [publishers, students, restricted] = await Promise.all([
    prisma.publisher.findMany({
      where: { status: { in: ROLL } },
      select: { id: true, firstName: true, lastName: true, appointment: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.schoolStudent.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    restrictedPublisherIds(),
  ]);

  return [
    ...publishers
      .filter((p) => !restricted.has(p.id))
      .map((p) => ({
        key: personRef("publisher", p.id),
        name: displayName(p),
        isStudent: false,
        appointment: p.appointment,
      })),
    ...students.map((s) => ({
      key: personRef("student", s.id),
      name: `${displayName(s)} (student)`,
      isStudent: true,
      appointment: null,
    })),
  ];
}

/** How often each brother has actually read, and when he last did. */
export async function readerUsage(): Promise<Map<string, Usage>> {
  const rows = await prisma.midweekAssignment.findMany({
    where: { slot: "READER", publisherId: { not: null } },
    select: { publisherId: true, part: { select: { week: { select: { weekOf: true } } } } },
  });

  const usage = new Map<string, Usage>();
  for (const row of rows) {
    if (!row.publisherId) continue;
    const weekOf = row.part.week.weekOf;
    const seen = usage.get(row.publisherId) ?? { total: 0, last: weekOf };
    seen.total += 1;
    if (weekOf > seen.last) seen.last = weekOf;
    usage.set(row.publisherId, seen);
  }
  return usage;
}

/** A printed name, reduced to its letters: case, punctuation and spacing gone. */
export function normaliseName(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, " ").replace(/\s+/g, " ").trim();
}

export type PersonMatch = { key: string; name: string };

/**
 * Everyone ever on the rolls, keyed by their normalised name in both orders, so
 * a name printed on an old schedule can be tied back to the person it was.
 * People who have since transferred out or left the school are still matched:
 * the schedule they handled keeps their name.
 */
export async function personIndex(): Promise<Map<string, PersonMatch>> {
  const [publishers, students] = await Promise.all([
    prisma.publisher.findMany({ select: { id: true, firstName: true, lastName: true } }),
    prisma.schoolStudent.findMany({ select: { id: true, firstName: true, lastName: true } }),
  ]);

  const index = new Map<string, PersonMatch>();
  const add = (key: string, name: string, first: string, last: string) => {
    for (const form of [normaliseName(`${first} ${last}`), normaliseName(`${last} ${first}`)]) {
      if (form && !index.has(form)) index.set(form, { key, name });
    }
  };
  for (const p of publishers) add(personRef("publisher", p.id), displayName(p), p.firstName, p.lastName);
  for (const s of students) add(personRef("student", s.id), displayName(s), s.firstName, s.lastName);
  return index;
}

/**
 * Everyone the history picker may choose from — the same set the matcher knows,
 * as label/value options sorted by name. A past schedule can name a brother who
 * has since transferred out, so this is deliberately wider than the pools the
 * week editor offers.
 */
export async function personOptions(): Promise<NameOption[]> {
  const index = await personIndex();
  const seen = new Map<string, string>();
  for (const match of index.values()) if (!seen.has(match.key)) seen.set(match.key, match.name);
  return [...seen]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Ties a printed name to a person: the exact name in either order first, then
 * the one person on file whose full name carries every word printed, which is
 * how a middle name left off the schedule still lands on the right brother.
 */
export function matchName(index: Map<string, PersonMatch>, printed: string): PersonMatch | null {
  const norm = normaliseName(printed);
  if (!norm) return null;
  const exact = index.get(norm);
  if (exact) return exact;

  const tokens = norm.split(" ");
  const candidates = new Map<string, PersonMatch>();
  for (const [form, match] of index) {
    const words = form.split(" ");
    if (tokens.every((token) => words.includes(token))) candidates.set(match.key, match);
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

/** Who an assignment points at, whichever of the two rolls they are on. */
export function assignedName(assignment: AssignmentRow): string | null {
  if (assignment.publisher) return displayName(assignment.publisher);
  if (assignment.student) return displayName(assignment.student);
  return null;
}

/** What the editor's picker shows for an assignment already made. */
export function assignedValue(assignment: AssignmentRow): string {
  if (assignment.publisherId) return personRef("publisher", assignment.publisherId);
  if (assignment.studentId) return personRef("student", assignment.studentId);
  return "";
}

/** The part as the printer wants it, with every slot resolved to a name. */
export function toSchedulePart(part: PartRow): SchedulePart {
  const names: Record<string, string | null> = {};
  for (const assignment of part.assignments) {
    names[slotField(assignment.slot)] = assignedName(assignment);
  }
  return {
    position: part.position,
    section: part.section,
    title: part.title,
    minutes: part.minutes,
    detail: part.detail,
    names,
  };
}

export function toScheduleWeek(row: WeekRow): ScheduleWeek {
  return {
    date: row.weekOf,
    bibleReading: row.bibleReading,
    note: weekBanner(row.note),
    chairman: row.chairman ? displayName(row.chairman) : null,
    openingSong: row.openingSong,
    livingSong: row.livingSong,
    closingSong: row.closingSong,
    openingPrayer: row.openingPrayer ? displayName(row.openingPrayer) : null,
    closingPrayer: row.closingPrayer ? displayName(row.closingPrayer) : null,
    cancelled: row.cancelled,
    cancelledReason: row.cancelledReason,
  };
}
