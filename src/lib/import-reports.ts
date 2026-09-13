import Papa from "papaparse";
import { MONTH_NAMES, calendarYearOf } from "./service-year";

/**
 * Reads historical field service reports out of a pasted or uploaded sheet.
 *
 * Three layouts are recognised, in this order:
 *
 *  grid   Names down the side, months across the top. One cell per
 *         publisher per month. The service year is taken from the headings
 *         when they carry one ("Sep 2025", "09/2025") and from the form
 *         when they do not ("Sep", "October").
 *
 *  long   One row per publisher per month, with a Month column and any of
 *         Shared / Studies / Hours / Aux / Remarks.
 *
 *  card   A single S-21 card: a Month column with the report columns but no
 *         name column. The publisher is chosen on the form.
 *
 * Parsing never touches the database. Matching names to publishers on file
 * happens in the server action, which also decides what is a duplicate.
 */

export type ReportLayout = "grid" | "long" | "card";

/** What a number in a grid cell means. Set on the form; there is no safe way to guess. */
export type GridCellMeaning = "hours" | "studies" | "tick";

export type ParsedReport = {
  line: number;
  /** As written on the sheet; null on a card, where the form supplies the publisher. */
  name: string | null;
  year: number;
  month: number;
  shared: boolean;
  studies: number;
  hours: number | null;
  aux: boolean;
  remarks: string | null;
};

export type ReportParseResult = {
  layout: ReportLayout | null;
  reports: ParsedReport[];
  problems: { line: number; message: string }[];
  months: { year: number; month: number }[];
};

export type ReportParseOptions = {
  /** Used for headings or cells that name a month with no year. */
  serviceYear: number;
  cellMeaning: GridCellMeaning;
};

// ------------------------------------------------------------ headings

const NAME_HEADERS = ["name", "fullname", "publisher", "publishername", "names"];
const FIRST_HEADERS = ["firstname", "first", "givenname", "forename", "othernames"];
const LAST_HEADERS = ["lastname", "last", "surname", "familyname"];
const MONTH_HEADERS = ["month", "period", "reportmonth", "servicemonth", "monthyear"];
const YEAR_HEADERS = ["year", "calendaryear"];
const SHARED_HEADERS = ["shared", "sharedinministry", "sharedintheministry", "participated", "reported", "preached"];
const STUDIES_HEADERS = ["studies", "biblestudies", "bs", "study", "biblestudy", "nostudies", "numberofstudies", "differentbiblestudiesconducted"];
const HOURS_HEADERS = ["hours", "hrs", "hour", "time", "hoursinministry"];
const AUX_HEADERS = ["aux", "auxiliary", "auxpioneer", "auxiliarypioneer", "ap", "pioneer"];
const REMARKS_HEADERS = ["remarks", "remark", "notes", "note", "comment", "comments"];

function normalise(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], aliases: string[]): number | undefined {
  const i = headers.findIndex((h) => aliases.includes(normalise(h)));
  return i === -1 ? undefined : i;
}

// ------------------------------------------------------------ months

const MONTH_LOOKUP: Record<string, number> = {};
MONTH_NAMES.forEach((name, i) => {
  const lower = name.toLowerCase();
  MONTH_LOOKUP[lower] = i + 1;
  MONTH_LOOKUP[lower.slice(0, 3)] = i + 1;
});
MONTH_LOOKUP.sept = 9;

/**
 * Reads "September 2025", "Sep-25", "Sep", "09/2025", "2025-09", "9/25".
 * Returns null when the text is not a month at all. A month with no year
 * comes back with year = null so the caller can fill it from the service year.
 */
