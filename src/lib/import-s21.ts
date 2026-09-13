import { PDFDocument } from "pdf-lib";
import { collectWidgets, groupRows, type Widget } from "@/lib/pdf/fields";
import { readPdfPages, words, isBoxGlyph, type PdfPage, type Word } from "@/lib/pdf/text";
import { MONTH_NAMES } from "@/lib/service-year";

/**
 * Reads a filled-in S-21 (Congregation's Publisher Record) PDF.
 *
 * The official form is a fillable PDF. Its field names have changed
 * between editions, so this reader relies on where the fields sit on the
 * page rather than what they are called: the bio-data lines at the top,
 * then a table of twelve month rows, each with a Shared checkbox, a
 * Studies box, an Auxiliary Pioneer checkbox, an Hours box and Remarks.
 * Field names are still used as a hint for the header fields when they
 * are descriptive.
 */

export type S21Month = {
  year: number;
  month: number;
  shared: boolean;
  studies: number;
  hours: number | null;
  aux: boolean;
  remarks: string | null;
};

export type S21Card = {
  fileName: string;
  name: string | null;
  dateOfBirth: string | null;
  baptismDate: string | null;
  gender: "MALE" | "FEMALE" | null;
  anointed: boolean;
  appointment: "PUBLISHER" | "MINISTERIAL_SERVANT" | "ELDER";
  pioneerStatus: "NONE" | "REGULAR" | "SPECIAL";
  serviceYears: number[];
  months: S21Month[];
  problems: string[];
  /** The card is a picture: nothing on it can be read as text. */
  scanned?: boolean;
};

const SEP_FIRST = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

