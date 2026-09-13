import { PDFDocument } from "pdf-lib";
import { collectWidgets } from "./pdf/fields";
import { monthOfRow, s88Blocks, type MeetingHalf } from "./pdf/s88-layout";
import { MONTH_NAMES, calendarYearOf, serviceYearLabel } from "./service-year";
import type { MeetingType, MonthFigure } from "./import-attendance";

/**
 * Reads the congregation's own filled-in S-88, the Congregation Meeting
 * Attendance Record, so the years kept on paper before this system can be
 * brought across.
 *
 * The form holds two service years for each meeting: the midweek meeting
 * across the top, the weekend meeting below, and within each half the earlier
 * year on the left and the later one on the right. Every block is twelve rows,
 * September first, giving the meetings held, the total attendance and the
 * average. The app keeps attendance per meeting rather than per month, so what
 * comes out here is the same month-level shape a spreadsheet gives, ready to
 * be spread over the days the congregation actually met.
 */

export type S88BlockSummary = {
  /** 1..4 as the official form numbers them; 0 when the boxes were found by position. */
  number: number;
  half: MeetingHalf;
  serviceYear: number;
  /** Whether the year was written on the form or assumed from the one chosen here. */
  yearFromForm: boolean;
  /** How many of the twelve months had anything in them. */
  months: number;
  /** Total present across those months. */
  total: number;
};

export type S88Read = {
  fileName: string;
  blocks: S88BlockSummary[];
  figures: MonthFigure[];
  problems: string[];
};

/** A count of people or meetings from a form box: "488", "1,234", "122.00", "—". */
function count(raw: string | undefined, decimals = false): number | null {
  const v = (raw ?? "").replace(/[,\s]/g, "");
  if (!v || /^[-–—]$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return decimals ? Math.round(n * 10) / 10 : Math.round(n);
}

const empty = (fileName: string, problems: string[]): S88Read => ({ fileName, blocks: [], figures: [], problems });

/**
 * @param fallbackYear The later of the two service years, as chosen on the
 * form. Used only for a block whose own service-year box was left blank.
 */
export async function readS88(bytes: Uint8Array | Buffer, fileName: string, fallbackYear: number): Promise<S88Read> {
  const problems: string[] = [];
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return empty(fileName, ["That is not a PDF the reader could open."]);
  }

  let blocks: ReturnType<typeof s88Blocks>;
  try {
    blocks = s88Blocks(collectWidgets(pdf));
  } catch {
    return empty(fileName, ["The attendance boxes in that PDF could not be read."]);
  }
  if (blocks.length === 0) {
    return empty(fileName, [
      "No attendance boxes were found in it. The S-88 has to be the fillable form, saved with its boxes filled in — a scanned or printed copy has no fields left to read. Type the months into a spreadsheet and use the sheet instead.",
    ]);
  }

  const figures: MonthFigure[] = [];
  const found: S88BlockSummary[] = [];

  for (const block of blocks) {
    const half = block.half;
    const meetingType: MeetingType = half === "midweek" ? "MIDWEEK" : "WEEKEND";
    const written = count(block.yearBox?.text);
    const yearFromForm = written !== null && written > 1990 && written < 2100;
    const serviceYear = yearFromForm ? written! : [fallbackYear - 1, fallbackYear][block.yearSlot] ?? fallbackYear;
    const which = `${serviceYearLabel(serviceYear)} ${half}`;

    if (!yearFromForm) {
      problems.push(`${which} block: no service year is written on the form, so ${serviceYearLabel(serviceYear)} was assumed.`);
    }

    let months = 0;
    let total = 0;
    block.cells.forEach((cell, i) => {
      const month = monthOfRow(i + 1);
      if (!month) return;
      const held = count(cell.meetings?.text);
      const stated = count(cell.attendance?.text);
      const average = count(cell.average?.text, true);
      if (held === null && stated === null && average === null) return;

      months++;
      total += stated ?? 0;
      const year = calendarYearOf(serviceYear, month);
      figures.push({
        label: `${MONTH_NAMES[month - 1]} ${year}`,
        source: fileName,
        line: 0,
        meetingType,
        year,
        month,
        held,
        stated,
        // An S-88 keeps one attendance figure and does not split it between
        // the hall and video, so the whole count is recorded as present.
        inPerson: null,
        video: null,
        average,
        notes: null,
      });
    });

    if (months === 0) problems.push(`${which} block: nothing is filled in for any of its twelve months.`);
    found.push({ number: block.number, half, serviceYear, yearFromForm, months, total });
  }

  if (figures.length === 0) {
    return { fileName, blocks: found, figures: [], problems: [...problems, "Nothing was filled in anywhere on the form."] };
  }
  return { fileName, blocks: found, figures, problems };
}
