import "server-only";
import JSZip from "jszip";
import { generateText } from "ai";
import type { MidweekSection, MidweekSlot } from "@prisma/client";
import { readPdfPages, lines } from "@/lib/pdf/text";

/**
 * Reads schedules the congregation printed before the app existed — a photo of
 * the sheet, the Word file it was typed in, or a PDF — and returns what is on
 * them as structured weeks. The model only transcribes; matching the names to
 * the rolls and writing anything happens after the overseer has confirmed what
 * was read.
 */

const MODEL = process.env.ANNOUNCEMENT_MODEL ?? "openai/gpt-4.1-mini";

export class PastScheduleError extends Error {}

export type PastRole = "" | "Student" | "Student/Assistant" | "Conductor/Reader";

export type PastPart = {
  position: number;
  section: MidweekSection;
  title: string;
  minutes: number | null;
  detail: string | null;
  role: PastRole;
  /** The names exactly as printed, in the order printed. */
  people: string[];
};

export type PastWeek = {
  /** The meeting date printed on the sheet, YYYY-MM-DD. */
  date: string | null;
  bibleReading: string | null;
  openingSong: number | null;
  livingSong: number | null;
  closingSong: number | null;
  chairman: string | null;
  /** The literal word CHAIRMAN means the chairman offered the prayer. */
  openingPrayer: string | null;
  closingPrayer: string | null;
  parts: PastPart[];
};

export type PastSchedule = { weeks: PastWeek[] };

const INSTRUCTIONS = [
  "You transcribe Jehovah's Witness midweek meeting schedules exactly as printed.",
  "Return ONLY a JSON object, no prose and no code fences, shaped as:",
  '{"weeks":[{"date":"YYYY-MM-DD","bibleReading":"Jeremiah 26-28","openingSong":77,"livingSong":16,"closingSong":71,',
  '"chairman":"NAME","openingPrayer":"NAME or CHAIRMAN","closingPrayer":"NAME",',
  '"parts":[{"position":1,"section":"TREASURES","title":"...","minutes":10,"detail":"...","role":"...","people":["NAME"]}]}]}',
  "Rules: one entry per week found in the document.",
  "date is the meeting date printed in the heading; null if none is printed.",
  "section is the banner the part sits under: TREASURES for TREASURES FROM GOD'S WORD,",
  "MINISTRY for APPLY YOURSELF TO THE FIELD MINISTRY, LIVING for LIVING AS CHRISTIANS.",
  "role is the label printed against the part in the names column: \"\" for talks and the Bible",
  "reading when no label is printed, else exactly one of Student, Student/Assistant, Conductor/Reader.",
  "people lists the names printed for that part in order, split per person, without the role label;",
  "for Conductor/Reader the conductor comes first and the reader second.",
  "Names keep the order and spelling printed; a name split over two lines is one name.",
  "If the chairman offers the opening prayer the sheet prints CHAIRMAN: return \"CHAIRMAN\".",
  "minutes is the number in brackets after the title, null when none is printed.",
  "detail is the scripture range or setting printed under a title, null when none.",
  "Never invent a name, date, song number or scripture that is not printed.",
].join(" ");

function parseJson(text: string): PastSchedule {
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new PastScheduleError("The model returned no schedule to check.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw new PastScheduleError("The model returned something that could not be read. Try a clearer scan.");
  }
  return shapeSchedule(parsed);
}

const SECTIONS: MidweekSection[] = ["TREASURES", "MINISTRY", "LIVING"];
const ROLES: PastRole[] = ["", "Student", "Student/Assistant", "Conductor/Reader"];

