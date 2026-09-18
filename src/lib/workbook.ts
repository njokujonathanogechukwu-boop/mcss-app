import type { MidweekSection } from "@prisma/client";
import { MONTH_LABELS, meetingDateIn, type PartKind } from "@/lib/school";

/**
 * Reads an *Our Christian Life and Ministry—Meeting Workbook* and turns it into
 * the weeks and parts of a schedule, so the overseer only has to put names
 * against them.
 *
 * The workbook has to be the EPUB. Its chapters are XHTML, which reads back
 * exactly; the PDF lays the two printed columns out on shared baselines and its
 * text comes out interleaved and without reliable spaces, and the JWPUB holds a
 * SQLite database rather than chapters at all.
 */

/** Raised for anything the overseer can act on, so the message can be shown as it is. */
export class WorkbookError extends Error {}

export type WorkbookPart = {
  position: number;
  section: MidweekSection;
  title: string;
  minutes: number | null;
  detail: string | null;
  kind: PartKind;
  dualHall: boolean;
};

export type WorkbookWeek = {
  /** The range as the workbook prints it: `May 18-24`. */
  label: string;
  /** The Monday the range starts on, held at midnight UTC. */
  monday: Date;
  bibleReading: string | null;
  openingSong: number | null;
  livingSong: number | null;
  closingSong: number | null;
  parts: WorkbookPart[];
};

export type Workbook = {
  title: string;
  startYear: number;
  startMonth: number;
  weeks: WorkbookWeek[];
};

/**
 * The workbook as it is shown before anything is written, with plain strings for
 * dates so it can cross to the browser and back.
 */
export type WorkbookPreview = {
  title: string;
  startYear: number;
  startMonth: number;
  weeks: {
    label: string;
    /** The Monday the workbook's range starts on, as `YYYY-MM-DD`. */
    monday: string;
    /** The meeting day inside that range, as `YYYY-MM-DD`. */
    meeting: string;
    bibleReading: string | null;
    openingSong: number | null;
    livingSong: number | null;
    closingSong: number | null;
    parts: WorkbookPart[];
  }[];
};

const iso = (date: Date) => date.toISOString().slice(0, 10);

export function toPreview(workbook: Workbook, weekday: number): WorkbookPreview {
  return {
    title: workbook.title,
    startYear: workbook.startYear,
    startMonth: workbook.startMonth,
    weeks: workbook.weeks.map((week) => ({
      label: week.label,
      monday: iso(week.monday),
      meeting: iso(meetingDateIn(week.monday, weekday)),
      bibleReading: week.bibleReading,
      openingSong: week.openingSong,
      livingSong: week.livingSong,
      closingSong: week.closingSong,
      parts: week.parts,
    })),
  };
}

// ------------------------------------------------------------------- reading

const MONTH_NUMBERS: Record<string, number> = Object.fromEntries(
  MONTH_LABELS.map((name, index) => [name.toLowerCase(), index + 1]),
);

