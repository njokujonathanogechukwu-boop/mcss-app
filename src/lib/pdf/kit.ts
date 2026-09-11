import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export const INK = rgb(0.106, 0.173, 0.145);
export const RULE = rgb(0.78, 0.8, 0.78);
export const SOFT = rgb(0.45, 0.5, 0.47);
export const PINE = rgb(0.184, 0.431, 0.322);

export type Doc = {
  pdf: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  width: number;
  height: number;
};

export async function newDoc(
  orientation: "portrait" | "landscape" = "portrait",
): Promise<Doc> {
  const pdf = await PDFDocument.create();
  const size: [number, number] = orientation === "portrait" ? [595, 842] : [842, 595];
  const page = pdf.addPage(size);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { pdf, page, regular, bold, width: size[0], height: size[1] };
}

export function text(
  doc: Doc,
  value: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number } = {},
) {
  const size = opts.size ?? 9;
  const font = opts.bold ? doc.bold : doc.regular;
  let str = value ?? "";
  if (opts.maxWidth) {
    while (str.length > 1 && font.widthOfTextAtSize(str, size) > opts.maxWidth) {
      str = str.slice(0, -1);
    }
    if (str !== value && str.length > 1) str = `${str.slice(0, -1)}…`;
  }
  doc.page.drawText(str, { x, y, size, font, color: opts.color ?? INK });
}

export function textRight(
  doc: Doc,
  value: string,
  right: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
) {
  const size = opts.size ?? 9;
  const font = opts.bold ? doc.bold : doc.regular;
  const w = font.widthOfTextAtSize(value, size);
  doc.page.drawText(value, { x: right - w, y, size, font, color: opts.color ?? INK });
}

export function rule(doc: Doc, x1: number, x2: number, y: number, thickness = 0.5, color = RULE) {
  doc.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

export function band(doc: Doc, x: number, y: number, w: number, h: number, color = rgb(0.96, 0.97, 0.96)) {
  doc.page.drawRectangle({ x, y, width: w, height: h, color });
}

export function wrap(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const words = (value ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
