import type { MidweekHall, MidweekSection, MidweekSlot } from "@prisma/client";

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

export const HALL_LABELS: Record<MidweekHall, string> = {
  MAIN: "Main hall",
  AUXILIARY: "Auxiliary classroom",
};

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
  dualHall?: boolean;
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
 * period, a feature may be a discussion, and a circuit overseer's week drops
 * the auxiliary classroom altogether.
 */
export const WEEK_SKELETON: SkeletonPart[] = [
  { section: "TREASURES", title: "Talk", minutes: 10, kind: "TALK" },
  { section: "TREASURES", title: "Spiritual Gems", minutes: 10, kind: "TALK" },
  { section: "TREASURES", title: "Bible Reading", minutes: 4, kind: "READING", dualHall: true },
  { section: "MINISTRY", title: "Student assignment", minutes: 3, kind: "STUDENT", dualHall: true },
  { section: "MINISTRY", title: "Student assignment", minutes: 4, kind: "STUDENT", dualHall: true },
  { section: "MINISTRY", title: "Student assignment", minutes: 5, kind: "STUDENT", dualHall: true },
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
// printed schedule still has to show a time against every line.
export const SONG_MINUTES = 5;
export const OPENING_COMMENTS_MINUTES = 1;
export const CONCLUDING_COMMENTS_MINUTES = 3;

/** The meeting runs one hour forty-five minutes (S-38 par. 20). */
export const MINUTES_PER_S38 = 105;

export type ScheduleLine =
  | { kind: "song"; which: "opening" | "living" | "closing"; number: number | null; time: string; prayer: string | null }
  | { kind: "comments"; which: "opening" | "concluding"; minutes: number; time: string }
  | { kind: "heading"; section: MidweekSection; columnHeaders: boolean }
  | {
      kind: "part";
      position: number;
      title: string;
      minutes: number | null;
      detail: string | null;
      time: string;
      names: { hall: MidweekHall; label: string }[];
    };

export type ScheduleWeek = {
  date: Date;
  bibleReading: string | null;
  /** Printed across the top of the schedule: a circuit overseer's week, an assembly. */
  note: string | null;
  chairman: string | null;
  counselor: string | null;
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
  dualHall: boolean;
  /** Names by `${slot}@${hall}`, already resolved to display names. */
  names: Record<string, string | null>;
};

function clock(totalMinutes: number): string {
  return clockLabel(Math.floor(totalMinutes / 60) % 24, totalMinutes % 60);
}

/**
 * Lays a week out in the order the S-140 prints it, with a running clock. The
 * sections a week has no parts in are left out, and the two-hall column headers
 * only appear where a part is actually handled in the auxiliary classroom.
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
  const dualHall = ordered.some((p) => p.dualHall);
  const seen = new Set<MidweekSection>();

  lines.push({
    kind: "song", which: "opening", number: week.openingSong, time: at(), prayer: week.openingPrayer,
  });
  elapsed += SONG_MINUTES;

  lines.push({ kind: "comments", which: "opening", minutes: OPENING_COMMENTS_MINUTES, time: at() });
  elapsed += OPENING_COMMENTS_MINUTES;

  for (const part of ordered) {
    if (!seen.has(part.section)) {
      seen.add(part.section);
      lines.push({
        kind: "heading",
        section: part.section,
        columnHeaders: dualHall && part.section !== "LIVING",
      });
      if (part.section === "LIVING") {
        lines.push({ kind: "song", which: "living", number: week.livingSong, time: at(), prayer: null });
        elapsed += SONG_MINUTES;
      }
    }

    const names: { hall: MidweekHall; label: string }[] = [];
    for (const hall of ["AUXILIARY", "MAIN"] as MidweekHall[]) {
      // SLOT_ORDER, not the alphabet: the S-140 reads "Student/Assistant" and
      // "Conductor/Reader", and both would come out backwards otherwise.
      const slots = SLOT_ORDER.filter((slot) => part.names[slotField(slot, hall)]);
      if (slots.length === 0) continue;
      const prefix = slots.map((s) => SLOT_PREFIX[s]).filter(Boolean).join("/");
      const who = slots.map((s) => part.names[slotField(s, hall)]).join("/");
      names.push({ hall, label: prefix ? `${prefix}: ${who}` : who });
    }

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
    SONG_MINUTES * 2 +
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

/** The form field name of one slot of one part: `STUDENT@MAIN`. */
export function slotField(slot: MidweekSlot, hall: MidweekHall): string {
  return `${slot}@${hall}`;
}

export function hallsFor(dualHall: boolean): MidweekHall[] {
  return dualHall ? (["MAIN", "AUXILIARY"] as MidweekHall[]) : (["MAIN"] as MidweekHall[]);
}
