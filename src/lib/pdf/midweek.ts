import { rgb } from "pdf-lib";
import type { MidweekSection } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { newDoc, rule, text, textRight, wrap, band, INK, SOFT, type Doc } from "@/lib/pdf/kit";
import {
  MINUTES_PER_S38, SECTION_LABELS, buildSchedule, meetingLength,
  type ScheduleLine, type SchedulePart, type ScheduleWeek,
} from "@/lib/school";

/**
 * The schedule the congregation is given, drawn the way their own schedules have
 * always looked: the congregation and the title across the top, the date and the
 * weekly Bible reading under that, then the clock and the programme down the
 * left with a coloured banner over each section, and the chairman, the prayers
 * and every part's names down the right against their role. One page per
 * meeting, so a whole workbook prints as a set the overseer can hand out.
 *
 * There is no fillable official form for this one — the layout is the
 * congregation's own — so it is always drawn here.
 */

export type ScheduleSheet = {
  /** The schedule's own name: `September–October 2026`. */
  period: string;
  week: ScheduleWeek;
  parts: SchedulePart[];
  startHour: number;
  startMinute: number;
};

type Columns = {
  timeX: number;
  partX: number;
  partW: number;
  /** Where the right-hand role labels end; the names start just after. */
  roleRight: number;
  nameX: number;
  nameW: number;
};

const FOOT = 56;
const CANCEL_WASH = rgb(1, 0.96, 0.93);

/** The three section banners, in the colours the congregation prints them. */
const BANNER: Record<MidweekSection, ReturnType<typeof rgb>> = {
  TREASURES: rgb(0.345, 0.349, 0.357),
  MINISTRY: rgb(0.788, 0.608, 0.0),
  LIVING: rgb(0.549, 0.012, 0.251),
};

export async function drawMidweekSchedule(sheets: ScheduleSheet[]): Promise<Uint8Array> {
  const doc = await newDoc("portrait");
  sheets.forEach((sheet, index) => {
    if (index > 0) doc.page = doc.pdf.addPage([doc.width, doc.height]);
    drawWeek(doc, sheet);
  });
  return doc.pdf.save();
}

function drawWeek(doc: Doc, sheet: ScheduleSheet) {
  const L = 40;
  const R = doc.width - 40;
  const week = sheet.week;

  const cols: Columns = {
    timeX: L,
    partX: L + 44,
    partW: 355 - (L + 44),
    roleRight: 446,
    nameX: 454,
    nameW: R - 454,
  };

  let head = drawHead(doc, sheet, L, R);
  let y = head.y;
  drawRole(doc, cols, head.headY, "Chairman:", week.chairman);

  if (week.cancelled) {
    band(doc, L, y - 16, R - L, 18, CANCEL_WASH);
    text(doc, "NO MEETING THIS WEEK", L + 8, y - 12, { size: 9.5, bold: true, color: INK });
    if (week.cancelledReason) {
      text(doc, week.cancelledReason, L + 140, y - 12, { size: 8.5, color: SOFT, maxWidth: R - L - 148 });
    }
    drawFoot(doc, sheet, L, R, y - 34);
    return;
  }

  const lines = buildSchedule(week, sheet.parts, sheet.startHour, sheet.startMinute);

  for (const line of lines) {
    const need = rowHeight(doc, line, cols);
    if (y - need < FOOT) {
      doc.page = doc.pdf.addPage([doc.width, doc.height]);
      head = drawHead(doc, sheet, L, R, true);
      y = head.y;
      drawRole(doc, cols, head.headY, "Chairman:", week.chairman);
    }
    drawRow(doc, line, cols, L, R, y);

    if (line.kind === "song" && line.which === "opening") {
      drawRole(doc, cols, y, "Prayer:", week.openingPrayer ?? (week.chairman ? "CHAIRMAN" : null));
    }
    if (line.kind === "song" && line.which === "closing") {
      drawRole(doc, cols, y, "Prayer:", week.closingPrayer);
    }

    y -= need;
  }

  drawFoot(doc, sheet, L, R, y - 6);
}

/** One right-hand row: the role label, right-aligned, and the name beside it. */
function drawRole(doc: Doc, cols: Columns, y: number, label: string, name: string | null) {
  textRight(doc, label, cols.roleRight, y, { size: 8.5, bold: true });
  if (!name) return;
  let at = y;
  for (const piece of nameLines(doc, name, cols.nameW)) {
    text(doc, piece, cols.nameX, at, { size: 9 });
    at -= 12;
  }
}

/**
 * The congregation prints names in capitals and breaks a pair between the two
 * people, keeping the slash at the end of the line it belongs to — never inside
 * a name. A single name too long for the column falls back to word wrapping.
 */