export async function readS21(buffer: Buffer, fileName: string, fallbackYear?: number): Promise<S21Card> {
  const card: S21Card = {
    fileName,
    name: null,
    dateOfBirth: null,
    baptismDate: null,
    gender: null,
    anointed: false,
    appointment: "PUBLISHER",
    pioneerStatus: "NONE",
    serviceYears: [],
    months: [],
    problems: [],
  };

  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    card.problems.push("Not a readable PDF.");
    return card;
  }

  const pages = await readPdfPages(buffer);
  if (pages.some((p) => p.images > 0 && p.items.length === 0)) {
    card.scanned = true;
    card.problems.push("This card is a scanned picture, so there is no text on it to read. Type what is on the card into the grid instead.");
    return card;
  }

  const widgets = collectWidgets(pdf);
  if (!widgets.some((w) => w.text !== "" || w.checked)) {
    // Flattened or printed: the figures are on the page, not in the fields.
    readPrintedS21(card, pages, fallbackYear);
    if (!card.name) card.problems.push("No name found on the card.");
    if (card.months.length === 0 && card.problems.length === 0) {
      card.problems.push("No month rows with anything filled in were found.");
    }
    return card;
  }

  // ------------------------------------------------ header fields by name
  const lower = (s: string) => s.toLowerCase();
  const byName = (re: RegExp, kind: Widget["kind"]) => widgets.find((w) => w.kind === kind && re.test(lower(w.name)));

  const nameF = byName(/name/, "text");
  const dobF = byName(/birth|dob/, "text");
  const bapF = byName(/bapt/, "text");
  const maleF = byName(/^(?!.*fe)male|\bmale\b/, "check");
  const femaleF = byName(/female/, "check");
  const anointedF = byName(/anoint/, "check");
  const elderF = byName(/elder/, "check");
  const msF = byName(/minist/, "check");
  const rpF = byName(/regular/, "check");
  const spF = byName(/special/, "check");

  // ------------------------------------------------ header fields by position
  // Fallback when the names are opaque (e.g. "900_1_Text_C"): the three
  // text boxes highest on the first page are name, date of birth and date
  // of baptism, in that order. Above the month table the card has a pair
  // of boxes for Male / Female, a pair for Other sheep / Anointed, and a
  // row of five for Elder, MS, Regular pioneer, Special pioneer, FM. They
  // are picked out by the shape of each row, not its position.
  const page0Text = widgets.filter((w) => w.kind === "text" && w.page === 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const page0Checks = widgets.filter((w) => w.kind === "check" && w.page === 0);

  const headerText = page0Text.slice(0, 3);
  const headerRows = groupRows(page0Checks)
    .map((r) => r.slice().sort((a, b) => a.x - b.x));
  const pairs = headerRows.filter((r) => r.length === 2);
  const appointmentRow = headerRows.find((r) => r.length >= 4 && r.length <= 6);

  card.name = (nameF ?? headerText[0])?.text || null;
  card.dateOfBirth = (dobF ?? headerText[1])?.text || null;
  card.baptismDate = (bapF ?? headerText[2])?.text || null;

  const male = maleF ?? pairs[0]?.[0];
  const female = femaleF ?? pairs[0]?.[1];
  const anointed = anointedF ?? pairs[1]?.[1];
  const elder = elderF ?? appointmentRow?.[0];
  const ms = msF ?? appointmentRow?.[1];
  const rp = rpF ?? appointmentRow?.[2];
  const sp = spF ?? appointmentRow?.[3];

  card.gender = female?.checked ? "FEMALE" : male?.checked ? "MALE" : null;
  card.anointed = Boolean(anointed?.checked);
  card.appointment = elder?.checked ? "ELDER" : ms?.checked ? "MINISTERIAL_SERVANT" : "PUBLISHER";
  card.pioneerStatus = sp?.checked ? "SPECIAL" : rp?.checked ? "REGULAR" : "NONE";

  if (!card.name) card.problems.push("No name found on the card.");

  // ------------------------------------------------ month tables
  // A table is twelve consecutive rows that each hold two checkboxes and
  // at least two text boxes. The service year is the nearest text box
  // above the table whose value is a four-digit year.
  const byPage = new Map<number, Widget[]>();
  for (const w of widgets) byPage.set(w.page, [...(byPage.get(w.page) ?? []), w]);

  for (const [page, ws] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const rows = groupRows(ws).filter((r) => r.filter((w) => w.kind === "check").length >= 2 && r.filter((w) => w.kind === "text").length >= 2);
    // rows are top-to-bottom already; take runs of 12
    let i = 0;
    while (i + 12 <= rows.length) {
      const table = rows.slice(i, i + 12);
      const top = Math.max(...table[0].map((w) => w.y));
      const yearBox = ws
        .filter((w) => w.kind === "text" && w.y - w.h >= top && /^\s*(19|20)\d{2}\s*$/.test(w.text))
        .sort((a, b) => a.y - b.y)[0]; // nearest above
      let serviceYear = yearBox ? Number(yearBox.text.trim()) : null;
      if (!serviceYear && fallbackYear && card.serviceYears.length === 0) {
        serviceYear = fallbackYear;
        card.problems.push(`No service year box found on the card; the ${fallbackYear - 1}/${String(fallbackYear).slice(2)} year you chose was used.`);
      }
      if (!serviceYear) {
        card.problems.push(`A month table on page ${page + 1} has no service year filled in, so it was left out.`);
        i += 12;
        continue;
      }
      card.serviceYears.push(serviceYear);

      table.forEach((row, r) => {
        const sorted = row.slice().sort((a, b) => a.x - b.x);
        const checks = sorted.filter((w) => w.kind === "check");
        const texts = sorted.filter((w) => w.kind === "text");
        addMonth(card, serviceYear, r, {
          shared: checks[0]?.checked ?? false,
          aux: checks[1]?.checked ?? false,
          studiesRaw: texts[0]?.text ?? "",
          hoursRaw: texts[1]?.text ?? "",
          remarks: (texts[2]?.text ?? "").trim() || null,
        });
      });
      i += 12;
    }
  }

  if (card.months.length === 0 && card.problems.length === 0) {
    card.problems.push("No month rows with anything filled in were found.");
  }
  return card;
}

type RawMonth = { shared: boolean; aux: boolean; studiesRaw: string; hoursRaw: string; remarks: string | null };

function addMonth(card: S21Card, serviceYear: number, rowIndex: number, raw: RawMonth) {
  if (rowIndex < 0 || rowIndex >= 12) return;
  const month = SEP_FIRST[rowIndex];
  const year = month >= 9 ? serviceYear - 1 : serviceYear;
  const studies = toInt(raw.studiesRaw);
  const hours = toInt(raw.hoursRaw);

  const blank = !raw.shared && !raw.aux && !raw.studiesRaw && !raw.hoursRaw && !raw.remarks;
  if (blank) return;

  if (raw.studiesRaw && studies === null) card.problems.push(`${MONTH_NAMES[month - 1]} ${year}: studies "${raw.studiesRaw}" is not a number; recorded as 0.`);
  if (raw.hoursRaw && hours === null) card.problems.push(`${MONTH_NAMES[month - 1]} ${year}: hours "${raw.hoursRaw}" is not a number; left blank.`);

  card.months.push({
    year, month,
    shared: raw.shared || (studies ?? 0) > 0 || (hours ?? 0) > 0 || raw.aux,
    studies: studies ?? 0,
    hours,
    aux: raw.aux,
    remarks: raw.remarks,
  });
}