/** What an element says, once the markup, the entities and the soft hyphens go. */
function text(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Block = {
  level: number;
  className: string;
  title: string;
  paragraphs: string[];
};

/**
 * The chapter cut into headings, each carrying the paragraphs printed under it.
 * A heading owns everything up to the next one, which is how the workbook is
 * written: the part title is an `h3` and its material follows as `p` elements.
 */
function blocks(chapter: string): Block[] {
  const out: Block[] = [];
  for (const chunk of chapter.split(/(?=<(?:h1|h2|h3)\b)/)) {
    const head = chunk.match(/^<(h[123])\b([^>]*)>([\s\S]*?)<\/\1>/);
    if (!head) continue;
    out.push({
      level: Number(head[1][1]),
      className: head[2].match(/\bclass="([^"]*)"/)?.[1] ?? "",
      title: text(head[3]),
      paragraphs: [...chunk.slice(head[0].length).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
        .map((m) => text(m[1]))
        .filter(Boolean),
    });
  }
  return out;
}

function sectionOf(block: Block): MidweekSection | null {
  const said = block.title.toLowerCase();
  if (said.includes("treasures from god")) return "TREASURES";
  if (said.includes("apply yourself to the field ministry")) return "MINISTRY";
  if (said.includes("living as christians")) return "LIVING";
  // The section banner's colour carries the same meaning, but so does a part
  // heading's, so this is only safe to read on the banner itself.
  if (block.level !== 2) return null;
  if (block.className.includes("du-color--teal")) return "TREASURES";
  if (block.className.includes("du-color--gold")) return "MINISTRY";
  if (block.className.includes("du-color--maroon")) return "LIVING";
  return null;
}

/**
 * Who a part has to be given to. The field ministry is all student assignments;
 * the Bible reading and the congregation Bible study have their own shapes, and
 * only those two of them are handled in the auxiliary classroom as well.
 */
function shapeOf(section: MidweekSection, title: string): { kind: PartKind; dualHall: boolean } {
  const said = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (section === "MINISTRY") return { kind: "STUDENT", dualHall: true };
  if (section === "TREASURES" && said === "biblereading") return { kind: "READING", dualHall: true };
  if (said.includes("congregationbiblestudy")) return { kind: "STUDY", dualHall: false };
  return { kind: "TALK", dualHall: false };
}

const MINUTES = /^\((\d+)\s*min\.?\)\s*(.*)$/;
/** A week's title as the workbook prints it: `May 18-24`, `June 29–July 5`. */
const WEEK_TITLE = /^([A-Z][a-z]+)\s+(\d{1,2})\s*[-–—]/;
const NUMBERED = /^(\d+)[.)]\s*(.+)$/;
const SONG = /Song\s+(\d+)/i;

function parseWeek(chapter: string, label: string, anchor: Date): WorkbookWeek {
  const monday = pickYear(label, anchor);
  let section: MidweekSection | null = null;
  let bibleReading: string | null = null;
  let openingSong: number | null = null;
  let livingSong: number | null = null;
  let closingSong: number | null = null;
  const parts: WorkbookPart[] = [];

  for (const block of blocks(chapter)) {
    const next = sectionOf(block);
    if (next) {
      section = next;
      continue;
    }

    const song = block.level === 3 ? block.title.match(SONG) : null;
    if (song && !NUMBERED.test(block.title)) {
      const number = Number(song[1]);
      if (/concluding/i.test(block.title)) closingSong = number;
      else if (section === null && openingSong === null) openingSong = number;
      else if (section === "LIVING" && livingSong === null) livingSong = number;
      continue;
    }

    if (block.level === 2 && section === null && !bibleReading) {
      bibleReading = block.title || null;
      continue;
    }

    const numbered = block.level === 3 ? block.title.match(NUMBERED) : null;
    if (!numbered || !section) continue;

    const title = numbered[2].trim();
    const first = block.paragraphs[0] ?? "";
    const timed = first.match(MINUTES);
    const minutes = timed ? Number(timed[1]) : null;
    // The material line: what sits beside the minutes, or, for a talk whose
    // minutes stand alone, the outline printed underneath.
    const material = timed && timed[2]
      ? [timed[2]]
      : block.paragraphs.slice(timed ? 1 : 0);
    const detail = material.join(" ").trim().slice(0, 400) || null;
    const { kind, dualHall } = shapeOf(section, title);

    parts.push({
      position: Number(numbered[1]),
      section,
      title,
      minutes,
      detail,
      kind,
      dualHall,
    });
  }

  return { label, monday, bibleReading, openingSong, livingSong, closingSong, parts };
}

/**
 * The Monday a week's title names. The workbook gives no year, so it is taken
 * from where the week falls in the period: a January–February workbook opens on
 * a Monday in December, and a November–December one closes on a Monday in
 * January.
 */
