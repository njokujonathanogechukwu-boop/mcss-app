import type { MidweekSection, MidweekSlot } from "@prisma/client";
import type { NameOption } from "@/components/name-picker";

/**
 * The Life and Ministry Meeting School: the shape of a week's schedule, how a
 * person is referred to in one of its slots, and the clock the printed schedule
 * carries. Shared by the editor, the printer and the assignment history so all
 * three read the same week the same way.
 *
 * Everything here follows the S-140 Midweek Meeting Schedule and the
 * instructions to the overseer in the S-38 booklet.
 */

export const SECTION_LABELS: Record<MidweekSection, string> = {
  TREASURES: "TREASURES FROM GOD'S WORD",
  MINISTRY: "APPLY YOURSELF TO THE FIELD MINISTRY",
  LIVING: "LIVING AS CHRISTIANS",
};

export const SECTION_ORDER: MidweekSection[] = ["TREASURES", "MINISTRY", "LIVING"];

/** What the S-140 prints in front of the names of each part. */
export const SLOT_PREFIX: Record<MidweekSlot, string> = {
  SPEAKER: "",
  STUDENT: "Student",
  ASSISTANT: "Assistant",
  CONDUCTOR: "Conductor",
  READER: "Reader",
};

export const SLOT_LABELS: Record<MidweekSlot, string> = {
  SPEAKER: "Speaker",
  STUDENT: "Student",
  ASSISTANT: "Assistant",
  CONDUCTOR: "Conductor",
  READER: "Reader",
};

/** The order slots are printed in, which is not alphabetical. */
export const SLOT_ORDER: MidweekSlot[] = ["SPEAKER", "STUDENT", "ASSISTANT", "CONDUCTOR", "READER"];

export const WEEKDAY_LABELS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ---------------------------------------------------------------- the skeleton

export type SkeletonPart = {
  section: MidweekSection;
  title: string;
  minutes: number;
  kind: PartKind;
};

/**
 * The kinds of part a schedule is made of. The kind decides who has to be
 * assigned to it — a speaker, a student with an assistant, or the conductor and
 * reader of the congregation Bible study.
 */
export const PART_KINDS = {
  TALK: { label: "Talk, feature or discussion", slots: ["SPEAKER"] },
  READING: { label: "Bible reading", slots: ["STUDENT"] },
  STUDENT: { label: "Student assignment with an assistant", slots: ["STUDENT", "ASSISTANT"] },
  STUDY: { label: "Congregation Bible study", slots: ["CONDUCTOR", "READER"] },
} as const satisfies Record<string, { label: string; slots: readonly MidweekSlot[] }>;

export type PartKind = keyof typeof PART_KINDS;

/**
 * The names each picker may offer. The S-38 keeps the parts apart: only a
 * brother the body of elders has approved chairs the meeting; the talks,
 * features and discussions and the congregation Bible study are handled by
 * elders and ministerial servants; the reading goes to any brother or male
 * student, and the reader is one of the brothers approved to read. Student
 * assignments are the one part the whole roll shares, and a student is helped
 * by one of the same gender.
 */
export type SchoolPools = {
  chairman: NameOption[];
  prayer: NameOption[];
  speaker: NameOption[];
  reading: NameOption[];
  ministry: NameOption[];
  conductor: NameOption[];
  reader: NameOption[];
  /** The gender of every name the pools offer, keyed by its picker value. */
  gender: Record<string, "MALE" | "FEMALE">;
};

/**
 * The pool a part's slot draws its names from. A talk in Apply Yourself to the
 * Field Ministry is a student talk: any brother or male student may give it,
 * the way he may handle the Bible reading. The talks of the other two sections
 * stay with the appointed brothers.
 */
export function poolFor(
  pools: SchoolPools, kind: PartKind, slot: MidweekSlot, section: MidweekSection,
): NameOption[] {
  if (kind === "STUDY") return slot === "READER" ? pools.reader : pools.conductor;
  if (kind === "READING") return pools.reading;
  if (kind === "STUDENT") return pools.ministry;
  if (section === "MINISTRY") return pools.reading;
  return pools.speaker;
}