/**
 * A card whose fields were flattened away — printed, or saved to PDF after
 * being filled — keeps no values to read, only the page. The month table is
 * found from the rules drawn around it and every word is placed in the cell it
 * sits in: five vertical rules make six columns, twelve horizontal rules make
 * the rows, and a tick is the single glyph a viewer draws in a checked box.
 */
type Grid = {
  all: Word[];
  boxes: Word[];
  ticks: Word[];
  columnOf: (x: number) => number;
  bands: { top: number; bottom: number }[];
  tableTop: number;
};

function readPrintedS21(card: S21Card, pages: PdfPage[], fallbackYear?: number) {
  for (const [index, page] of pages.entries()) {
    const grid = printedGrid(page);
    if (!grid) continue;
    if (index === 0) readPrintedHeader(card, page, grid); // the bio-data lines are on the first page only
    readPrintedMonths(card, grid, fallbackYear);
  }
}

function printedGrid(page: PdfPage): Grid | null {
  const every = words(page.items);
  const all = every.filter((w) => !isBoxGlyph(w.text));
  const uprights = page.ink.filter((m) => m.h > 100 && m.w < 2);
  if (uprights.length < 5) return null;

  const tableTop = Math.max(...uprights.map((m) => m.y + m.h));
  const tableBottom = Math.min(...uprights.map((m) => m.y));
  const vRules = uprights.map((m) => m.x).sort((a, b) => a - b);
  const hRules = page.ink
    .filter((m) => m.w > 300 && m.h < 2 && m.y > tableBottom - 1 && m.y < tableTop + 1)
    .map((m) => m.y)
    .sort((a, b) => b - a);
  if (hRules.length < 12) return null;

  const cols = [0, ...vRules, Infinity];
  const columnOf = (x: number) => cols.findIndex((c, i) => x >= c && x < cols[i + 1]);

  // The month names printed down the first column anchor the rows: the rules
  // just above and just below a name are that row's edges. Without them the
  // rules are taken in order, which holds as long as nothing else is ruled.
  const names = all
    .filter((w) => w.y > tableBottom && w.y < tableTop && columnOf(w.x) === 0 && isMonthWord(w.text))
    .sort((a, b) => b.y - a.y);
  const bands =
    names.length === 12
      ? names.map((w) => ({
          // hRules runs downwards: the rule nearest above a name is the last
          // one at or above it, and the one nearest below is the first under it.
          top: hRules.filter((y) => y >= w.y).pop() ?? tableTop,
          bottom: hRules.find((y) => y < w.y - 2) ?? tableBottom,
        }))
      : hRules.slice(0, 12).map((top, i) => ({ top, bottom: hRules[i + 1] ?? tableBottom }));

  return {
    all,
    boxes: every.filter((w) => isBoxGlyph(w.text)),
    ticks: all.filter((w) => w.text.length === 1),
    columnOf,
    bands,
    tableTop,
  };
}

function readPrintedHeader(card: S21Card, page: PdfPage, grid: Grid) {
  const { all, boxes, ticks } = grid;

  // A bio-data line runs on into the tick-box columns beside it, so a value
  // stops at the first box drawn on its line.
  const stops = [
    ...boxes.map((b) => ({ x: b.x, y: b.y })),
    ...page.ink.filter((m) => m.w >= 4 && m.w <= 20 && m.h >= 4 && m.h <= 20).map((m) => ({ x: m.x, y: m.y + m.h / 2 })),
  ];
  const lineValue = (labelRe: RegExp, from: number) => {
    const label = all.find((w) => labelRe.test(w.text));
    if (!label) return null;
    const limit = Math.min(page.width, ...stops.filter((s) => Math.abs(s.y - label.y) <= 6).map((s) => s.x));
    const value = all
      .filter((w) => w !== label && Math.abs(w.y - label.y) <= 3 && w.x >= label.x + from && w.x < limit)
      .sort((a, b) => a.x - b.x)
      .map((w) => w.text);
    return value.join(" ") || null;
  };
  card.name = lineValue(/^Name:?$/i, 20);
  card.dateOfBirth = lineValue(/birth/i, 40);
  card.baptismDate = lineValue(/baptism/i, 40);

  // A tick sits just left of, and a little above, the word it ticks.
  const ticked = (labelRe: RegExp) => {
    const label = all.find((w) => labelRe.test(w.text));
    return Boolean(
      label && ticks.some((t) => t.x > label.x - 14 && t.x <= label.x + 2 && t.y > label.y + 5 && t.y < label.y + 18),
    );
  };
  card.gender = ticked(/^Female$/i) ? "FEMALE" : ticked(/^Male$/i) ? "MALE" : null;
  card.anointed = ticked(/Anointed/i);
  card.appointment = ticked(/Elder/i) ? "ELDER" : ticked(/Ministerial/i) ? "MINISTERIAL_SERVANT" : "PUBLISHER";
  card.pioneerStatus = ticked(/Special/i) ? "SPECIAL" : ticked(/Regular/i) ? "REGULAR" : "NONE";
}

