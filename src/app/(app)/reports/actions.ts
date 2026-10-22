"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { REPORT_OUTCOMES, type ReportOutcome } from "@/lib/format";
import { monthLabel, calendarMonth } from "@/lib/service-year";
import {
  closeMonth, reopenMonth, isClosed, setCollectingMonth, outstandingLateReports, setLateCleared, lockedReportKeys, reportKey,
} from "@/lib/report-periods";
import { statusFacts, statusToStore } from "@/lib/pioneer-status";

export type ReportsState = { error?: string; ok?: string; warnings?: string[] };

/**
 * Saves a whole month of field service reports in one pass.
 * Rows are submitted as report[<publisherId>][<field>] with an explicit
 * outcome per publisher: they shared, they reported but did not preach, or
 * no report came in. A row left on the blank option is not recorded, and if
 * it was on file that report is removed.
 */
export async function saveMonthlyReports(
  _prev: ReportsState,
  formData: FormData,
): Promise<ReportsState> {
  const auth = await guard("report:write");
  if (!auth.ok) return { error: auth.error };

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "That reporting month is not valid." };
  }

  const ids = formData.getAll("publisherId").map(String);
  if (ids.length === 0) return { error: "There were no publishers on the sheet." };

  const publishers = await prisma.publisher.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, pioneerStatus: true },
  });
  const known = new Map(publishers.map((p) => [p.id, p]));

  // The standing each report belongs to is the one for this month, not today;
  // and a report the branch already has is locked.
  const [facts, locked, onFile] = await Promise.all([
    statusFacts(ids),
    lockedReportKeys(),
    prisma.serviceReport.findMany({
      where: { publisherId: { in: ids }, year, month },
      select: { publisherId: true, pioneerStatusUsed: true },
    }),
  ]);
  const existingStatus = new Map(onFile.map((r) => [r.publisherId, r.pioneerStatusUsed]));

  const warnings: string[] = [];
  const writes: Promise<unknown>[] = [];
  let saved = 0;
  let cleared = 0;

  for (const id of ids) {
    const publisher = known.get(id);
    if (!publisher) continue;
    if (locked.has(reportKey(id, year, month))) continue; // shown read-only; never changed or removed

    const touched = formData.get(`touched.${id}`) === "true";
    const rawOutcome = String(formData.get(`outcome.${id}`) ?? "").trim();
    const studiesRaw = String(formData.get(`studies.${id}`) ?? "").trim();
    const hoursRaw = String(formData.get(`hours.${id}`) ?? "").trim();
    const creditRaw = String(formData.get(`credit.${id}`) ?? "").trim();
    // The auxiliary box is only on rows where it applies this month.
    const aux = formData.get(`auxOffered.${id}`) === "true" ? formData.get(`aux.${id}`) === "true" : undefined;
    const remarks = String(formData.get(`remarks.${id}`) ?? "").trim();

    if (!REPORT_OUTCOMES.includes(rawOutcome as ReportOutcome)) {
      if (touched) {
        // The row was on file and has been emptied: remove the report.
        writes.push(
          prisma.serviceReport
            .deleteMany({ where: { publisherId: id, year, month } })
            .then(() => { cleared++; }),
        );
      }
      continue;
    }

    const outcome = rawOutcome as ReportOutcome;
    const shared = outcome === "SHARED";
    const pioneerStatusUsed = statusToStore(facts.get(id)!, year, month, {
      shared,
      auxTicked: aux,
      existing: existingStatus.get(id) ?? null,
    });

    let studies = 0;
    let hours: number | null = null;
    let creditHours: number | null = null;
    const who = `${publisher.firstName} ${publisher.lastName}`;

    if (shared) {
      studies = studiesRaw === "" ? 0 : Number(studiesRaw);
      if (!Number.isInteger(studies) || studies < 0 || studies > 99) {
        warnings.push(`${publisher.firstName} ${publisher.lastName}: Bible studies must be a whole number.`);
        continue;
      }

      if (hoursRaw !== "") {
        const parsed = Number(hoursRaw);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 744) {
          warnings.push(`${publisher.firstName} ${publisher.lastName}: hours must be between 0 and 744.`);
          continue;
        }
        if (pioneerStatusUsed === "NONE") {
          warnings.push(
            `${publisher.firstName} ${publisher.lastName}: hours were ignored. Only pioneers report hours.`,
          );
        } else {
          hours = parsed;
        }
      }

      // Hour credit counts toward a pioneer's goal, so it goes with the hours;
      // the reason for it is written in the remarks.
      if (creditRaw !== "") {
        const parsed = Number(creditRaw);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 744) {
          warnings.push(`${who}: hour credit must be between 0 and 744.`);
          continue;
        }
        if (pioneerStatusUsed === "NONE") {
          warnings.push(`${who}: hour credit was ignored. It applies to pioneers only.`);
        } else if (parsed > 0) {
          creditHours = parsed;
          if (!remarks) warnings.push(`${who}: hour credit saved — add the reason for it in Remarks.`);
        }
      }
    }

    const data = {
      outcome,
      bibleStudies: studies,
      hours,
      creditHours,
      pioneerStatusUsed: pioneerStatusUsed as "NONE" | "AUXILIARY" | "REGULAR" | "SPECIAL",
      remarks: remarks || null,
      source: "MANUAL" as const,
      submittedById: auth.session.userId,
    };

    writes.push(
      prisma.serviceReport
        .upsert({
          where: { publisherId_year_month: { publisherId: id, year, month } },
          create: { publisherId: id, year, month, ...data },
          update: data,
        })
        .then(() => { saved++; }),
    );
  }

  await Promise.all(writes);

  await recordAudit(
    auth.session.userId, "updated", "ServiceReport", null,
    `Saved ${saved} report(s) for ${month}/${year}`,
  );

  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/reports/reminders");

  const parts = [];
  if (saved) parts.push(`${saved} report${saved === 1 ? "" : "s"} saved`);
  if (cleared) parts.push(`${cleared} cleared`);

  return {
    ok: parts.length ? `${parts.join(", ")}.` : "Nothing to save.",
    warnings: warnings.length ? warnings : undefined,
  };
}