const slotSignature = (slots: readonly MidweekSlot[]) =>
  SLOT_ORDER.filter((s) => slots.includes(s)).join(",");

/** Reads a part's slots back into the kind the editor offers. */
export function partKind(slots: readonly MidweekSlot[]): PartKind {
  const signature = slotSignature(slots);
  const match = (Object.keys(PART_KINDS) as PartKind[]).find(
    (kind) => slotSignature(PART_KINDS[kind].slots) === signature,
  );
  return match ?? "TALK";
}

/**
 * A week as the workbook prints it. Every line can be renamed, retimed, added
 * or removed afterwards: the number of student assignments moves from period to
 * period and a feature may be a discussion.
 */
export const WEEK_SKELETON: SkeletonPart[] = [
  { section: "TREASURES", title: "Talk", minutes: 10, kind: "TALK" },
  { section: "TREASURES", title: "Spiritual Gems", minutes: 10, kind: "TALK" },
  { section: "TREASURES", title: "Bible Reading", minutes: 4, kind: "READING" },
  { section: "MINISTRY", title: "Student assignment", minutes: 3, kind: "STUDENT" },
  { section: "MINISTRY", title: "Student assignment", minutes: 4, kind: "STUDENT" },
  { section: "MINISTRY", title: "Student assignment", minutes: 5, kind: "STUDENT" },
  { section: "LIVING", title: "Feature", minutes: 15, kind: "TALK" },
  { section: "LIVING", title: "Congregation Bible Study", minutes: 30, kind: "STUDY" },
];

// --------------------------------------------------------------- period dates

/** The two months one workbook covers, as a label. */
export function periodLabel(startYear: number, startMonth: number): string {
  const second = startMonth === 12 ? 1 : startMonth + 1;
  const secondYear = startMonth === 12 ? startYear + 1 : startYear;
  const a = MONTH_LABELS[startMonth - 1];
  const b = MONTH_LABELS[second - 1];
  return secondYear === startYear
    ? `${a}–${b} ${startYear}`
    : `${a} ${startYear} – ${b} ${secondYear}`;
}

/**
 * Every meeting day in the two months a workbook covers, given the weekday the
 * congregation meets. Dates are built in UTC because `weekOf` is a plain date
 * column: a local-time date would step back a day for anyone east of Greenwich.
 */
export function meetingDates(startYear: number, startMonth: number, weekday: number): Date[] {
  const dates: Date[] = [];
  for (let offset = 0; offset < 2; offset++) {
    const monthIndex = startMonth - 1 + offset;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = ((monthIndex % 12) + 12) % 12;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, month, day));
      if (date.getUTCDay() === weekday) dates.push(date);
    }
  }
  return dates;
}

/**
 * The meeting day inside one workbook week. The workbook dates a week by the
 * Monday its range starts on, while the schedule stores the day the congregation
 * actually meets, which is somewhere in the same seven days.
 */
export function meetingDateIn(start: Date, weekday: number): Date {
  const step = (weekday - start.getUTCDay() + 7) % 7;
  return new Date(start.getTime() + step * 86_400_000);
}

/**
 * The meeting day a date read off a year-less printed sheet really names. The
 * reader has to guess the year, and a wrong year drags the weekday with it, so
 * the overseer corrects both in the preview: the month and day stay as printed,
 * the year is the one given, and the date then snaps to the congregation's
 * meeting day inside the same week.
 */
export function correctedMeetingDate(read: Date, year: number, weekday: number): Date {
  const placed = new Date(Date.UTC(year, read.getUTCMonth(), read.getUTCDate()));
  const monday = new Date(placed.getTime() - ((placed.getUTCDay() + 6) % 7) * 86_400_000);
  return meetingDateIn(monday, weekday);
}

