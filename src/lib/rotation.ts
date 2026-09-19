import "server-only";
import type { Appointment, MidweekSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { personRef } from "@/lib/school";
import type { NameOption } from "@/components/name-picker";

/**
 * The rotation the overseer is answerable for: parts going round the whole
 * congregation, nobody handling two meetings in a row, and a student not kept
 * with the same assistant week after week. Everything here is computed from
 * the assignments already on file, so imported history counts too.
 */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type AssignmentFact = {
  key: string;
  name: string;
  isStudent: boolean;
  appointment: Appointment | null;
  weekOf: Date;
  partId: string;
  partTitle: string;
  section: string;
  slot: MidweekSlot;
};

/** Every name given out on any schedule, oldest meeting first. */
export async function assignmentFacts(): Promise<AssignmentFact[]> {
  const rows = await prisma.midweekAssignment.findMany({
    select: {
      slot: true,
      publisherId: true,
      studentId: true,
      publisher: { select: { firstName: true, lastName: true, appointment: true } },
      student: { select: { firstName: true, lastName: true } },
      part: {
        select: {
          id: true,
          title: true,
          section: true,
          week: { select: { weekOf: true } },
        },
      },
    },
    orderBy: { part: { week: { weekOf: "asc" } } },
  });

  const facts: AssignmentFact[] = [];
  for (const row of rows) {
    if (row.publisher && row.publisherId) {
      facts.push({
        key: personRef("publisher", row.publisherId),
        name: displayName(row.publisher),
        isStudent: false,
        appointment: row.publisher.appointment,
        weekOf: row.part.week.weekOf,
        partId: row.part.id,
        partTitle: row.part.title,
        section: row.part.section,
        slot: row.slot,
      });
    } else if (row.student && row.studentId) {
      facts.push({
        key: personRef("student", row.studentId),
        name: displayName(row.student),
        isStudent: true,
        appointment: null,
        weekOf: row.part.week.weekOf,
        partId: row.part.id,
        partTitle: row.part.title,
        section: row.part.section,
        slot: row.slot,
      });
    }
  }
  return facts;
}

export type PersonStat = {
  key: string;
  name: string;
  isStudent: boolean;
  appointment: Appointment | null;
  total: number;
  last: Date | null;
  lastTitle: string | null;
  lastSlot: MidweekSlot | null;
  /** Weeks since their last part; null when they have never had one. */
  waitingWeeks: number | null;
};

export type RollEntry = {
  key: string;
  name: string;
  isStudent: boolean;
  appointment: Appointment | null;
};

/**
 * How long each person has been waiting, longest first. People with no part at
 * all come first — they are the ones the rotation must not leave out.
 */
export function statsFrom(facts: AssignmentFact[], roll: RollEntry[], now = new Date()): PersonStat[] {
  const stats = new Map<string, PersonStat>();
  for (const person of roll) {
    stats.set(person.key, { ...person, total: 0, last: null, lastTitle: null, lastSlot: null, waitingWeeks: null });
  }
  for (const fact of facts) {
    const entry = stats.get(fact.key) ?? {
      key: fact.key,
      name: fact.name,
      isStudent: fact.isStudent,
      appointment: fact.appointment,
      total: 0,
      last: null,
      lastTitle: null,
      lastSlot: null,
      waitingWeeks: null,
    };
    entry.total += 1;
    if (!entry.last || fact.weekOf > entry.last) {
      entry.last = fact.weekOf;
      entry.lastTitle = fact.partTitle;
      entry.lastSlot = fact.slot;
    }
    stats.set(fact.key, entry);
  }

  for (const entry of stats.values()) {
    entry.waitingWeeks = entry.last ? Math.floor((now.getTime() - entry.last.getTime()) / WEEK_MS) : null;
  }
  return [...stats.values()].sort(
    (a, b) => (b.waitingWeeks ?? 10_000) - (a.waitingWeeks ?? 10_000) || a.name.localeCompare(b.name),
  );
}

export type ConsecutiveConflict = { key: string; name: string; first: Date; second: Date };

/** Anyone given a part in two meetings a week apart. */
export function consecutiveConflicts(facts: AssignmentFact[]): ConsecutiveConflict[] {
  const weeksByKey = new Map<string, Set<number>>();
  const nameByKey = new Map<string, string>();
  for (const fact of facts) {
    const set = weeksByKey.get(fact.key) ?? new Set<number>();
    set.add(fact.weekOf.getTime());
    weeksByKey.set(fact.key, set);
    nameByKey.set(fact.key, fact.name);
  }

  const out: ConsecutiveConflict[] = [];
  for (const [key, weeks] of weeksByKey) {
    for (const time of weeks) {
      if (weeks.has(time + WEEK_MS)) {
        out.push({ key, name: nameByKey.get(key) ?? key, first: new Date(time), second: new Date(time + WEEK_MS) });
      }
    }
  }
  return out.sort((a, b) => a.first.getTime() - b.first.getTime());
}

export type Pairing = {
  partId: string;
  date: Date;
  partTitle: string;
  studentKey: string;
  student: string;
  assistantKey: string;
  assistant: string;
};

/** Every student assignment handled with an assistant: who assisted whom. */
export function pairingsFrom(facts: AssignmentFact[]): Pairing[] {
  const byPart = new Map<string, { date: Date; partTitle: string; student?: AssignmentFact; assistant?: AssignmentFact }>();
  for (const fact of facts) {
    if (fact.slot !== "STUDENT" && fact.slot !== "ASSISTANT") continue;
    const entry = byPart.get(fact.partId) ?? { date: fact.weekOf, partTitle: fact.partTitle };
    if (fact.slot === "STUDENT") entry.student = fact;
    else entry.assistant = fact;
    byPart.set(fact.partId, entry);
  }

  const out: Pairing[] = [];
  for (const [partId, entry] of byPart) {
    if (!entry.student || !entry.assistant) continue;
    out.push({
      partId,
      date: entry.date,
      partTitle: entry.partTitle,
      studentKey: entry.student.key,
      student: entry.student.name,
      assistantKey: entry.assistant.key,
      assistant: entry.assistant.name,
    });
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export type RepeatedPairing = { student: string; assistant: string; dates: Date[] };

/** The same student and assistant put together more than once, oldest first. */
export function repeatedPairings(pairings: Pairing[]): RepeatedPairing[] {
  const grouped = new Map<string, RepeatedPairing>();
  for (const pairing of [...pairings].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const key = `${pairing.studentKey}|${pairing.assistantKey}`;
    const entry = grouped.get(key) ?? { student: pairing.student, assistant: pairing.assistant, dates: [] };
    entry.dates.push(pairing.date);
    grouped.set(key, entry);
  }
  return [...grouped.values()].filter((entry) => entry.dates.length > 1);
}

/** Names in this week's meeting who also have a part the week before or after. */
export function weekConsecutive(facts: AssignmentFact[], weekOf: Date): { name: string; other: Date }[] {
  const here = new Set(facts.filter((f) => f.weekOf.getTime() === weekOf.getTime()).map((f) => f.key));
  const out: { name: string; other: Date }[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    if (!here.has(fact.key)) continue;
    const gap = fact.weekOf.getTime() - weekOf.getTime();
    if (gap !== WEEK_MS && gap !== -WEEK_MS) continue;
    if (seen.has(fact.key)) continue;
    seen.add(fact.key);
    out.push({ name: fact.name, other: fact.weekOf });
  }
  return out;
}

/** Pairs in this week that have already been put together on an earlier schedule. */
export function weekRepeatedPairings(pairings: Pairing[], weekOf: Date): { student: string; assistant: string; earlier: Date }[] {
  const now = weekOf.getTime();
  const out: { student: string; assistant: string; earlier: Date }[] = [];
  for (const pairing of pairings) {
    if (pairing.date.getTime() !== now) continue;
    const earlier = pairings
      .filter((p) => p.date.getTime() < now && p.studentKey === pairing.studentKey && p.assistantKey === pairing.assistantKey)
      .map((p) => p.date)
      .pop();
    if (earlier) out.push({ student: pairing.student, assistant: pairing.assistant, earlier });
  }
  return out;
}

/**
 * Who held each session of the parts the week before or after this one. The
 * rotation keeps a brother out of the same slot two meetings running, so a
 * suggestion has to keep him out of it too.
 */
export function slotsAround(facts: AssignmentFact[], weekOf: Date): Map<MidweekSlot, Set<string>> {
  const now = weekOf.getTime();
  const out = new Map<MidweekSlot, Set<string>>();
  for (const fact of facts) {
    if (Math.abs(fact.weekOf.getTime() - now) !== WEEK_MS) continue;
    const set = out.get(fact.slot) ?? new Set<string>();
    set.add(fact.key);
    out.set(fact.slot, set);
  }
  return out;
}

/**
 * Who to consider for a slot: the longest-waiting candidates who are not
 * already in this week's meeting and had no part the week before, so the
 * suggestion never breaks the rotation it is meant to protect.
 */
export function suggestFrom(
  facts: AssignmentFact[],
  stats: PersonStat[],
  weekOf: Date,
  candidates: NameOption[],
  taken: Set<string>,
  limit = 3,
): NameOption[] {
  const previous = weekOf.getTime() - WEEK_MS;
  const busyPrevious = new Set(facts.filter((f) => f.weekOf.getTime() === previous).map((f) => f.key));
  const waiting = new Map(stats.map((s) => [s.key, s.waitingWeeks]));

  return candidates
    .filter((option) => !taken.has(option.value) && !busyPrevious.has(option.value))
    .sort((a, b) => (waiting.get(b.value) ?? 10_000) - (waiting.get(a.value) ?? 10_000))
    .slice(0, limit);
}

// ---------------------------------------------------- the sessions of the meeting

export type SameSlotRepeat = { key: string; name: string; slot: MidweekSlot; first: Date; second: Date };

/**
 * The same person kept in the same session of the meeting two meetings running:
 * the chairman who chaired last week, the conductor who conducted it. A brother
 * may well have a part two weeks running, but not the same one.
 */
export function sameSlotConsecutive(facts: AssignmentFact[]): SameSlotRepeat[] {
  const groups = new Map<string, { key: string; name: string; slot: MidweekSlot; weeks: Set<number> }>();
  for (const fact of facts) {
    const id = `${fact.key}|${fact.slot}`;
    const group = groups.get(id) ?? { key: fact.key, name: fact.name, slot: fact.slot, weeks: new Set<number>() };
    group.weeks.add(fact.weekOf.getTime());
    groups.set(id, group);
  }

  const out: SameSlotRepeat[] = [];
  for (const group of groups.values()) {
    for (const time of group.weeks) {
      if (group.weeks.has(time + WEEK_MS)) {
        out.push({ key: group.key, name: group.name, slot: group.slot, first: new Date(time), second: new Date(time + WEEK_MS) });
      }
    }
  }
  return out.sort((a, b) => a.first.getTime() - b.first.getTime());
}

/** This week's names who hold the same session the week before or after. */
export function weekSameSlot(facts: AssignmentFact[], weekOf: Date): { name: string; slot: MidweekSlot; other: Date }[] {
  const now = weekOf.getTime();
  const out: { name: string; slot: MidweekSlot; other: Date }[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    if (fact.weekOf.getTime() !== now) continue;
    const id = `${fact.key}|${fact.slot}`;
    if (seen.has(id)) continue;
    const other = facts.find(
      (f) => f.key === fact.key && f.slot === fact.slot && Math.abs(f.weekOf.getTime() - now) === WEEK_MS,
    );
    if (!other) continue;
    seen.add(id);
    out.push({ name: fact.name, slot: fact.slot, other: other.weekOf });
  }
  return out;
}

/** The chairman and the two prayers: held on the week itself, not on a part. */
export type WeekRole = "CHAIRMAN" | "OPENING_PRAYER" | "CLOSING_PRAYER";

export const ROLE_LABELS: Record<WeekRole, string> = {
  CHAIRMAN: "Chairman",
  OPENING_PRAYER: "Opening prayer",
  CLOSING_PRAYER: "Closing prayer",
};

export type RoleFact = { key: string; name: string; role: WeekRole; weekOf: Date };

/** Every chairman and prayer on every schedule on file, oldest meeting first. */
export async function roleFacts(): Promise<RoleFact[]> {
  const rows = await prisma.midweekWeek.findMany({
    orderBy: { weekOf: "asc" },
    select: {
      weekOf: true,
      chairmanId: true,
      openingPrayerId: true,
      closingPrayerId: true,
      chairman: { select: { firstName: true, lastName: true } },
      openingPrayer: { select: { firstName: true, lastName: true } },
      closingPrayer: { select: { firstName: true, lastName: true } },
    },
  });

  const out: RoleFact[] = [];
  for (const row of rows) {
    const push = (id: string | null, person: { firstName: string; lastName: string } | null, role: WeekRole) => {
      if (id && person) out.push({ key: personRef("publisher", id), name: displayName(person), role, weekOf: row.weekOf });
    };
    push(row.chairmanId, row.chairman, "CHAIRMAN");
    push(row.openingPrayerId, row.openingPrayer, "OPENING_PRAYER");
    push(row.closingPrayerId, row.closingPrayer, "CLOSING_PRAYER");
  }
  return out;
}

export type RoleRepeat = { key: string; name: string; role: WeekRole; first: Date; second: Date };

/** A brother kept in the same chair or prayer two meetings running. */
export function roleRepeats(roles: RoleFact[]): RoleRepeat[] {
  const groups = new Map<string, { key: string; name: string; role: WeekRole; weeks: Set<number> }>();
  for (const fact of roles) {
    const id = `${fact.key}|${fact.role}`;
    const group = groups.get(id) ?? { key: fact.key, name: fact.name, role: fact.role, weeks: new Set<number>() };
    group.weeks.add(fact.weekOf.getTime());
    groups.set(id, group);
  }

  const out: RoleRepeat[] = [];
  for (const group of groups.values()) {
    for (const time of group.weeks) {
      if (group.weeks.has(time + WEEK_MS)) {
        out.push({ key: group.key, name: group.name, role: group.role, first: new Date(time), second: new Date(time + WEEK_MS) });
      }
    }
  }
  return out.sort((a, b) => a.first.getTime() - b.first.getTime());
}

/** The chairman and prayers of the meetings a week either side of this one. */
export function rolesAround(roles: RoleFact[], weekOf: Date): RoleFact[] {
  const now = weekOf.getTime();
  return roles.filter((fact) => Math.abs(fact.weekOf.getTime() - now) === WEEK_MS);
}

// ------------------------------------------------------------------ the trend

export type PersonTrend = {
  /** How many times each session of the parts has been theirs. */
  slots: Partial<Record<MidweekSlot, number>>;
  /** How many times each chair and prayer has been theirs. */
  roles: Partial<Record<WeekRole, number>>;
  /** Everything they handled in the eight weeks up to now. */
  recent: number;
};

/**
 * Where one person's parts have fallen: the sessions they have served and how
 * busy the last eight weeks have been for them. This is the trend the overseer
 * reads an elder's or a ministerial servant's rotation from.
 */
export function trendsFrom(facts: AssignmentFact[], roles: RoleFact[], now = new Date()): Map<string, PersonTrend> {
  const cutoff = now.getTime() - 8 * WEEK_MS;
  const out = new Map<string, PersonTrend>();
  const entry = (key: string): PersonTrend => {
    const found = out.get(key) ?? { slots: {}, roles: {}, recent: 0 };
    out.set(key, found);
    return found;
  };

  for (const fact of facts) {
    const trend = entry(fact.key);
    trend.slots[fact.slot] = (trend.slots[fact.slot] ?? 0) + 1;
    if (fact.weekOf.getTime() >= cutoff) trend.recent += 1;
  }
  for (const fact of roles) {
    const trend = entry(fact.key);
    trend.roles[fact.role] = (trend.roles[fact.role] ?? 0) + 1;
    if (fact.weekOf.getTime() >= cutoff) trend.recent += 1;
  }
  return out;
}
