import { rgb } from "pdf-lib";
import { formatDate } from "@/lib/format";
import { newDoc, rule, text, textRight, wrap, band, INK, SOFT, PINE, type Doc } from "@/lib/pdf/kit";
import {
  MINUTES_PER_S38, SECTION_LABELS, buildSchedule, formatWeekOf, meetingLength,
  type ScheduleLine, type SchedulePart, type ScheduleWeek,
} from "@/lib/school";

/**
 * The schedule the congregation is given, drawn to the S-140's shape: the clock
 * down the left, the part and what the workbook says about it in the middle, and
 * who handles it in each hall on the right. One page per meeting, so a whole
 * workbook prints as a set the overseer can hand out week by week.
 *
 * There is no fillable official form for this one — the S-140 is a layout the
 * congregation reproduces — so it is always drawn here.
 */

export type ScheduleSheet = {
  /** The schedule's own name, printed under the title: `September–October 2026`. */
  period: string;
  week: ScheduleWeek;
  parts: SchedulePart[];
  startHour: number;
  startMinute: number;
};

type Columns = {
  partX: number;
  partW: number;
  mainX: number;
  mainW: number;
  auxX: number;
  auxW: number;
};

const FOOT = 62;
/** The wash a section banner sits on, and the one a week with no meeting sits on. */
const SECTION_WASH = rgb(0.93, 0.96, 0.94);
const CANCEL_WASH = rgb(1, 0.96, 0.93);

export async function drawMidweekSchedule(sheets: ScheduleSheet[]): Promise<Uint8Array> {
  const doc = await newDoc("portrait");
  sheets.forEach((sheet, index) => {
    if (index > 0) doc.page = doc.pdf.addPage([doc.width, doc.height]);
    drawWeek(doc, sheet);
  });
  return doc.pdf.save();
}

function drawWeek(doc: Doc, sheet: ScheduleSheet) {
  const L = 42;
  const R = doc.width - 42;
  const W = R - L;
  const week = sheet.week;

  // The auxiliary classroom column only earns its width when a part is actually
  // handled twice, which a circuit overseer's week is not.
  const dual = sheet.parts.some((p) => p.dualHall);
  const cols: Columns = dual
    ? { partX: L + 46, partW: 240, mainX: 336, mainW: 104, auxX: 448, auxW: R - 448 }
    : { partX: L + 46, partW: 300, mainX: 396, mainW: R - 396, auxX: 0, auxW: 0 };

  let y = drawTitle(doc, sheet, L, R, W);

  text(doc, formatWeekOf(week.date), L, y, { size: 11.5, bold: true });
  const officers = [
    week.chairman ? `Chairman: ${week.chairman}` : "Chairman: to be assigned",
    week.counselor ? `Counselor: ${week.counselor}` : null,
  ].filter(Boolean).join("   ·   ");
  textRight(doc, officers, R, y + 1, { size: 8.5, color: SOFT });
  y -= 13;

  if (week.bibleReading) {
    text(doc, `Weekly Bible Reading: ${week.bibleReading}`, L, y, { size: 8.5, color: PINE, bold: true });
    y -= 11;
  }
  if (week.note) {
    text(doc, week.note, L, y, { size: 8.5, color: SOFT, maxWidth: W });
    y -= 11;
  }

  if (week.cancelled) {
    band(doc, L, y - 16, W, 18, CANCEL_WASH);
    text(doc, "NO MEETING THIS WEEK", L + 8, y - 12, { size: 9, bold: true, color: INK });
    if (week.cancelledReason) {
      text(doc, week.cancelledReason, L + 128, y - 12, { size: 8.5, color: SOFT, maxWidth: W - 136 });
    }
    y -= 30;
    drawFoot(doc, sheet, L, R, W, y);
    return;
  }

  y -= 6;
  rule(doc, L, R, y, 0.7, INK);
  y -= 4;
  y = drawColumns(doc, L, R, W, cols, dual, y);

  const lines = buildSchedule(week, sheet.parts, sheet.startHour, sheet.startMinute);

  for (const line of lines) {
    const need = rowHeight(doc, line, cols);
    if (y - need < FOOT) {
      doc.page = doc.pdf.addPage([doc.width, doc.height]);
      y = drawTitle(doc, sheet, L, R, W, true);
      rule(doc, L, R, y, 0.7, INK);
      y -= 4;
      y = drawColumns(doc, L, R, W, cols, dual, y);
    }
    drawRow(doc, line, cols, L, R, y);
    y -= need;
  }

  drawFoot(doc, sheet, L, R, W, y - 8);
}

function drawTitle(doc: Doc, sheet: ScheduleSheet, L: number, R: number, W: number, continued = false): number {
  let y = doc.height - 52;
  textRight(doc, "OUR CHRISTIAN LIFE AND MINISTRY—MEETING WORKBOOK", R, y + 4, { size: 7, color: SOFT });
  text(doc, continued ? "Life and Ministry Meeting Schedule (continued)" : "Life and Ministry Meeting Schedule", L, y, {
    size: 15, bold: true, maxWidth: W,
  });
  y -= 14;
  text(doc, `Maitama Congregation  ·  ${sheet.period}`, L, y, { size: 8.5, color: SOFT });
  y -= 14;
  return y;
}

