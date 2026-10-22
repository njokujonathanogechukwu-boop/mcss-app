"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";
import { setPioneerStart } from "@/lib/pioneer-review";
import { realignPioneerReports } from "@/lib/pioneer-status";

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
  // Reports already on file are moved to the S-1 line the start puts them on:
  // before it auxiliary or publisher, from it regular.
  const realigned = start ? await realignPioneerReports(publisherId) : { moved: 0, months: [] as string[] };
  await recordAudit(
    auth.session.userId, "updated", "Publisher", publisherId,
    start
      ? `Recorded that ${displayName(publisher)} began regular pioneer service in ${monthLabel(start.year, start.month)}`
      : `Cleared the recorded start of ${displayName(publisher)}'s regular pioneer service`,
  );

  if (realigned.moved) {
    await recordAudit(
      auth.session.userId, "updated", "ServiceReport", publisherId,
      `Moved ${realigned.moved} of ${displayName(publisher)}'s reports to the standing their start of regular pioneer service gives them`,
    );
  }

  revalidatePath("/reports/pioneers");
  revalidatePath("/reports");
  if (!start) return { ok: "Cleared." };
  return {
    ok: realigned.moved
      ? `Saved. ${realigned.moved} earlier report${realigned.moved === 1 ? "" : "s"} corrected (${realigned.months
          .map((k) => { const [y, m] = k.split("-").map(Number); return monthLabel(y, m); })
          .join(", ")}).`
      : "Saved.",
  };
}