/**
 * The start of the next workbook period with no schedule on file yet. Workbooks
 * come out two months at a time from January, so a period always starts in an
 * odd month; the search skips the ones already taken.
 */
export function nextPeriodStart(
  today: Date,
  taken: { startYear: number; startMonth: number }[],
): { startYear: number; startMonth: number } {
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth() + 1;

  for (let step = 0; step < 24; step++) {
    if (month % 2 === 1 && !taken.some((t) => t.startYear === year && t.startMonth === month)) {
      return { startYear: year, startMonth: month };
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { startYear: year, startMonth: 1 };
}

/**
 * A meeting day as the school's pages print it. `weekOf` is a plain date held at
 * midnight UTC, so it is read back in UTC: in the server's own zone it would step
 * back a day anywhere west of Greenwich.
 */
export function formatWeekOf(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** A meeting day in short, for a list of several: `12 Sep`. Also read in UTC. */
export function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/** A start time as the schedule prints it: `18:00`. */
export function clockLabel(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// ------------------------------------------------------------------- the clock

// A song and the prayer that follows it, the opening and the concluding
// comments: the workbook gives minutes for the parts but not for these, and the
// printed schedule still has to show a time against every line. The opening
// song, its prayer and the chairman's comments together run the 5 minutes the
// congregation allows them; the song before Living as Christians runs 5 alone.
export const OPENING_SONG_MINUTES = 4;
export const SONG_MINUTES = 5;
export const OPENING_COMMENTS_MINUTES = 1;
export const CONCLUDING_COMMENTS_MINUTES = 3;

/** The meeting runs one hour forty-five minutes (S-38 par. 20). */
export const MINUTES_PER_S38 = 105;

/** One post carries the filed files plus the form, and the server-action body
 * limit is about 4 MB, so a batch crossing this would drop the page instead of
 * being refused. Kept here because both the action and the form guard on it. */
export const MAX_DOCUMENT_BYTES = 3.5 * 1024 * 1024;

export type ScheduleLine =
  | { kind: "song"; which: "opening" | "living" | "closing"; number: number | null; time: string; prayer: string | null }
  | { kind: "comments"; which: "opening" | "concluding"; minutes: number; time: string }
  | { kind: "heading"; section: MidweekSection }
  | {
      kind: "part";
      position: number;
      title: string;
      minutes: number | null;
      detail: string | null;
      time: string;
      /**
       * Who handles the part, as the schedule prints it: the role label in one
       * column and the slash-joined names in the other. Null while unassigned.
       */
      names: { role: string; people: string } | null;
    };

/** What prints across the top of every schedule that carries no banner of its own. */
export const DEFAULT_WEEK_BANNER = "MAITAMA MIDWEEK MEETING SCHEDULE";

/**
 * The history import filed its provenance in the banner column, where the
 * period list reads it; it is not a banner, so the schedule and the heading
 * form look past it.
 */
export function weekBanner(note: string | null): string | null {
  return note && note.startsWith("Imported from a past schedule (") ? null : note;
}

export type ScheduleWeek = {
  date: Date;
  bibleReading: string | null;
  /** Printed across the top of the schedule: a circuit overseer's week, an assembly. */
  note: string | null;
  chairman: string | null;
  openingSong: number | null;
  livingSong: number | null;
  closingSong: number | null;
  openingPrayer: string | null;
  closingPrayer: string | null;
  cancelled: boolean;
  cancelledReason: string | null;
};

export type SchedulePart = {
  position: number;
  section: MidweekSection;
  title: string;
  minutes: number | null;
  detail: string | null;
  /** Names by slot, already resolved to display names. */
  names: Record<string, string | null>;
};

function clock(totalMinutes: number): string {
  return clockLabel(Math.floor(totalMinutes / 60) % 24, totalMinutes % 60);
}

/**
 * Lays a week out in the order the schedule prints it, with a running clock. The
 * sections a week has no parts in are left out.
 */
export function buildSchedule(
  week: ScheduleWeek,
  parts: SchedulePart[],
  startHour: number,
  startMinute: number,
): ScheduleLine[] {
  const lines: ScheduleLine[] = [];
  let elapsed = 0;
  const at = () => clock(startHour * 60 + startMinute + elapsed);

  const ordered = [...parts].sort((a, b) => a.position - b.position);
  const seen = new Set<MidweekSection>();

  lines.push({
    kind: "song", which: "opening", number: week.openingSong, time: at(), prayer: week.openingPrayer,
  });
  elapsed += OPENING_SONG_MINUTES;

  lines.push({ kind: "comments", which: "opening", minutes: OPENING_COMMENTS_MINUTES, time: at() });
  elapsed += OPENING_COMMENTS_MINUTES;

  for (const part of ordered) {
    if (!seen.has(part.section)) {
      seen.add(part.section);
      lines.push({ kind: "heading", section: part.section });
      if (part.section === "LIVING") {
        lines.push({ kind: "song", which: "living", number: week.livingSong, time: at(), prayer: null });
        elapsed += SONG_MINUTES;
      }
    }

    // SLOT_ORDER, not the alphabet: the schedule reads "Student/Assistant" and
    // "Conductor/Reader", and both would come out backwards otherwise.
    const slots = SLOT_ORDER.filter((slot) => part.names[slotField(slot)]);
    const names = slots.length
      ? {
          role: slots.map((s) => SLOT_PREFIX[s]).filter(Boolean).join("/"),
          people: slots.map((s) => part.names[slotField(s)]).join("/"),
        }
      : null;

    lines.push({
      kind: "part",
      position: part.position,
      title: part.title,
      minutes: part.minutes,
      detail: part.detail,
      time: at(),
      names,
    });
    elapsed += part.minutes ?? 0;
  }

  lines.push({ kind: "comments", which: "concluding", minutes: CONCLUDING_COMMENTS_MINUTES, time: at() });
  elapsed += CONCLUDING_COMMENTS_MINUTES;

  lines.push({
    kind: "song", which: "closing", number: week.closingSong, time: at(), prayer: week.closingPrayer,
  });

  return lines;
}

/** How long the meeting runs, in minutes, from the opening song to the last prayer. */
export function meetingLength(parts: SchedulePart[]): number {
  return (
    OPENING_SONG_MINUTES +
    SONG_MINUTES +
    OPENING_COMMENTS_MINUTES +
    CONCLUDING_COMMENTS_MINUTES +
    parts.reduce((total, p) => total + (p.minutes ?? 0), 0)
  );
}

// --------------------------------------------------------------- person refs

/**
 * One picker offers both the publishers and the students of the school who are
 * not publishing yet, so a reference carries which of the two it points at.
 */
export type PersonRef = { kind: "publisher" | "student"; id: string };

export function personRef(kind: PersonRef["kind"], id: string): string {
  return `${kind === "publisher" ? "p" : "s"}:${id}`;
}

export function parsePersonRef(value: string | null | undefined): PersonRef | null {
  if (!value) return null;
  const [kind, id] = value.split(":");
  if (!id) return null;
  if (kind === "p") return { kind: "publisher", id };
  if (kind === "s") return { kind: "student", id };
  return null;
}

/** The form field name of one slot of one part. */
export function slotField(slot: MidweekSlot): string {
  return slot;
}

/**
 * The form field name the history preview uses to carry an overseer's pick for
 * one printed name the rolls did not match. Both the preview (which renders the
 * picker) and the import (which reads it back) compute the same path, so a pick
 * lands on exactly the name it was made for. `field` is "chairman", "opening",
 * "closing", or "part" with a position and slot.
 */
export function historyOverridePath(
  weekIndex: number,
  field: "chairman" | "opening" | "closing" | "part",
  position?: number,
  slot?: string,
): string {
  return field === "part" ? `ov:${weekIndex}:p${position}:${slot}` : `ov:${weekIndex}:${field}`;
}
