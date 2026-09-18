import "server-only";
import type { MidweekSlot, Prisma, PublisherStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import {
  SLOT_LABELS, hallsFor, personRef, slotField,
  type SchedulePart, type ScheduleWeek,
} from "@/lib/school";
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
  counselor: { select: { firstName: true, lastName: true } },
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
            select: { slots: true, dualHall: true, assignments: { select: { id: true } } },
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
            select: { slots: true, dualHall: true, assignments: { select: { id: true } } },
          },
        },
      },
      _count: { select: { documents: true } },
    },
  });
}

/**
 * How many names a week still owes. The denominator is every slot the week's
 * parts ask for, in both halls where a part is handled twice, so a week reads as
 * finished only when the auxiliary classroom is filled in too.
 */
export function weekProgress(week: { parts: { slots: MidweekSlot[]; dualHall: boolean; assignments: { id: string }[] }[] }) {
  let need = 0;
  let have = 0;
  for (const part of week.parts) {
    need += part.slots.length * hallsFor(part.dualHall).length;
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

/** Options for the pickers that name a chairman, a counselor or a prayer. */
export async function chairmanOptions(roll: Awaited<ReturnType<typeof rollForSchool>>): Promise<NameOption[]> {
  return roll
    .filter((p) => p.gender === "MALE")
    .map((p) => ({
      value: p.id,
      label:
        p.appointment === "ELDER"
          ? `${displayName(p)} — elder`
          : p.appointment === "MINISTERIAL_SERVANT"
            ? `${displayName(p)} — ministerial servant`
            : displayName(p),
    }));
}

/**
 * Options for the pickers that assign a part. Publishers and the students of
 * the school who are not publishing yet are offered together, in one alphabetical
 * list, because the overseer thinks of them as one body of speakers.
 */
export async function assignmentOptions(): Promise<NameOption[]> {
  const [publishers, students] = await Promise.all([
    prisma.publisher.findMany({
      where: { status: { in: ROLL } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.schoolStudent.findMany({
      where: { active: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return [
    ...publishers.map((p) => ({ value: personRef("publisher", p.id), label: displayName(p) })),
    ...students.map((s) => ({ value: personRef("student", s.id), label: `${displayName(s)} (student)` })),
  ].sort((a, b) => a.label.localeCompare(b.label));
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
    names[slotField(assignment.slot, assignment.hall)] = assignedName(assignment);
  }
  return {
    position: part.position,
    section: part.section,
    title: part.title,
    minutes: part.minutes,
    detail: part.detail,
    dualHall: part.dualHall,
    names,
  };
}

export function toScheduleWeek(row: WeekRow): ScheduleWeek {
  return {
    date: row.weekOf,
    bibleReading: row.bibleReading,
    note: row.note,
    chairman: row.chairman ? displayName(row.chairman) : null,
    counselor: row.counselor ? displayName(row.counselor) : null,
    openingSong: row.openingSong,
    livingSong: row.livingSong,
    closingSong: row.closingSong,
    openingPrayer: row.openingPrayer ? displayName(row.openingPrayer) : null,
    closingPrayer: row.closingPrayer ? displayName(row.closingPrayer) : null,
    cancelled: row.cancelled,
    cancelledReason: row.cancelledReason,
  };
}
