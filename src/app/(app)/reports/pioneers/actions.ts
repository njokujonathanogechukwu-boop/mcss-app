"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";
import { setPioneerStart } from "@/lib/pioneer-review";

export type StartState = { error?: string; ok?: string };

/**
 * Records the month a regular pioneer began serving, so the review measures
 * them from it; an empty value clears it and the review reads the start from
 * the reports again.
 */
export async function savePioneerStart(_prev: StartState, formData: FormData): Promise<StartState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const publisherId = String(formData.get("publisherId") ?? "");
  const raw = String(formData.get("start") ?? "").trim();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (raw && !match) return { error: "Choose the month." };
  const start = match ? { year: Number(match[1]), month: Number(match[2]) } : null;
  if (start && (start.month < 1 || start.month > 12 || start.year < 1950 || start.year > 2100)) {
    return { error: "That month is not valid." };
  }

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { firstName: true, lastName: true, pioneerStatus: true },
  });
  if (!publisher) return { error: "That publisher is no longer on file." };

  await setPioneerStart(publisherId, start);
  await recordAudit(
    auth.session.userId, "updated", "Publisher", publisherId,
    start
      ? `Recorded that ${displayName(publisher)} began regular pioneer service in ${monthLabel(start.year, start.month)}`
      : `Cleared the recorded start of ${displayName(publisher)}'s regular pioneer service`,
  );

  revalidatePath("/reports/pioneers");
  return { ok: start ? "Saved." : "Cleared." };
}