function readPrintedMonths(card: S21Card, grid: Grid, fallbackYear?: number) {
  const { all, ticks, columnOf, bands, tableTop } = grid;
  const yearWord = all.find((w) => /^(19|20)\d{2}$/.test(w.text) && w.y > bands[0].top && w.y < tableTop);
  let serviceYear = yearWord ? Number(yearWord.text) : null;
  if (!serviceYear && fallbackYear && card.serviceYears.length === 0) {
    serviceYear = fallbackYear;
    card.problems.push(`No service year is printed above the month table; the ${fallbackYear - 1}/${String(fallbackYear).slice(2)} year you chose was used.`);
  }
  if (!serviceYear) {
    card.problems.push("No service year is printed above the month table, so the months were left out.");
    return;
  }
  const year = serviceYear;
  card.serviceYears.push(year);

  const inRow = (w: Word, band: { top: number; bottom: number }) => w.y > band.bottom && w.y <= band.top;
  const cell = (col: number, band: { top: number; bottom: number }) =>
    all.filter((w) => columnOf(w.x) === col && inRow(w, band)).sort((a, b) => a.x - b.x).map((w) => w.text);
  const tickedCell = (col: number, band: { top: number; bottom: number }) =>
    ticks.some((t) => columnOf(t.x) === col && inRow(t, band));

  bands.forEach((band, r) => {
    addMonth(card, year, r, {
      shared: tickedCell(1, band),
      aux: tickedCell(3, band),
      studiesRaw: cell(2, band).join(""),
      hoursRaw: cell(4, band).join(""),
      remarks: cell(5, band).join(" ").trim() || null,
    });
  });
}

/** "September", "Sept." or "sep": the month names printed down the first column. */
function isMonthWord(text: string): boolean {
  const s = text.toLowerCase().replace(/[^a-z]/g, "");
  return s.length >= 3 && MONTH_NAMES.some((m) => m.toLowerCase().startsWith(s));
}

function toInt(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Dates on the card are free text: "MAY 01, 1970", "13/06/1990", "1990-06-13".
 * Returns a UTC date or null.
 */
export function parseCardDate(raw: string | null): Date | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;

  const dmy = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return utc(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const ymd = v.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) return utc(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mdy = v.toLowerCase().match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/); // May 01, 1970
  if (mdy) {
    const m = months.indexOf(mdy[1].slice(0, 3));
    if (m >= 0) return utc(Number(mdy[3]), m + 1, Number(mdy[2]));
  }
  const dmyWord = v.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/); // 13 June 1990
  if (dmyWord) {
    const m = months.indexOf(dmyWord[2].slice(0, 3));
    if (m >= 0) return utc(Number(dmyWord[3]), m + 1, Number(dmyWord[1]));
  }

  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function utc(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "ABIGAIL OFUIFEME GEORGE" -> { firstName: "Abigail Ofuifeme", lastName: "George" } */
export function splitCardName(raw: string): { firstName: string; lastName: string } {
  const clean = raw.trim().replace(/\s+/g, " ");
  const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
  if (clean.includes(",")) {
    const [last, ...rest] = clean.split(",");
    return { firstName: title(rest.join(" ").trim()), lastName: title(last.trim()) };
  }
  const parts = clean.split(" ");
  if (parts.length === 1) return { firstName: "", lastName: title(parts[0]) };
  return { firstName: title(parts.slice(0, -1).join(" ")), lastName: title(parts[parts.length - 1]) };
}
