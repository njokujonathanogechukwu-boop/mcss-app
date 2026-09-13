import Papa from "papaparse";
import { MONTH_NAMES, MONTH_SHORT, WEEKDAY_NAMES, calendarYearOf } from "./service-year";
import { parseMonthLabel } from "./import-reports";

/**
 * Reads meeting attendance out of a pasted or uploaded sheet.
 *
 * Two layouts are recognised, and a sheet may mix them:
 *
 *  list     One row per meeting: the date, which meeting it was, and how many
 *           were in the hall and how many by video.
 *
 *  monthly  One row per month, which is all an old S-88 keeps: how many
 *           meetings were held, the total present and the average. The app
 *           records attendance per meeting, so a month is spread over the
 *           weekdays the congregation actually meets — Wednesday and Sunday
 *           unless the form says otherwise. The month's total comes out
 *           exactly as written, and the dates are the real meeting days.
 *
 * Headings are matched loosely and may carry the meeting they belong to
 * ("Midweek total", "Weekend average"), which is how a copied S-88 arrives.
 * Where the headings do not say, a Meeting column does, and failing that the
 * form's default is used. Parsing never touches the database.
 */

export type AttendanceLayout = "list" | "monthly" | "mixed";
export type MeetingType = "MIDWEEK" | "WEEKEND";

/** One meeting's count, as it will be written. */
export type AttendanceEntry = { date: Date; inPerson: number; zoom: number; notes: string | null };

export type ParsedAttendance = {
  line: number;
  kind: "meeting" | "month";
  meetingType: MeetingType;
  /** As written on the sheet: "12 Mar 2025" or "September 2025". */
  label: string;
  /** Which file it came from, when more than one was read. */
  source?: string;
  /** The figures the source gave, for the preview. */
  said: string;
  entries: AttendanceEntry[];
};

export type AttendanceParseResult = {
  layout: AttendanceLayout | null;
  rows: ParsedAttendance[];
  problems: { line: number; message: string }[];
  months: { year: number; month: number }[];
  /** How many rows were a month's figures spread over meeting days. */
  spread: number;
};

export type AttendanceParseOptions = {
  /** Fills in a month the sheet names without a year. */
  serviceYear: number;
  /** Weekday the congregation meets, Sunday = 0. A month is spread over these days. */
  midweekDay: number;
  weekendDay: number;
  /** Used when neither a heading nor the row says which meeting it was. */
  defaultType: MeetingType;
};

// ------------------------------------------------------------ headings

const DATE_HEADERS = ["date", "meetingdate", "day", "when"];
const MONTH_HEADERS = ["month", "period", "monthyear", "servicemonth"];
const TYPE_HEADERS = ["meeting", "meetingtype", "type", "service", "meetingkind"];
const NOTES_HEADERS = ["notes", "note", "remarks", "remark", "comments", "comment"];

type Measure = "meetings" | "average" | "inPerson" | "video" | "total";
type Column = { index: number; measure: Measure; meetingType: MeetingType | null };

function normalise(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], aliases: string[]): number | undefined {
  const i = headers.findIndex((h) => aliases.includes(normalise(h)));
  return i === -1 ? undefined : i;
}

/** Which meeting a heading or a cell value belongs to. */
function meetingTypeOf(text: string): MeetingType | null {
  const n = normalise(text);
  if (!n) return null;
  if (/midweek|weekday|christianlife|lifeministry|ldm|cwv|tuesday|wednesday|thursday/.test(n)) return "MIDWEEK";
  if (/weekend|sunday|saturday|watchtower|bibletalk|publictalk|publicmeeting/.test(n)) return "WEEKEND";
  return null;
}

function measureOf(header: string): Measure | null {
  const n = normalise(header);
  if (!n) return null;
  if (/average|avg|mean/.test(n)) return "average";
  if (/meetings?|held|conducted/.test(n)) return "meetings";
  if (/zoom|video|online|stream|virtual/.test(n)) return "video";
  if (/inperson|hall|present|inattendance/.test(n)) return "inPerson";
  if (/total|attendance|attendants|count|number/.test(n)) return "total";
  return null;
}