function pickYear(label: string, anchor: Date): Date {
  const said = label.match(WEEK_TITLE);
  const month = said ? MONTH_NUMBERS[said[1].toLowerCase()] : undefined;
  if (!said || !month) return anchor;
  const day = Number(said[2]);
  const year = anchor.getUTCFullYear();
  let best = Date.UTC(year, month - 1, day);
  for (const candidate of [year - 1, year + 1]) {
    const at = Date.UTC(candidate, month - 1, day);
    if (Math.abs(at - anchor.getTime()) < Math.abs(best - anchor.getTime())) best = at;
  }
  return new Date(best);
}

/** `May-June 2026`, or `December 2026–January 2027`, as the workbook titles it. */
function periodOf(title: string): { startYear: number; startMonth: number } | null {
  const months = [...title.matchAll(/([A-Z][a-z]+)\s*(?:(\d{4})\s*)?/g)]
    .map((m) => ({ month: MONTH_NUMBERS[m[1].toLowerCase()], year: m[2] ? Number(m[2]) : null }))
    .filter((m) => m.month);
  const year = title.match(/(19|20)\d{2}/)?.[0];
  if (!months.length || !year) return null;
  return { startYear: Number(year), startMonth: months[0].month! };
}

export async function readWorkbook(bytes: Uint8Array): Promise<Workbook> {
  const JSZip = (await import("jszip")).default;

  let zip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new WorkbookError(
      "That file is not a workbook the app can read. Download the EPUB of the workbook from jw.org — the PDF and the JWPUB cannot be read as text.",
    );
  }

  const paths = Object.keys(zip.files);
  const opfPath = paths.find((p) => /(^|\/)OEBPS\/content\.opf$/i.test(p)) ?? paths.find((p) => /\.opf$/i.test(p));
  const opfFile = opfPath ? zip.file(opfPath) : null;
  if (!opfFile) {
    throw new WorkbookError("That file has no chapters in it. Is it the EPUB of the meeting workbook?");
  }

  const opf = await opfFile.async("string");
  const base = opfPath!.slice(0, opfPath!.lastIndexOf("/") + 1);
  const title = text(opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/)?.[1] ?? "") || "Meeting Workbook";

  const hrefById = new Map<string, string>();
  for (const item of opf.matchAll(/<item\b[^>]*>/g)) {
    const id = item[0].match(/\bid="([^"]+)"/)?.[1];
    const href = item[0].match(/\bhref="([^"]+)"/)?.[1];
    if (id && href) hrefById.set(id, href);
  }
  const spine = [...opf.matchAll(/<itemref\b[^>]*\bidref="([^"]+)"/g)]
    .map((m) => hrefById.get(m[1]))
    .filter((href): href is string => Boolean(href));

  const chapterPaths = (spine.length ? spine.map((href) => base + href.replace(/^\.\//, "")) : paths)
    .filter((p) => /(^|\/)\d+\.xhtml$/i.test(p));

  if (!chapterPaths.length) {
    throw new WorkbookError("No weekly chapters were found in that file. Is it the EPUB of the meeting workbook?");
  }

  const period = periodOf(title);
  if (!period) {
    throw new WorkbookError(
      `The workbook does not say which two months it covers (its title reads “${title}”), so the schedule cannot be dated. Start the schedule by hand instead.`,
    );
  }

  const first = Date.UTC(period.startYear, period.startMonth - 1, 1);
  const weeks: WorkbookWeek[] = [];
  for (const [index, path] of chapterPaths.entries()) {
    const file = zip.file(path);
    if (!file) continue;
    const chapter = await file.async("string");
    const label = text(chapter.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? "");
    // The workbook opens with a chapter of covers and introductions, which is
    // not a week and is told apart by its title not being a date range.
    if (!WEEK_TITLE.test(label)) continue;
    weeks.push(parseWeek(chapter, label, new Date(first + index * 7 * 86_400_000)));
  }

  if (!weeks.length) throw new WorkbookError("That workbook has no weeks in it.");

  return { title, startYear: period.startYear, startMonth: period.startMonth, weeks };
}
