"use server";

import { revalidatePath } from "next/cache";
import { REPORT_OUTCOMES, type ReportOutcome } from "@/lib/format";
import { collectingMonth } from "@/lib/report-periods";
import { saveGroupReport } from "@/lib/group-reports";

export type GroupReportState = {
  publisherId?: string;
  message?: string;
  error?: string;
};

/**
 * One publisher's month, sent by his group's overseer through the group's own
 * link. There is no session to check — the token in the URL is the authority,
 * so every write goes back through `saveGroupReport`, which re-reads the group
 * and refuses to overwrite a report the secretary entered.
 */
export async function submitGroupReport(
  token: string,
  _prev: GroupReportState,
  formData: FormData,
): Promise<GroupReportState> {
  const publisherId = String(formData.get("publisherId") ?? "");
  if (!publisherId) return { error: "That submission was incomplete." };

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "That reporting month is not valid.", publisherId };
  }

  const current = await collectingMonth();
  if (year * 12 + month > current.year * 12 + current.month) {
    return { error: "That month is not being collected yet.", publisherId };
  }

  const rawOutcome = String(formData.get("outcome") ?? "").trim();
  if (!REPORT_OUTCOMES.includes(rawOutcome as ReportOutcome)) {
    return { error: "Choose what this month means.", publisherId };
  }

  const aux = formData.get("aux") === "true";
  const studiesRaw = String(formData.get("studies") ?? "").trim();
  const hoursRaw = String(formData.get("hours") ?? "").trim();
  const remarks = String(formData.get("remarks") ?? "").trim().slice(0, 120);

  let studies = 0;
  if (studiesRaw !== "") {
    studies = Number(studiesRaw);
    if (!Number.isInteger(studies) || studies < 0 || studies > 99) {
      return { error: "Bible studies must be a whole number (0–99).", publisherId };
    }
  }

  let hours: number | null = null;
  if (hoursRaw !== "") {
    const parsed = Number(hoursRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 744) {
      return { error: "Hours must be a whole number between 0 and 744.", publisherId };
    }
    hours = parsed;
  }

  const result = await saveGroupReport(token, publisherId, year, month, {
    outcome: rawOutcome as ReportOutcome,
    studies,
    hours,
    aux,
    remarks: remarks || null,
  });

  if (result.ok) {
    revalidatePath("/reports");
    revalidatePath("/records");
    revalidatePath("/reports/reminders");
    revalidatePath(`/group/${token}`);
  }

  return { publisherId, ...(result.ok ? { message: result.message } : { error: result.error }) };
}