// --------------------------------------------------------------- values

function toCount(raw: string): number | null {
  const v = raw.replace(/[,\s]/g, "");
  if (!v || /^[-–—]$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** A date with a day in it, as opposed to a month: "12/03/2025", "2025-03-12", "12 Mar 2025". */
function parseMeetingDate(raw: string): Date | null {
  const v = raw.trim();
  const utc = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d ? date : null;
  };

  const dmy = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return utc(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const iso = v.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/); // also 2025-03-12T00:00:00Z
  if (iso) return utc(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthWord = (text: string) => {
    const n = text.toLowerCase().replace(/[^a-z]/g, "");
    return n.length >= 3 ? MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(n)) + 1 || null : null;
  };
  const dmyWord = v.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (dmyWord) {
    const m = monthWord(dmyWord[2]);
    return m ? utc(Number(dmyWord[3]), m, Number(dmyWord[1])) : null;
  }
  const mdyWord = v.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdyWord) {
    const m = monthWord(mdyWord[1]);
    return m ? utc(Number(mdyWord[3]), m, Number(mdyWord[2])) : null;
  }
  return null;
}

function dayLabel(date: Date) {
  return `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The weekdays of a month, earliest first, and never later than today. */
function meetingDates(year: number, month: number, weekday: number, today: Date): Date[] {
  const days: Date[] = [];
  for (let d = 1; d <= 31; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    if (date.getUTCMonth() + 1 !== month) break;
    if (date.getUTCDay() === weekday && date <= today) days.push(date);
  }
  return days;
}

const DAY = 86_400_000;

/**
 * The days a month's meetings go on, earliest first. The weekday the
 * congregation meets comes first; when more meetings were held than that
 * weekday falls in the month — a special meeting, or a week the meeting moved
 * — the rest go on the free days nearest those, so an extra meeting still sits
 * beside a real one instead of being dropped.
 */
function meetingDays(year: number, month: number, weekday: number, count: number, today: Date): Date[] {
  const scheduled = meetingDates(year, month, weekday, today);
  if (count <= scheduled.length) return scheduled.slice(0, count);

  const days = scheduled.slice();
  const taken = new Set(scheduled.map((d) => d.getUTCDate()));
  // Work back from the latest meeting: an extra one is a rescheduled week or a
  // special meeting, and either sits late in the month rather than before the
  // first scheduled day.
  const latestFirst = scheduled.slice().reverse();
  for (let step = 1; days.length < count && step <= 6; step++) {
    for (const base of latestFirst) {
      for (const offset of [step, -step]) {
        const date = new Date(base.getTime() + offset * DAY);
        if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month) continue;
        if (taken.has(date.getUTCDate()) || date > today) continue;
        taken.add(date.getUTCDate());
        days.push(date);
        if (days.length === count) break;
      }
      if (days.length >= count) break;
    }
  }
  return days.sort((a, b) => a.getTime() - b.getTime());
}

/** Shares a total out as evenly as whole people allow, keeping the sum exact. */
function share(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

// ------------------------------------------------------- a month's figures

/**
 * What one source says about one meeting in one month, however it was written.
 * A spreadsheet row and a box on an S-88 both end up here, and both are then
 * turned into the dated meetings the app keeps.
 */
export type MonthFigure = {
  /** Shown in the preview: the month as the source names it. */
  label: string;
  /** Which file it came from, when more than one was read. */
  source?: string;
  /** The sheet line it came from, or 0 when it did not come from a line. */
  line: number;
  meetingType: MeetingType;
  year: number;
  month: number;
  /** Meetings held, if the source says. */
  held: number | null;
  /** Total present, stated outright. */
  stated: number | null;
  inPerson: number | null;
  video: number | null;
  average: number | null;
  notes: string | null;
};

/** Shared state for spreading a batch of month figures. */
export type SpreadContext = {
  options: AttendanceParseOptions;
  today: Date;
  problems: { line: number; message: string }[];
  /** Meetings already spoken for, so a source that names one twice is reported. */
  claimed: Set<string>;
};

export function newSpreadContext(options: AttendanceParseOptions): SpreadContext {
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  return { options, today, problems: [], claimed: new Set() };
}

const whichOf = (t: MeetingType) => (t === "MIDWEEK" ? "midweek" : "weekend");
const dayKey = (d: Date, t: MeetingType) => `${d.toISOString().slice(0, 10)}|${t}`;

/** Only one figure can be kept per meeting, so a repeat would quietly lose one. */
function claimDates(ctx: SpreadContext, line: number, dates: Date[], meetingType: MeetingType) {
  const again = dates.filter((d) => ctx.claimed.has(dayKey(d, meetingType)));
  if (again.length) {
    ctx.problems.push({
      line,
      message: `${again.length === 1 ? dayLabel(again[0]) : `${again.length} of these dates`} already ${again.length === 1 ? "appears" : "appear"} as a ${whichOf(meetingType)} meeting; the last figure for it is the one recorded.`,
    });
  }
  for (const d of dates) ctx.claimed.add(dayKey(d, meetingType));
}

/**
 * Turns one month's figures into the dated meetings the app records. The
 * month's total comes out exactly as written, spread over the real meeting
 * days, and anything the source contradicts itself about is reported rather
 * than silently resolved.
 */
export function spreadMonth(figure: MonthFigure, ctx: SpreadContext): ParsedAttendance | null {
  const { options, today, problems } = ctx;
  const { line, label, meetingType, year, month, held, stated, average, notes, source } = figure;
  const hall = figure.inPerson;
  const online = figure.video;
  const which = whichOf(meetingType);
  const split = hall !== null || online !== null;
  const total = split
    ? (hall ?? 0) + (online ?? 0)
    : (stated ?? (average !== null && held ? Math.round(average * held) : null));

  if (!total) {
    if (average !== null) {
      problems.push({
        line,
        message: `${label}: a ${which} average of ${average} is given but no total and no number of meetings, so there is nothing to record. Add the meetings held or the total present.`,
      });
    }
    return null; // otherwise the source says nothing about this meeting in this month
  }
  if (held === 0) {
    problems.push({ line, message: `${label}: no ${which} meetings were held, so the ${total} present had nowhere to go. Left out.` });
    return null;
  }
  if (split && stated !== null && stated !== total) {
    problems.push({ line, message: `${label}: ${stated} ${which} in total but ${hall ?? 0} in the hall and ${online ?? 0} by video; ${total} was used.` });
  }

  const weekday = meetingType === "MIDWEEK" ? options.midweekDay : options.weekendDay;
  const scheduled = meetingDates(year, month, weekday, today);
  if (scheduled.length === 0) {
    problems.push({ line, message: `${label}: every ${WEEKDAY_NAMES[weekday]} of the month is still ahead, so there is nowhere to put the ${which} figures.` });
    return null;
  }

  let count = held ?? (average ? Math.max(1, Math.round(total / average)) : 0);
  if (!count) {
    // No meeting count and no average to work one out from: assume every
    // scheduled day that has already passed was kept.
    count = scheduled.length;
    problems.push({
      line,
      message: `${label}: no number of ${which} meetings held was given, so the ${total} present was spread evenly over the ${count} ${WEEKDAY_NAMES[weekday]}${count === 1 ? "" : "s"} up to today.`,
    });
  }

  const dates = meetingDays(year, month, weekday, count, today);
  if (dates.length < count) {
    problems.push({
      line,
      message: `${label}: ${count} ${which} meetings were given but the month has only ${dates.length} day${dates.length === 1 ? "" : "s"} left up to today. The ${total} present was spread over ${dates.length}.`,
    });
    count = dates.length;
  } else if (dates.length > scheduled.length) {
    const extra = dates.length - scheduled.length;
    problems.push({
      line,
      message: `${label}: ${count} ${which} meetings were held but the month has only ${scheduled.length} ${WEEKDAY_NAMES[weekday]}${scheduled.length === 1 ? "" : "s"} up to today, so the extra ${extra} ${extra === 1 ? "was" : "were"} put on the free day${extra === 1 ? "" : "s"} nearest them.`,
    });
  }
  if (average && Math.abs(Math.round(total / count) - average) > 1) {
    problems.push({ line, message: `${label}: the ${which} average is given as ${average}, but ${total} over ${count} meeting${count === 1 ? "" : "s"} gives ${Math.round(total / count)}. Check the figures.` });
  }

  const halls = share(split ? hall ?? 0 : total, count);
  const onlines = share(split ? online ?? 0 : 0, count);
  claimDates(ctx, line, dates, meetingType);

  return {
    line,
    kind: "month",
    meetingType,
    label,
    source,
    said: `${held ?? count} meeting${(held ?? count) === 1 ? "" : "s"}, ${total} present${average ? `, average ${average}` : ""}`,
    entries: dates.map((date, k) => ({ date, inPerson: halls[k], zoom: onlines[k], notes: k === 0 ? notes : null })),
  };
}

/** Spreads a batch of month figures, as read from a form, into dated meetings. */
export function spreadMonths(figures: MonthFigure[], options: AttendanceParseOptions): AttendanceParseResult {
  const ctx = newSpreadContext(options);
  const rows: ParsedAttendance[] = [];
  const months = new Map<string, { year: number; month: number }>();

  for (const f of figures) {
    const row = spreadMonth(f, ctx);
    if (!row) continue;
    rows.push(row);
    months.set(`${f.year}-${f.month}`, { year: f.year, month: f.month });
  }

  if (rows.length === 0 && ctx.problems.length === 0) {
    ctx.problems.push({ line: 0, message: "No attendance could be read." });
  }
  return { layout: rows.length ? "monthly" : null, rows, problems: ctx.problems, months: [...months.values()], spread: rows.length };
}

// -------------------------------------------------------------- parsing

export function parseAttendanceSheet(text: string, options: AttendanceParseOptions): AttendanceParseResult {
  const ctx = newSpreadContext(options);
  const problems = ctx.problems;
  const today = ctx.today;
  const empty = (layout: AttendanceLayout | null): AttendanceParseResult => ({ layout, rows: [], problems, months: [], spread: 0 });

  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const data = parsed.data.map((r) => r.map((c) => String(c ?? "")));
  if (data.length < 2) {
    problems.push({ line: 0, message: "Needs a header row and at least one record." });
    return empty(null);
  }

  const headers = data[0];
  const dateCol = findColumn(headers, DATE_HEADERS) ?? findColumn(headers, MONTH_HEADERS) ?? 0;
  const typeCol = findColumn(headers, TYPE_HEADERS);
  const notesCol = findColumn(headers, NOTES_HEADERS);

  const columns: Column[] = [];
  headers.forEach((header, index) => {
    if (index === dateCol || index === typeCol || index === notesCol) return;
    const measure = measureOf(header);
    if (measure) columns.push({ index, measure, meetingType: meetingTypeOf(header) });
  });
  if (columns.length === 0) {
    problems.push({
      line: 1,
      message:
        "No attendance columns were recognised. The sheet needs a date or month column and any of: meetings held, total attendance, average, in person, video.",
    });
    return empty(null);
  }

  const get = (row: string[], col: number | undefined) => (col === undefined ? "" : (row[col] ?? "").trim());

  /** A figure from the column for this meeting, or the untagged one if there is no tagged column. */
  const figure = (row: string[], line: number, label: string, meetingType: MeetingType, measure: Measure): number | null => {
    const col =
      columns.find((c) => c.measure === measure && c.meetingType === meetingType) ??
      columns.find((c) => c.measure === measure && c.meetingType === null);
    if (!col) return null;
    const cell = get(row, col.index);
    if (!cell) return null;
    const n = toCount(cell);
    if (n === null) problems.push({ line, message: `${label}: "${cell}" is not a whole number of people, so it was read as blank.` });
    return n;
  };

  // Which meetings a row is about: its Meeting column, else every meeting the
  // headings name, else the form's default.
  const tagged = [...new Set(columns.map((c) => c.meetingType).filter((t): t is MeetingType => t !== null))];
  const typesFor = (row: string[]): MeetingType[] => {
    const said = meetingTypeOf(get(row, typeCol));
    if (said) return [said];
    return tagged.length ? tagged : [options.defaultType];
  };

  const rows: ParsedAttendance[] = [];
  const months = new Map<string, { year: number; month: number }>();
  let meetingRows = 0;
  let monthRows = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const line = i + 1;
    const raw = get(row, dateCol);
    if (!raw) continue;
    // The footing of an S-88: a service year total or average, not a month.
    if (/^(total|average|avg|serviceyear|yearly|grand)/i.test(raw)) continue;
    const notes = get(row, notesCol) || null;

    const day = parseMeetingDate(raw);
    if (day) {
      if (day > today) {
        problems.push({ line, message: `${dayLabel(day)} is in the future. Left out.` });
        continue;
      }
      for (const meetingType of typesFor(row)) {
        const hall = figure(row, line, dayLabel(day), meetingType, "inPerson");
        const online = figure(row, line, dayLabel(day), meetingType, "video");
        const stated = figure(row, line, dayLabel(day), meetingType, "total");
        const split = hall !== null || online !== null;
        const sum = split ? (hall ?? 0) + (online ?? 0) : stated;
        if (!sum) continue; // nothing said about this meeting on this row
        if (split && stated !== null && stated !== sum) {
          problems.push({ line, message: `${dayLabel(day)}: the row says ${stated} in total but ${hall ?? 0} in the hall and ${online ?? 0} by video; ${sum} was used.` });
        }
        meetingRows++;
        claimDates(ctx, line, [day], meetingType);
        rows.push({
          line,
          kind: "meeting",
          meetingType,
          label: dayLabel(day),
          said: split ? `${hall ?? 0} in the hall, ${online ?? 0} by video` : `${sum} present`,
          entries: [{ date: day, inPerson: split ? hall ?? 0 : sum!, zoom: split ? online ?? 0 : 0, notes }],
        });
        months.set(`${day.getUTCFullYear()}-${day.getUTCMonth() + 1}`, { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1 });
      }
      continue;
    }

    const label = parseMonthLabel(raw);
    if (!label) {
      problems.push({ line, message: `Could not read "${raw}" as a date or a month. Left out.` });
      continue;
    }
    const year = label.year ?? calendarYearOf(options.serviceYear, label.month);
    if (year < 1990 || year > 2100) {
      problems.push({ line, message: `The year in "${raw}" does not look right. Left out.` });
      continue;
    }
    const monthName = `${MONTH_NAMES[label.month - 1]} ${year}`;

    for (const meetingType of typesFor(row)) {
      const spread = spreadMonth(
        {
          label: monthName,
          line,
          meetingType,
          year,
          month: label.month,
          held: figure(row, line, monthName, meetingType, "meetings"),
          stated: figure(row, line, monthName, meetingType, "total"),
          inPerson: figure(row, line, monthName, meetingType, "inPerson"),
          video: figure(row, line, monthName, meetingType, "video"),
          average: figure(row, line, monthName, meetingType, "average"),
          notes,
        },
        ctx,
      );
      if (!spread) continue;
      monthRows++;
      rows.push(spread);
      months.set(`${year}-${label.month}`, { year, month: label.month });
    }
  }

  const layout: AttendanceLayout | null = meetingRows && monthRows ? "mixed" : meetingRows ? "list" : monthRows ? "monthly" : null;
  if (rows.length === 0 && problems.length === 0) {
    problems.push({ line: 0, message: "No attendance could be read from that sheet." });
  }
  return { layout, rows, problems, months: [...months.values()], spread: monthRows };
}
