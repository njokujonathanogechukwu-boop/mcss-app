import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * The letter that asks for the hall, kept with its booking so the operating
 * committee can read the request itself. One letter an event: an event using
 * both halls shares it.
 *
 * Held in congregation settings, so no database change is needed: the file
 * under a key of its own, and the names and sizes of every letter together in
 * one small index the bookings page reads without loading the files.
 */
const INDEX_KEY = "booking:letters";
const fileKey = (eventKey: string) => `booking:letter:${eventKey}`;

/** A posted letter must fit the server-action limit with the form around it. */
export const MAX_LETTER_BYTES = 3 * 1024 * 1024;
export const LETTER_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type LetterInfo = { fileName: string; mimeType: string; size: number; uploadedAt: string };

/** The event a booking belongs to: the booking itself, or the event it is linked into. */
export function eventKeyOf(bookingId: string, links: Record<string, string>): string {
  return links[bookingId] ?? bookingId;
}

export async function letterIndex(): Promise<Record<string, LetterInfo>> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: INDEX_KEY } });
  if (!row) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, LetterInfo>) : {};
  } catch {
    return {};
  }
}

async function writeIndex(index: Record<string, LetterInfo>) {
  const value = JSON.stringify(index);
  await prisma.congregationSetting.upsert({ where: { key: INDEX_KEY }, update: { value }, create: { key: INDEX_KEY, value } });
}

/** Checks a posted file: a letter of an accepted kind and size, or a reason it is not. */
export function checkLetter(file: File): { ok: true; mimeType: string } | { ok: false; error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = LETTER_TYPES[ext];
  if (!mimeType) return { ok: false, error: "Attach the letter as a PDF, a Word file or a photograph." };
  if (file.size > MAX_LETTER_BYTES) return { ok: false, error: "The letter is over 3 MB. Scan or photograph it at a smaller size." };
  return { ok: true, mimeType };
}

export async function saveLetter(eventKey: string, file: File, mimeType: string) {
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const fileName = file.name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
  const value = JSON.stringify({ fileName, mimeType, data });
  await prisma.congregationSetting.upsert({ where: { key: fileKey(eventKey) }, update: { value }, create: { key: fileKey(eventKey), value } });
  const index = await letterIndex();
  index[eventKey] = { fileName, mimeType, size: file.size, uploadedAt: new Date().toISOString() };
  await writeIndex(index);
}

export async function removeLetter(eventKey: string) {
  await prisma.congregationSetting.deleteMany({ where: { key: fileKey(eventKey) } });
  const index = await letterIndex();
  delete index[eventKey];
  await writeIndex(index);
}

/** Moves a letter when the event it belongs to is known by a new key. */
export async function moveLetter(from: string, to: string) {
  if (from === to) return;
  const row = await prisma.congregationSetting.findUnique({ where: { key: fileKey(from) } });
  const index = await letterIndex();
  if (!row || !index[from]) return;
  await prisma.congregationSetting.upsert({ where: { key: fileKey(to) }, update: { value: row.value }, create: { key: fileKey(to), value: row.value } });
  await prisma.congregationSetting.delete({ where: { key: fileKey(from) } });
  index[to] = index[from];
  delete index[from];
  await writeIndex(index);
}

export async function readLetter(eventKey: string): Promise<{ fileName: string; mimeType: string; bytes: Buffer } | null> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: fileKey(eventKey) } });
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as { fileName: string; mimeType: string; data: string };
    return { fileName: parsed.fileName, mimeType: parsed.mimeType, bytes: Buffer.from(parsed.data, "base64") };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- the email link

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET is missing or too short.");
  return value;
}

const sign = (eventKey: string) =>
  createHmac("sha256", secret()).update(`hall-letter:${eventKey}`).digest("base64url").slice(0, 32);

/**
 * The address the operating committee's emails give for a letter. It carries
 * its own proof, so it opens without an account — but only that one letter,
 * and only while it is attached.
 */
export function letterPath(eventKey: string): string {
  return `/hall-letter/${encodeURIComponent(eventKey)}?sig=${sign(eventKey)}`;
}

export function letterSignatureOk(eventKey: string, sig: string | null): boolean {
  if (!sig) return false;
  const expected = Buffer.from(sign(eventKey));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
