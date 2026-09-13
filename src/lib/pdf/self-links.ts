import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { formatDate, displayName } from "@/lib/format";
import { ensureSelfToken, requestOrigin } from "@/lib/self-service";

const INK = rgb(0.106, 0.173, 0.145);
const SOFT = rgb(0.45, 0.5, 0.47);
const RULE = rgb(0.78, 0.8, 0.78);

const W = 595;
const H = 842;
const M = 36;
const GAP = 12;
const COLS = 2;
const ROWS = 4;
const CARD_W = (W - 2 * M - GAP) / COLS;
const TOP = H - 84;
const CARD_H = (TOP - M - GAP * (ROWS - 1)) / ROWS;
const QR = 92;

/** Breaks a long unbroken string (a URL) into lines that fit a width. */
function chunk(font: { widthOfTextAtSize: (t: string, s: number) => number }, value: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of value) {
    if (line && font.widthOfTextAtSize(line + ch, size) > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapWords(font: { widthOfTextAtSize: (t: string, s: number) => number }, value: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A printable hand-out: one card per publisher carrying their name, group, a
 * scannable code and the typed address of their personal update page, so links
 * can be cut out and given at the meeting to publishers without email.
 * Codes are drawn locally; the links never leave the server.
 */
export async function buildSelfLinksSheet(): Promise<Uint8Array> {
  const origin = await requestOrigin();

  const publishers = await prisma.publisher.findMany({
    where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      selfToken: true,
      group: { select: { number: true, name: true } },
    },
    orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
  });

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const header = (page: ReturnType<typeof pdf.addPage>) => {
    page.drawText("MAITAMA CONGREGATION — PERSONAL UPDATE LINKS", { x: M, y: H - 44, size: 13, font: bold, color: INK });
    page.drawText(`Cut out and hand to each publisher. As at ${formatDate(new Date())}`, { x: M, y: H - 58, size: 8, font: regular, color: SOFT });
    page.drawLine({ start: { x: M, y: H - 66 }, end: { x: W - M, y: H - 66 }, thickness: 1, color: RULE });
  };

  let page = pdf.addPage([W, H]);
  header(page);
  let placed = 0;

  for (const p of publishers) {
    const token = p.selfToken ?? (await ensureSelfToken(p.id));
    if (!token || !origin) continue;
    const link = `${origin}/my/${token}`;

    const slot = placed % (COLS * ROWS);
    if (placed > 0 && slot === 0) {
      page = pdf.addPage([W, H]);
      header(page);
    }
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    const x = M + col * (CARD_W + GAP);
    const y = TOP - row * (CARD_H + GAP) - CARD_H;

    page.drawRectangle({ x, y, width: CARD_W, height: CARD_H, borderColor: RULE, borderWidth: 0.75 });
    page.drawText(displayName(p).toUpperCase(), { x: x + 9, y: y + CARD_H - 17, size: 9, font: bold, color: INK });
    page.drawText(
      p.group ? `Group ${p.group.number} — ${p.group.name}` : "No group",
      { x: x + 9, y: y + CARD_H - 28, size: 7.5, font: regular, color: SOFT },
    );

    const png = await QRCode.toBuffer(link, { type: "png", margin: 1, width: 240, errorCorrectionLevel: "M" });
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: x + 9, y: y + 9, width: QR, height: QR });

    const textX = x + 9 + QR + 9;
    const maxW = CARD_W - (textX - x) - 9;
    let lineY = y + CARD_H - 42;
    for (const line of chunk(regular, link, 6.5, maxW)) {
      page.drawText(line, { x: textX, y: lineY, size: 6.5, font: regular, color: INK });
      lineY -= 9;
    }
    lineY -= 4;
    for (const line of wrapWords(regular, "Scan the code, or type the address, to check and update your details. Personal to you — do not forward.", 6.5, maxW)) {
      page.drawText(line, { x: textX, y: lineY, size: 6.5, font: regular, color: SOFT });
      lineY -= 9;
    }

    placed++;
  }

  return pdf.save();
}
