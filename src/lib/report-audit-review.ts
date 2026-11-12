import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Reports whose audit flags the secretary has looked at and found in order,
 * by report key ("publisherId|year|month"), with when. Held as one
 * congregation setting so it needs no change to the database.
 */
const REVIEWED_KEY = "audit:reviewed";

export async function reviewedKeys(): Promise<Record<string, string>> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: REVIEWED_KEY } });
  if (!row) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function setReviewed(key: string, reviewed: boolean): Promise<void> {
  const all = await reviewedKeys();
  if (reviewed) all[key] = new Date().toISOString();
  else delete all[key];
  const value = JSON.stringify(all);
  await prisma.congregationSetting.upsert({
    where: { key: REVIEWED_KEY },
    update: { value },
    create: { key: REVIEWED_KEY, value },
  });
}
