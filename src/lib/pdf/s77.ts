import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { CONGREGATION } from "@/lib/congregation";
import { type CaseEntry } from "@/lib/standing-case";
import { formatDate } from "@/lib/format";

/**
 * The S-77 case record, drawn from what the standing entry holds. The official
 * form is filled and signed on paper by the committee; this is the congregation's
 * own copy of the same facts, so the case file travels with everything else.
 */

const W = 595.28;
const H = 841.89;
const M = 48;

const INK = rgb(0.13, 0.13, 0.13);
const SOFT = rgb(0.45, 0.45, 0.45);
const RULE = rgb(0.75, 0.75, 0.75);

export type S77Person = {
  firstName: string;
  lastName: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth: Date | null;
  baptismDate: Date | null;
  isBaptized: boolean;
};

export type S77Entry = CaseEntry & { restrictions: CaseEntry[] };

export type S77Input = {
  person: S77Person;
  entry: S77Entry;
  /** Every decision on this person's record, for the envelope indication. */
  indication: string[];
  documents: { fileName: string; size: number; createdAt: Date }[];
};

const DECISION_BOX: Record<string, string> = {
  DISFELLOWSHIPPED: "REMOVAL FROM THE CONGREGATION",
  DISASSOCIATED: "DISASSOCIATION",
  REPROVED: "REPROOF BY A COMMITTEE OF ELDERS",
  REINSTATED: "REINSTATEMENT",
  RESTRICTION: "RESTRICTIONS",
};

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

/** Helvetica draws WinAnsi only; anything else would abort the whole export. */
const WIN_ANSI_EXTRA = "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178";

function plain(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 63;
    if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRA.includes(ch)) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

export async function buildS77CaseRecord(input: S77Input): Promise<Uint8Array> {
  const { person, entry, indication, documents } = input;

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - 56;

  const ensure = (needed: number) => {
    if (y - needed < 64) {
      page = pdf.addPage([W, H]);
      y = H - 56;
    }
  };
  const text = (value: string, opts: { size?: number; font?: PDFFont; color?: typeof INK; indent?: number } = {}) => {
    const size = opts.size ?? 9;
    const font = opts.font ?? regular;
    const x = M + (opts.indent ?? 0);
    for (const line of wrap(font, plain(value), size, W - M * 2 - (opts.indent ?? 0))) {
      ensure(size + 4);
      page.drawText(line, { x, y, size, font, color: opts.color ?? INK });
      y -= size + 4;
    }
  };
  const heading = (value: string) => {
    ensure(26);
    y -= 8;
    page.drawText(plain(value), { x: M, y, size: 9.5, font: bold, color: INK });
    y -= 14;
  };
  const rule = () => {
    ensure(12);
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: RULE });
    y -= 12;
  };

  page.drawText("RECORD OF REMOVAL, DISASSOCIATION, OR REPROOF (S-77)", { x: M, y, size: 12.5, font: bold, color: INK });
  y -= 14;
  text("Case record prepared from the congregation's confidential file. The committee signs the official form.", { size: 8, color: SOFT });
  text(
    `Congregation ${CONGREGATION.number} ${CONGREGATION.name}, ${CONGREGATION.city}, ${CONGREGATION.province}`,
    { size: 8, color: SOFT },
  );
  rule();

  heading("THE INDIVIDUAL");
  text(`Name: ${person.lastName.toUpperCase()}, ${person.firstName}`);
  text(
    `Sex: ${person.gender === "MALE" ? "Male" : "Female"}    ` +
      `Date of birth: ${person.dateOfBirth ? formatDate(person.dateOfBirth) : "not on file"}    ` +
      `Date of baptism: ${person.isBaptized && person.baptismDate ? formatDate(person.baptismDate) : "not baptized"}`,
  );

  heading("1. DECISION OF THE COMMITTEE");
  text(`[X] ${DECISION_BOX[entry.kind] ?? entry.kind}`, { font: bold });
  text(`Date of the decision: ${formatDate(entry.eventDate)}`);
  if (entry.kind !== "RESTRICTION") {
    text(entry.announcedDate ? `Date of announcement: ${formatDate(entry.announcedDate)}` : "Not announced to the congregation.");
  }
  if (entry.kind === "RESTRICTION") {
    text(entry.liftedDate ? `Restrictions removed: ${formatDate(entry.liftedDate)}` : "Restrictions still running.");
  }
  if (entry.notes) {
    text("Specify offence(s) / action(s):", { color: SOFT, size: 8.5 });
    text(entry.notes, { indent: 10, size: 8.5 });
  }
  for (const r of entry.restrictions) {
    text(
      r.liftedDate
        ? `Restrictions imposed ${formatDate(r.eventDate)}, removed ${formatDate(r.liftedDate)}:`
        : `Restrictions imposed ${formatDate(r.eventDate)}, still running:`,
      { indent: 10, size: 8.5, font: bold },
    );
    if (r.notes) text(r.notes, { indent: 20, size: 8.5 });
  }

  heading("2. COMMITTEE MEMBERS");
  for (const label of ["(Chairman)", "(Member)", "(Member)"]) {
    ensure(24);
    page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M - 120, y: y + 10 }, thickness: 0.75, color: RULE });
    page.drawText(label, { x: W - M - 110, y: y + 7, size: 8, font: regular, color: SOFT });
    y -= 24;
  }

  heading("3. WHAT THE ENVELOPE MUST STATE");
  text("The envelope carrying this record to the Service Department indicates the decisions made by the", { size: 8.5, color: SOFT });
  text("committee, and the dates of those decisions:", { size: 8.5, color: SOFT });
  for (const line of indication) text(line, { size: 8.5, indent: 10 });

  heading("4. DOCUMENTS IN THIS CASE FILE");
  if (documents.length === 0) {
    text("None on file.", { color: SOFT });
  } else {
    for (const d of documents) {
      text(`- ${d.fileName}  (${Math.max(1, Math.round(d.size / 1024))} KB, added ${formatDate(d.createdAt)})`, { size: 8.5 });
    }
  }

  ensure(60);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.75, color: RULE });
  y -= 12;
  for (const line of [
    "Removal or disassociation: send the completed S-77 to the Service Department and retain a copy in the",
    "congregation's confidential file. Reproof: retain it in the confidential file; it is not sent. Once the form",
    "has been properly filed, any electronic copies should be permanently deleted from electronic devices.",
  ]) {
    page.drawText(line, { x: M, y, size: 7.5, font: regular, color: SOFT });
    y -= 10;
  }

  return pdf.save();
}

/** A readable file name for one person's record. */
export function s77FileName(person: { firstName: string; lastName: string }, entry: CaseEntry): string {
  const stamp = entry.eventDate.toISOString().slice(0, 10);
  return `S-77-${person.lastName}-${person.firstName}-${stamp}.pdf`.replace(/\s+/g, "-");
}