function drawColumns(doc: Doc, L: number, R: number, W: number, cols: Columns, dual: boolean, y: number): number {
  band(doc, L, y - 3, W, 12);
  text(doc, "TIME", L, y, { size: 7, bold: true, color: SOFT });
  text(doc, "PART AND DESCRIPTION", cols.partX, y, { size: 7, bold: true, color: SOFT });
  text(doc, "MAIN HALL", cols.mainX, y, { size: 7, bold: true, color: SOFT });
  if (dual) text(doc, "AUXILIARY CLASSROOM", cols.auxX, y, { size: 7, bold: true, color: SOFT });
  return y - 16;
}

function rowHeight(doc: Doc, line: ScheduleLine, cols: Columns): number {
  if (line.kind === "heading") return 20 + (line.columnHeaders ? 14 : 0);
  if (line.kind === "comments") return 14;
  if (line.kind === "song") {
    const prayer = line.prayer && cols.mainW > 0
      ? wrap(doc.regular, line.prayer, 8, cols.mainW).length * 10
      : 0;
    return Math.max(14, prayer + 4);
  }

  const title = `${line.title}${line.minutes === null ? "" : ` (${line.minutes} min.)`}`;
  const block = wrap(doc.regular, title, 8.5, cols.partW).length * 10 +
    (line.detail ? wrap(doc.regular, line.detail, 7, cols.partW).length * 9 : 0);

  let names = 0;
  for (const who of line.names) {
    const w = who.hall === "AUXILIARY" ? cols.auxW : cols.mainW;
    if (w <= 0) continue;
    names = Math.max(names, wrap(doc.regular, who.label, 8, w).length * 10);
  }

  return Math.max(block, names) + 12;
}

function drawRow(doc: Doc, line: ScheduleLine, cols: Columns, L: number, R: number, start: number): void {
  let y = start;

  if (line.kind === "heading") {
    band(doc, L, y - 4, R - L, 15, SECTION_WASH);
    text(doc, SECTION_LABELS[line.section], L + 6, y, { size: 8, bold: true, color: PINE });
    if (line.columnHeaders) {
      y -= 20;
      text(doc, "MAIN HALL", cols.mainX, y, { size: 6.5, bold: true, color: SOFT });
      if (cols.auxW > 0) text(doc, "AUXILIARY CLASSROOM", cols.auxX, y, { size: 6.5, bold: true, color: SOFT });
    }
    return;
  }

  if (line.kind === "song" || line.kind === "comments") {
    const label =
      line.kind === "song"
        ? `Song ${line.number ?? "—"} and Prayer`
        : `${line.which === "opening" ? "Opening" : "Concluding"} Comments (${line.minutes} min.)`;
    text(doc, line.time, L, y, { size: 8.5, color: SOFT });
    text(doc, label, cols.partX, y, { size: 8.5, bold: true, maxWidth: cols.partW });
    if (line.kind === "song" && line.prayer && cols.mainW > 0) {
      let ny = y;
      for (const piece of wrap(doc.regular, line.prayer, 8, cols.mainW)) {
        text(doc, piece, cols.mainX, ny, { size: 8 });
        ny -= 10;
      }
    }
    return;
  }

  text(doc, line.time, L, y, { size: 8.5, color: SOFT });
  const top = y;
  const title = `${line.title}${line.minutes === null ? "" : ` (${line.minutes} min.)`}`;
  for (const piece of wrap(doc.regular, title, 8.5, cols.partW)) {
    text(doc, piece, cols.partX, y, { size: 8.5, bold: true });
    y -= 10;
  }
  if (line.detail) {
    for (const piece of wrap(doc.regular, line.detail, 7, cols.partW)) {
      text(doc, piece, cols.partX, y, { size: 7, color: SOFT });
      y -= 9;
    }
  }

  for (const who of line.names) {
    const x = who.hall === "AUXILIARY" ? cols.auxX : cols.mainX;
    const w = who.hall === "AUXILIARY" ? cols.auxW : cols.mainW;
    if (w <= 0) continue;
    let ny = top;
    for (const piece of wrap(doc.regular, who.label, 8, w)) {
      text(doc, piece, x, ny, { size: 8 });
      ny -= 10;
    }
    y = Math.min(y, ny);
  }

  y -= 6;
  rule(doc, L, R, y, 0.3);
}

function drawFoot(doc: Doc, sheet: ScheduleSheet, L: number, R: number, W: number, y: number) {
  rule(doc, L, R, y + 10, 0.7, INK);
  let at = y;

  if (!sheet.week.cancelled) {
    const length = meetingLength(sheet.parts);
    const runs = `${Math.floor(length / 60)}h ${String(length % 60).padStart(2, "0")}m`;
    text(
      doc,
      length === MINUTES_PER_S38
        ? `The meeting runs ${runs}, as S-38 par. 20 has it.`
        : `The parts as they stand run ${runs}, not the ${Math.floor(MINUTES_PER_S38 / 60)}h ${MINUTES_PER_S38 % 60}m of S-38 par. 20.`,
      L, at,
      { size: 8, color: length === MINUTES_PER_S38 ? SOFT : INK, maxWidth: W },
    );
    at -= 12;
  }

  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, at, {
    size: 7.5, color: SOFT,
  });
}