export function parseMonthLabel(raw: string): { month: number; year: number | null } | null {
  const text = raw.trim().toLowerCase().replace(/[’']/g, "");
  if (!text) return null;

  // Word month, optional year: "sep", "sept 2025", "september-25", "Sep '25"
  const word = text.match(/^([a-z]{3,9})\.?[\s\-/,.]*(\d{2}|\d{4})?$/);
  if (word) {
    const month = MONTH_LOOKUP[word[1]];
    if (!month) return null;
    return { month, year: word[2] ? expandYear(word[2]) : null };
  }

  // "2025-09", "2025/9"
  const ymd = text.match(/^(\d{4})[\-/.](\d{1,2})(?:[\-/.]\d{1,2})?$/);
  if (ymd) {
    const month = Number(ymd[2]);
    return month >= 1 && month <= 12 ? { month, year: Number(ymd[1]) } : null;
  }

  // "09/2025", "9-25"
  const mdy = text.match(/^(\d{1,2})[\-/.](\d{2}|\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    return month >= 1 && month <= 12 ? { month, year: expandYear(mdy[2]) } : null;
  }

  // "01/09/2025" (a date inside the month, as spreadsheets often store it)
  const dmy = text.match(/^(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{2}|\d{4})$/);
  if (dmy) {
    const month = Number(dmy[2]);
    return month >= 1 && month <= 12 ? { month, year: expandYear(dmy[3]) } : null;
  }

  return null;
}

function expandYear(two: string) {
  const n = Number(two);
  return two.length === 4 ? n : 2000 + n;
}

// ------------------------------------------------------------ values

const YES = new Set(["y", "yes", "✓", "✔", "√", "x", "✗", "true", "shared", "s", "p", "r", "1"]);
const NO = new Set(["n", "no", "0", "nil", "none", "false", "-", "—", "ns", "nr", "notshared"]);

function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (YES.has(v)) return true;
  if (NO.has(v)) return false;
  return null;
}

function parseInt0(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * A grid cell. Blank means "no report on file". Otherwise it is read
 * according to what the form says the numbers mean, with two extensions
 * that legacy sheets use: "12 (2)" or "12/2" for hours with studies, and
 * a trailing "AP" for an auxiliary pioneer month.
 */
function parseGridCell(
  raw: string,
  meaning: GridCellMeaning,
): { shared: boolean; studies: number; hours: number | null; aux: boolean } | null | "bad" {
  let v = raw.trim().toLowerCase();
  if (!v) return null;

  let aux = false;
  if (/\b(ap|aux)\b/.test(v)) {
    aux = true;
    v = v.replace(/\b(ap|aux)\b/g, "").trim();
    if (!v) return { shared: true, studies: 0, hours: null, aux };
  }

  const bool = parseBool(v);
  if (meaning === "tick") {
    if (bool === null) return { shared: true, studies: 0, hours: null, aux }; // any mark counts
    return { shared: bool, studies: 0, hours: null, aux };
  }

  // "0" and "-" mean did not share, in every meaning.
  if (bool === false) return { shared: false, studies: 0, hours: null, aux };
  if (bool === true && !/^\d/.test(v)) return { shared: true, studies: 0, hours: null, aux };

  // A tick with a count after it: "✓ (2)", "y/2" - shared, with that many studies.
  const tickCount = v.match(/^(\S+)\s*(?:\(|\/)\s*(\d+)\)?$/);
  if (tickCount && parseBool(tickCount[1]) === true) {
    return { shared: true, studies: Number(tickCount[2]), hours: null, aux };
  }

  const two = v.match(/^(\d+)\s*(?:\(|\/|\+|,)\s*(\d+)\)?$/);
  if (two) {
    const a = Number(two[1]);
    const b = Number(two[2]);
    return meaning === "hours"
      ? { shared: true, studies: b, hours: a, aux }
      : { shared: true, studies: a, hours: b, aux };
  }

  const n = parseInt0(v.replace(/h(rs?)?$/, "").trim());
  if (n === null) return "bad";
  return meaning === "hours"
    ? { shared: true, studies: 0, hours: n, aux }
    : { shared: true, studies: n, hours: null, aux };
}

// ------------------------------------------------------------ parsing

export function parseReportsSheet(text: string, options: ReportParseOptions): ReportParseResult {
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const data = parsed.data.map((r) => r.map((c) => String(c ?? "")));
  const problems: ReportParseResult["problems"] = [];

  if (data.length < 2) {
    return { layout: null, reports: [], problems: [{ line: 0, message: "Needs a header row and at least one record." }], months: [] };
  }

  const headers = data[0];
  const nameCol = findColumn(headers, NAME_HEADERS);
  const firstCol = findColumn(headers, FIRST_HEADERS);
  const lastCol = findColumn(headers, LAST_HEADERS);
  const monthCol = findColumn(headers, MONTH_HEADERS);

  const nameOf = (row: string[]): string | null => {
    if (nameCol !== undefined && row[nameCol]?.trim()) return row[nameCol].trim();
    const first = firstCol !== undefined ? (row[firstCol] ?? "").trim() : "";
    const last = lastCol !== undefined ? (row[lastCol] ?? "").trim() : "";
    const joined = `${first} ${last}`.trim();
    return joined || null;
  };
  const hasNameColumn = nameCol !== undefined || firstCol !== undefined || lastCol !== undefined;

  // Grid: headings that read as months, and no "Month" column.
  const monthColumns = headers
    .map((h, index) => ({ index, label: parseMonthLabel(h) }))
    .filter((c): c is { index: number; label: { month: number; year: number | null } } => c.label !== null);

  if (monthColumns.length >= 1 && hasNameColumn && monthCol === undefined) {
    return parseGrid(data, nameOf, monthColumns, options, problems);
  }

  if (monthCol !== undefined) {
    return parseLong(data, headers, monthCol, hasNameColumn ? nameOf : null, options, problems);
  }

  return {
    layout: null,
    reports: [],
    problems: [{
      line: 1,
      message:
        "Could not tell how this sheet is laid out. It needs either month headings across the top (Sep 2025, Oct 2025 …) with a Name column, or a Month column with one row per report.",
    }],
    months: [],
  };
}

function parseGrid(
  data: string[][],
  nameOf: (row: string[]) => string | null,
  monthColumns: { index: number; label: { month: number; year: number | null } }[],
  options: ReportParseOptions,
  problems: ReportParseResult["problems"],
): ReportParseResult {
  const columns = monthColumns.map((c) => ({
    index: c.index,
    month: c.label.month,
    year: c.label.year ?? calendarYearOf(options.serviceYear, c.label.month),
  }));

  const reports: ParsedReport[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const line = i + 1;
    const name = nameOf(row);
    if (!name) continue; // blank or total row

    for (const col of columns) {
      const cell = parseGridCell(row[col.index] ?? "", options.cellMeaning);
      if (cell === null) continue;
      if (cell === "bad") {
        problems.push({ line, message: `${name}: could not read "${row[col.index]}" for ${MONTH_NAMES[col.month - 1]} ${col.year}. Left out.` });
        continue;
      }
      reports.push({ line, name, year: col.year, month: col.month, ...cell, remarks: null });
    }
  }

  return { layout: "grid", reports, problems, months: uniqueMonths(columns) };
}

function parseLong(
  data: string[][],
  headers: string[],
  monthCol: number,
  nameOf: ((row: string[]) => string | null) | null,
  options: ReportParseOptions,
  problems: ReportParseResult["problems"],
): ReportParseResult {
  const yearCol = findColumn(headers, YEAR_HEADERS);
  const sharedCol = findColumn(headers, SHARED_HEADERS);
  const studiesCol = findColumn(headers, STUDIES_HEADERS);
  const hoursCol = findColumn(headers, HOURS_HEADERS);
  const auxCol = findColumn(headers, AUX_HEADERS);
  const remarksCol = findColumn(headers, REMARKS_HEADERS);

  const get = (row: string[], col: number | undefined) => (col === undefined ? "" : (row[col] ?? "").trim());

  const reports: ParsedReport[] = [];
  const months = new Map<string, { year: number; month: number }>();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const line = i + 1;
    const monthRaw = get(row, monthCol);
    if (!monthRaw) continue;

    const label = parseMonthLabel(monthRaw);
    if (!label) {
      // Total and average rows on an S-21 card land here; skip quietly.
      if (/total|average|avg/i.test(monthRaw)) continue;
      problems.push({ line, message: `Could not read the month "${monthRaw}". Left out.` });
      continue;
    }

    const name = nameOf ? nameOf(row) : null;
    if (nameOf && !name) {
      problems.push({ line, message: "No name on this row. Left out." });
      continue;
    }

    let year = label.year;
    const yearRaw = get(row, yearCol);
    if (year === null && yearRaw) year = parseInt0(yearRaw);
    if (year === null) year = calendarYearOf(options.serviceYear, label.month);
    if (year < 1990 || year > 2100) {
      problems.push({ line, message: `The year "${yearRaw || year}" does not look right. Left out.` });
      continue;
    }

    const studiesRaw = get(row, studiesCol);
    const hoursRaw = get(row, hoursCol);
    const remarks = get(row, remarksCol) || null;
    const auxRaw = get(row, auxCol);
    const aux = parseBool(auxRaw) === true || /^(ap|aux|auxiliary)/i.test(auxRaw);

    const studies = studiesRaw ? parseInt0(studiesRaw) : 0;
    if (studies === null || studies > 99) {
      problems.push({ line, message: `${name ?? "Row"}: Bible studies "${studiesRaw}" must be a whole number. Left out.` });
      continue;
    }
    const hours = hoursRaw ? parseInt0(hoursRaw.replace(/h(rs?)?$/i, "").trim()) : null;
    if (hoursRaw && (hours === null || hours > 744)) {
      problems.push({ line, message: `${name ?? "Row"}: hours "${hoursRaw}" must be a whole number up to 744. Left out.` });
      continue;
    }

    // Shared defaults to true whenever there is any sign of activity, and
    // to whatever the Shared column says when there is one.
    const sharedFlag = parseBool(get(row, sharedCol));
    const activity = studies > 0 || (hours ?? 0) > 0 || aux;
    const shared = sharedFlag ?? (sharedCol === undefined ? true : activity);

    // A row with nothing in it at all is not a report, unless a Shared
    // column explicitly says "no".
    if (!shared && sharedFlag === null && !remarks) continue;

    reports.push({ line, name, year, month: label.month, shared, studies: shared ? studies : 0, hours: shared ? hours : null, aux, remarks });
    months.set(`${year}-${label.month}`, { year, month: label.month });
  }

  return { layout: nameOf ? "long" : "card", reports, problems, months: [...months.values()] };
}

function uniqueMonths(columns: { year: number; month: number }[]) {
  const seen = new Map<string, { year: number; month: number }>();
  for (const c of columns) seen.set(`${c.year}-${c.month}`, { year: c.year, month: c.month });
  return [...seen.values()];
}

// ------------------------------------------------------------ name matching

/** Normalises a name for matching: lower case, letters only, tokens sorted. */
export function nameKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Finds the publisher a sheet name refers to. Exact token match first
 * ("Adebayo Samuel" = "Samuel Adebayo" = "Adebayo, Samuel"), then a unique
 * match on surname plus first initial for sheets that abbreviate.
 */
export function matchPublisher<T extends { id: string; firstName: string; lastName: string }>(
  name: string,
  publishers: T[],
): { publisher: T | null; ambiguous: boolean } {
  const key = nameKey(name);
  const exact = publishers.filter((p) => nameKey(`${p.firstName} ${p.lastName}`) === key);
  if (exact.length === 1) return { publisher: exact[0], ambiguous: false };
  if (exact.length > 1) return { publisher: null, ambiguous: true };

  const tokens = key.split(" ");
  const loose = publishers.filter((p) => {
    const last = p.lastName.toLowerCase().replace(/[^a-z]/g, "");
    const firstInitial = p.firstName.toLowerCase().replace(/[^a-z]/g, "").charAt(0);
    return tokens.includes(last) && tokens.some((t) => t.charAt(0) === firstInitial && t !== last);
  });
  if (loose.length === 1) return { publisher: loose[0], ambiguous: false };
  return { publisher: null, ambiguous: loose.length > 1 };
}