function shapeSchedule(value: unknown): PastSchedule {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { weeks?: unknown }).weeks)) {
    throw new PastScheduleError("The model returned no weeks to check.");
  }
  const weeks: PastWeek[] = [];
  for (const raw of (value as { weeks: unknown[] }).weeks) {
    if (typeof raw !== "object" || raw === null) continue;
    const week = raw as Record<string, unknown>;
    const parts: PastPart[] = [];
    if (Array.isArray(week.parts)) {
      for (const rawPart of week.parts) {
        if (typeof rawPart !== "object" || rawPart === null) continue;
        const part = rawPart as Record<string, unknown>;
        const section = SECTIONS.find((s) => part.section === s) ?? "TREASURES";
        const role = ROLES.find((r) => part.role === r) ?? "";
        const people = Array.isArray(part.people)
          ? part.people.filter((p): p is string => typeof p === "string" && p.trim() !== "").map((p) => p.trim())
          : [];
        parts.push({
          position: typeof part.position === "number" ? part.position : parts.length + 1,
          section,
          title: typeof part.title === "string" ? part.title.trim() : "Part",
          minutes: typeof part.minutes === "number" ? part.minutes : null,
          detail: typeof part.detail === "string" && part.detail.trim() ? part.detail.trim() : null,
          role,
          people,
        });
      }
    }
    weeks.push({
      date: typeof week.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(week.date) ? week.date : null,
      bibleReading: str(week.bibleReading),
      openingSong: num(week.openingSong),
      livingSong: num(week.livingSong),
      closingSong: num(week.closingSong),
      chairman: str(week.chairman),
      openingPrayer: str(week.openingPrayer),
      closingPrayer: str(week.closingPrayer),
      parts,
    });
  }
  if (weeks.length === 0) throw new PastScheduleError("The model found no week on that file.");
  return { weeks };
}

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** The Word file is a zip; the text lives in one XML part with the tags on top. */
async function docxText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new PastScheduleError("That Word file has no document part to read.");
  const xml = await entry.async("string");
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pages = await readPdfPages(bytes);
  if (pages.length === 0) throw new PastScheduleError("That PDF has no pages.");
  const text = pages
    .map((page) => lines(page.items).map((line) => line.text).join("\n"))
    .join("\n")
    .trim();
  if (!text) {
    throw new PastScheduleError(
      "That PDF is a scan, so there is no text in it to read. Upload a photo of the schedule (JPG or PNG) or the Word file instead.",
    );
  }
  return text;
}

export async function readPastSchedule(bytes: Uint8Array, mimeType: string, fileName: string): Promise<PastSchedule> {
  const isImage = mimeType.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(fileName);
  const isDocx = /\.docx$/i.test(fileName) || mimeType.includes("wordprocessingml");
  const isPdf = /\.pdf$/i.test(fileName) || mimeType === "application/pdf";

  if (!isImage && !isDocx && !isPdf) {
    throw new PastScheduleError("Upload a photo (JPG, PNG), a Word file (DOCX) or a PDF of the schedule.");
  }
  if (/\.(doc|rtf|txt)$/i.test(fileName)) {
    throw new PastScheduleError("That is an older Word format. Save it as DOCX, or upload a photo of the schedule.");
  }

  if (isImage) {
    const { text } = await generateText({
      model: MODEL,
      instructions: INSTRUCTIONS,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: bytes, mediaType: mimeType || "image/jpeg" },
            { type: "text", text: "Transcribe every week on this schedule." },
          ],
        },
      ],
      temperature: 0,
    });
    return parseJson(text);
  }

  const source = isDocx ? await docxText(bytes) : await pdfText(bytes);
  const { text } = await generateText({
    model: MODEL,
    instructions: INSTRUCTIONS,
    prompt: `Transcribe every week on this schedule.\n\n${source}`,
    temperature: 0,
  });
  return parseJson(text);
}

/** The slots a printed role label stands for, in the order the names print. */
export function slotsForRole(role: PastRole, section: MidweekSection): MidweekSlot[] {
  if (role === "Conductor/Reader") return ["CONDUCTOR", "READER"];
  if (role === "Student/Assistant") return ["STUDENT", "ASSISTANT"];
  if (role === "Student") return ["STUDENT"];
  return ["SPEAKER"];
}
