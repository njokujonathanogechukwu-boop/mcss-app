import { pageRows, pagesOf, type Widget } from "./fields";

/**
 * Where the S-88 keeps its figures. The form is four blocks of twelve month
 * rows: the midweek meeting across the top, the weekend meeting below, and
 * within each half the earlier of the two service years on the left and the
 * later one on the right. Rows run September to August.
 *
 * The official form names every box by block (`1-Meeting_1` … `4-Average_Total`,
 * month 1 = September). Editions that do not are found by position instead:
 * runs of twelve rows holding the same number of text boxes, three to a
 * service year. Both the filler and the importer work from this, so a record
 * read off a form lands in the same boxes it is written back to.
 */

export type MeetingHalf = "midweek" | "weekend";

export type S88Cells = { meetings?: Widget; attendance?: Widget; average?: Widget };

export type S88Block = {
  half: MeetingHalf;
  /** 0 = the earlier service year on the form, 1 = the later one. */
  yearSlot: number;
  /** 1..4 as the official form numbers them, or 0 when found by position. */
  number: number;
  /** The box the service year itself is written in. */
  yearBox?: Widget;
  /** "Average attendance each month", the block's footing. */
  averageEachMonth?: Widget;
  /** Twelve months, September first. */
  cells: S88Cells[];
};

/** The calendar month a form row falls in: row 1 is September, row 12 August. */
export function monthOfRow(row: number): number | null {
  return row >= 1 && row <= 12 ? ((row + 7) % 12) + 1 : null;
}

const CELL = /^([1-4])-(Meeting|Attendance|Average)_(\d{1,2})$/i;
const FOOTING = /^([1-4])-Average_Total$/i;
const YEAR_BOX = /^Service\s*Year_([1-4])$/i;

const blank = (): S88Cells[] => Array.from({ length: 12 }, () => ({}));

function namedBlocks(widgets: Widget[]): S88Block[] {
  const found = new Map<number, S88Block>();
  const block = (q: number) => {
    let b = found.get(q);
    if (!b) {
      b = { half: q <= 2 ? "midweek" : "weekend", yearSlot: q === 1 || q === 3 ? 0 : 1, number: q, cells: blank() };
      found.set(q, b);
    }
    return b;
  };

  for (const w of widgets) {
    if (w.kind !== "text") continue;
    const year = w.name.match(YEAR_BOX);
    if (year) {
      block(Number(year[1])).yearBox = w;
      continue;
    }
    const footing = w.name.match(FOOTING);
    if (footing) {
      block(Number(footing[1])).averageEachMonth = w;
      continue;
    }
    const cell = w.name.match(CELL);
    if (!cell) continue;
    const month = monthOfRow(Number(cell[3]));
    if (!month) continue;
    const q = Number(cell[1]);
    const key = cell[2].toLowerCase();
    const b = block(q);
    if (key === "meeting") b.cells[month - 1].meetings = w;
    else if (key === "attendance") b.cells[month - 1].attendance = w;
    else b.cells[month - 1].average = w;
  }

  return [1, 2, 3, 4]
    .map((q) => found.get(q))
    .filter((b): b is S88Block => Boolean(b) && b!.cells.some((c) => c.meetings || c.attendance));
}

/**
 * An unnamed edition: the top half of the page is the midweek meeting and the
 * bottom half the weekend one, and a row wide enough for six boxes carries two
 * service years side by side.
 */
function positionedBlocks(widgets: Widget[]): S88Block[] {
  const runs: { page: number; rows: Widget[][] }[] = [];
  for (const page of pagesOf(widgets)) {
    const rows = pageRows(widgets, page)
      .map((r) => r.filter((w) => w.kind === "text"))
      .filter((r) => r.length >= 3 && r.length % 3 === 0);
    for (let i = 0; i + 12 <= rows.length; ) {
      const run = rows.slice(i, i + 12);
      if (run.every((r) => r.length === rows[i].length)) {
        runs.push({ page, rows: run });
        i += 12;
      } else {
        i++;
      }
    }
  }
  if (runs.length === 0) return [];

  const slots: { run: number; yearInRun: number }[] = [];
  runs.forEach((run, r) => {
    const yearsInRow = run.rows[0].length / 3;
    for (let y = 0; y < yearsInRow; y++) slots.push({ run: r, yearInRun: y });
  });

  const midweekCount = Math.ceil(slots.length / 2);
  return slots.map((slot, i) => {
    const run = runs[slot.run];
    const perRow = run.rows[0].length / 3;
    const top = Math.max(...run.rows[0].map((w) => w.y));
    const above = widgets
      .filter((w) => w.kind === "text" && w.page === run.page && w.y - w.h >= top && w.y < top + 80 && w.w < 120)
      .sort((a, b) => a.x - b.x);
    return {
      half: i < midweekCount ? ("midweek" as const) : ("weekend" as const),
      yearSlot: i < midweekCount ? i : i - midweekCount,
      number: 0,
      yearBox: above[slot.yearInRun],
      cells: run.rows.map((row) => {
        const boxes = row.slice(slot.yearInRun * perRow, slot.yearInRun * perRow + 3);
        return { meetings: boxes[0], attendance: boxes[1], average: boxes[2] };
      }),
    };
  });
}

/** The four blocks of an S-88, midweek before weekend and earlier year first. */
export function s88Blocks(widgets: Widget[]): S88Block[] {
  const named = namedBlocks(widgets);
  return named.length ? named : positionedBlocks(widgets);
}
