"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";
import { loadPioneerStarts, loadServicePeriods, saveServicePeriods, setPioneerStart, ymIndex } from "@/lib/pioneer-review";
import { applyRealignment, planRealignment, realignPioneerReports } from "@/lib/pioneer-status";

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

/**
 * Moves every report that does not yet stand where its publisher's recorded
 * start of regular pioneer service puts it — for starts recorded before the
 * reports were moved on saving, or reports entered since under the old rule.
 */
export async function applyRecordedStarts(_prev: StartState, _formData: FormData): Promise<StartState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const plan = await planRealignment();
  if (plan.length === 0) return { ok: "Every report already matches the recorded starts." };
  const moved = await applyRealignment(plan);

  await recordAudit(
    auth.session.userId, "updated", "ServiceReport", null,
    `Moved ${moved} report${moved === 1 ? "" : "s"} to the standing the recorded starts of regular pioneer service give them`,
  );

  revalidatePath("/reports/pioneers");
  revalidatePath("/reports");
  return { ok: `${moved} report${moved === 1 ? "" : "s"} corrected.` };
}

/**
 * Records that a regular (or special) pioneer has stopped: the last month they
 * served, and why, if given. Their service from its recorded start to that
 * month is kept as a period of its own, so those months stay a pioneer's — on
 * the S-1 for a late report, on the pioneer review for the year, on their
 * record — and their standing from the next month is a publisher's. Reports
 * already on file after it are moved to the publisher's or auxiliary line.
 */
export async function endPioneerService(_prev: StartState, formData: FormData): Promise<StartState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const publisherId = String(formData.get("publisherId") ?? "");
  const match = /^(\d{4})-(\d{2})$/.exec(String(formData.get("end") ?? "").trim());
  if (!match) return { error: "Choose the last month they served." };
  const end = { year: Number(match[1]), month: Number(match[2]) };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || null;

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { firstName: true, lastName: true, pioneerStatus: true },
  });
  if (!publisher) return { error: "That publisher is no longer on file." };
  if (publisher.pioneerStatus !== "REGULAR" && publisher.pioneerStatus !== "SPECIAL") {
    return { error: `${displayName(publisher)} is not serving as a regular pioneer now.` };
  }

  const starts = await loadPioneerStarts();
  const start = starts[publisherId] ?? null;
  if (start && ymIndex(end) < ymIndex(start)) {
    return { error: `The last month served cannot be before they began, in ${monthLabel(start.year, start.month)}.` };
  }

  const periods = (await loadServicePeriods())[publisherId] ?? [];
  await saveServicePeriods(publisherId, [
    ...periods,
    { kind: publisher.pioneerStatus, start, end, reason, recordedAt: new Date().toISOString() },
  ]);
  await setPioneerStart(publisherId, null);
  await prisma.publisher.update({ where: { id: publisherId }, data: { pioneerStatus: "NONE" } });
  const realigned = await realignPioneerReports(publisherId);

  await recordAudit(
    auth.session.userId, "updated", "Publisher", publisherId,
    `Recorded that ${displayName(publisher)} stopped regular pioneer service after ${monthLabel(end.year, end.month)}` +
      (reason ? ` (${reason})` : "") +
      (realigned.moved ? `; ${realigned.moved} later report${realigned.moved === 1 ? "" : "s"} moved` : ""),
  );

  revalidatePath("/reports/pioneers");
  revalidatePath("/reports");
  revalidatePath(`/publishers/${publisherId}`);
  return {
    ok: `${displayName(publisher)}'s pioneer service is recorded as ending after ${monthLabel(end.year, end.month)}.`,
  };
}

/** Takes back the most recent end of service, for one recorded by mistake. */
export async function undoPioneerEnd(_prev: StartState, formData: FormData): Promise<StartState> {
  const auth = await guard("publisher:write");
  if (!auth.ok) return { error: auth.error };

  const publisherId = String(formData.get("publisherId") ?? "");
  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { firstName: true, lastName: true, pioneerStatus: true },
  });
  if (!publisher) return { error: "That publisher is no longer on file." };
  if (publisher.pioneerStatus === "REGULAR" || publisher.pioneerStatus === "SPECIAL") {
    return { error: `${displayName(publisher)} is already serving as a pioneer.` };
  }
  const periods = (await loadServicePeriods())[publisherId] ?? [];
  const last = periods[periods.length - 1];
  if (!last) return { error: "There is no ended service to take back." };

  await saveServicePeriods(publisherId, periods.slice(0, -1));
  if (last.start) await setPioneerStart(publisherId, last.start);
  await prisma.publisher.update({ where: { id: publisherId }, data: { pioneerStatus: last.kind } });
  await realignPioneerReports(publisherId);

  await recordAudit(
    auth.session.userId, "updated", "Publisher", publisherId,
    `Took back the end of ${displayName(publisher)}'s regular pioneer service`,
  );

  revalidatePath("/reports/pioneers");
  revalidatePath("/reports");
  revalidatePath(`/publishers/${publisherId}`);
  return { ok: `${displayName(publisher)} is serving as a regular pioneer again.` };
}