function nameLines(doc: Doc, people: string, maxW: number): string[] {
  const units = people
    .toUpperCase()
    .split("/")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece, index, all) => (index < all.length - 1 ? `${piece} /` : piece));

  const out: string[] = [];
  let line = "";
  for (const unit of units) {
    const next = line ? `${line} ${unit}` : unit;
    if (doc.regular.widthOfTextAtSize(next, 9) > maxW && line) {
      out.push(line);
      line = unit;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out.flatMap((piece) =>
    doc.regular.widthOfTextAtSize(piece, 9) > maxW ? wrap(doc.regular, piece, 9, maxW) : [piece],
  );
}

/**
 * The congregation and the title across the top, the rule under them, and the
 * meeting date with the weekly Bible reading — the heading every week carries.
 */
function drawHead(
  doc: Doc,
  sheet: ScheduleSheet,
  L: number,
  R: number,
  continued = false,
): { y: number; headY: number } {
  const week = sheet.week;
  let y = doc.height - 46;

  text(doc, "MAITAMA", L, y, { size: 11, bold: true });
  textRight(doc, "Midweek Meeting Schedule", R, y - 2, { size: 17, bold: true });
  y -= 10;
  rule(doc, L, R, y, 1, INK);
  y -= 20;

  const date = week.date
    .toLocaleDateString("en-GB", { month: "long", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
  const heading = week.bibleReading
    ? `${date} | WEEKLY BIBLE READING- ${week.bibleReading.toUpperCase()}`
    : date;
  text(doc, continued ? `${heading} (CONTINUED)` : heading, L, y, { size: 11, bold: true, maxWidth: R - L });
  const headY = y;
  y -= 8;
  rule(doc, L, R, y, 0.5);
  return { y: y - 16, headY };
}

function rowHeight(doc: Doc, line: ScheduleLine, cols: Columns): number {
  if (line.kind === "heading") return 20;
  if (line.kind === "comments") return line.which === "concluding" ? 22 : 14;
  if (line.kind === "song") return 14;

  const title = `${line.position}. ${line.title}${line.minutes === null ? "" : ` (${line.minutes} min.)`}`;
  const left =
    wrap(doc.regular, title, 9, cols.partW).length * 12 +
    (line.detail ? wrap(doc.regular, line.detail, 7.5, cols.partW).length * 10 : 0);
  const right = line.names ? nameLines(doc, line.names.people, cols.nameW).length * 12 : 0;
  return Math.max(left, right) + 8;
}

function drawRow(doc: Doc, line: ScheduleLine, cols: Columns, L: number, R: number, y: number): void {
  if (line.kind === "heading") {
    band(doc, L, y - 4, cols.partX + cols.partW - L, 14, BANNER[line.section]);
    text(doc, SECTION_LABELS[line.section], L + 6, y, { size: 8.5, bold: true, color: rgb(1, 1, 1) });
    return;
  }

  if (line.kind === "song") {
    text(doc, line.time, cols.timeX, y, { size: 9 });
    text(doc, `•  Song ${line.number ?? "—"}`, cols.partX, y, { size: 9 });
    return;
  }

  if (line.kind === "comments") {
    text(doc, line.time, cols.timeX, y, { size: 9 });
    const label = line.which === "opening" ? "Opening Comments" : "•  Concluding Comments";
    text(doc, `${label}  (${line.minutes} min.)`, cols.partX, y, { size: 9 });
    return;
  }

  text(doc, line.time, cols.timeX, y, { size: 9 });
  let at = y;
  const title = `${line.position}. ${line.title}${line.minutes === null ? "" : ` (${line.minutes} min.)`}`;
  for (const piece of wrap(doc.regular, title, 9, cols.partW)) {
    text(doc, piece, cols.partX, at, { size: 9 });
    at -= 12;
  }
  if (line.detail) {
    for (const piece of wrap(doc.regular, line.detail, 7.5, cols.partW)) {
      text(doc, piece, cols.partX, at, { size: 7.5, color: SOFT });
      at -= 10;
    }
  }

  if (line.names) {
    if (line.names.role) {
      textRight(doc, `${line.names.role}:`, cols.roleRight, y, { size: 8.5, bold: true });
    }
    let ny = y;
    for (const piece of nameLines(doc, line.names.people, cols.nameW)) {
      text(doc, piece, cols.nameX, ny, { size: 9 });
      ny -= 12;
    }
  }
}

function drawFoot(doc: Doc, sheet: ScheduleSheet, L: number, R: number, y: number) {
  rule(doc, L, R, y + 10, 0.7, INK);
  let at = y;

  if (!sheet.week.cancelled) {
    const length = meetingLength(sheet.parts);
    if (length !== MINUTES_PER_S38) {
      const runs = `${Math.floor(length / 60)}h ${String(length % 60).padStart(2, "0")}m`;
      text(
        doc,
        `The parts as they stand run ${runs}, not the ${Math.floor(MINUTES_PER_S38 / 60)}h ${MINUTES_PER_S38 % 60}m the meeting should run.`,
        L, at,
        { size: 8, color: INK, maxWidth: R - L },
      );
      at -= 12;
    }
  }

  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, at, {
    size: 7.5, color: SOFT,
  });
}