export type CloseState = { ok?: string; error?: string };

function validPeriod(formData: FormData): { year: number; month: number } | null {
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Submit a month's congregation report to the branch office. This freezes who
 * had reported on time; any report that arrives for this month afterwards is
 * late and rolls into the next month the secretary closes.
 */
export async function closeReportingMonth(
  _prev: CloseState,
  formData: FormData,
): Promise<CloseState> {
  const auth = await guard("report:write");
  if (!auth.ok) return { error: auth.error };

  const period = validPeriod(formData);
  if (!period) return { error: "That reporting month is not valid." };
  const { year, month } = period;

  if (await isClosed(year, month)) {
    return { error: `${monthLabel(year, month)} has already been submitted to the branch.` };
  }

  const { onTimeCount, lateCount } = await closeMonth(year, month, auth.session.userId);

  await recordAudit(
    auth.session.userId,
    "closed",
    "ReportPeriod",
    `${year}-${month}`,
    `Submitted ${monthLabel(year, month)} to the branch: ${onTimeCount} reported on time, ` +
      `${lateCount} late report(s) rolled in.`,
  );
  revalidatePath("/reports");
  revalidatePath("/dashboard");

  const rolled = lateCount ? ` ${lateCount} late report(s) rolled in from earlier months.` : "";
  return { ok: `${monthLabel(year, month)} closed — ${onTimeCount} reported on time.${rolled}` };
}

/** Undo a close so the month can be edited again; its late reports roll free. */
export async function reopenReportingMonth(
  _prev: CloseState,
  formData: FormData,
): Promise<CloseState> {
  const auth = await guard("report:write");
  if (!auth.ok) return { error: auth.error };

  const period = validPeriod(formData);
  if (!period) return { error: "That reporting month is not valid." };
  const { year, month } = period;

  if (!(await isClosed(year, month))) {
    return { error: `${monthLabel(year, month)} is not closed.` };
  }

  await reopenMonth(year, month);
  await recordAudit(
    auth.session.userId,
    "reopened",
    "ReportPeriod",
    `${year}-${month}`,
    `Reopened ${monthLabel(year, month)} for further reports.`,
  );
  revalidatePath("/reports");
  revalidatePath("/dashboard");

  return { ok: `${monthLabel(year, month)} reopened.` };
}

/**
 * Point the group links at a different month. The overseers' links can only
 * ever send the month being collected, so this is what opens a month to them
 * before the calendar would and what closes it again once it is done. A month
 * that has not happened yet, or that has already gone to the branch, cannot be
 * collected.
 */
export async function setCollectingMonthAction(
  _prev: CloseState,
  formData: FormData,
): Promise<CloseState> {
  const auth = await guard("report:write");
  if (!auth.ok) return { error: auth.error };

  const [yStr, mStr] = String(formData.get("period") ?? "").split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "That reporting month is not valid." };
  }

  const now = calendarMonth();
  if (year * 12 + month > now.year * 12 + now.month) {
    return { error: `${monthLabel(year, month)} has not happened yet.` };
  }
  if (await isClosed(year, month)) {
    return { error: `${monthLabel(year, month)} has already been submitted to the branch.` };
  }

  await setCollectingMonth(year, month);
  await recordAudit(
    auth.session.userId,
    "updated",
    "CongregationSetting",
    "collectingMonth",
    `The group links are collecting ${monthLabel(year, month)}.`,
  );
  revalidatePath("/reports");
  revalidatePath("/dashboard");

  return { ok: `The group links are collecting ${monthLabel(year, month)}.` };
}

/**
 * Marks late reports as cleared — dealt with some other way, so they no longer
 * roll into the next month closed — or puts cleared ones back. Each submission
 * carries one or more report keys; "all" clears every late report still
 * waiting.
 */
export async function setLateReportsCleared(formData: FormData) {
  const auth = await guard("report:write");
  if (!auth.ok) return;

  const cleared = formData.get("cleared") === "true";
  let keys = formData.getAll("key").map(String).filter((k) => k.split("|").length === 3);
  if (formData.get("all") === "true") keys = (await outstandingLateReports()).map((r) => r.key);
  if (keys.length === 0) return;

  await setLateCleared(keys, cleared);
  await recordAudit(
    auth.session.userId, "updated", "ReportPeriod", null,
    cleared
      ? `Cleared ${keys.length} late report${keys.length === 1 ? "" : "s"} so ${keys.length === 1 ? "it does" : "they do"} not roll into the next month closed`
      : `Put ${keys.length} cleared late report${keys.length === 1 ? "" : "s"} back to roll into the next month closed`,
  );
  revalidatePath("/reports");
}
