"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";

export type ReportsState = { error?: string; ok?: string; warnings?: string[] };

/**
 * Saves a whole month of field service reports in one pass.
 * Rows are submitted as report[<publisherId>][<field>]. A row with no
 * marks at all is skipped rather than saved as a nil report, so an
 * untouched publisher still shows as "not reported" on the overview.
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

  const warnings: string[] = [];
  const writes: Promise<unknown>[] = [];
  let saved = 0;
  let cleared = 0;

  for (const id of ids) {
    const publisher = known.get(id);
    if (!publisher) continue;

    const touched = formData.get(`touched.${id}`) === "true";
    const shared = formData.get(`shared.${id}`) === "true";
    const studiesRaw = String(formData.get(`studies.${id}`) ?? "").trim();
    const hoursRaw = String(formData.get(`hours.${id}`) ?? "").trim();
    const aux = formData.get(`aux.${id}`) === "true";
    const remarks = String(formData.get(`remarks.${id}`) ?? "").trim();

    const hasAnything = shared || studiesRaw !== "" || hoursRaw !== "" || aux || remarks !== "";

    if (!hasAnything) {
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

    const studies = studiesRaw === "" ? 0 : Number(studiesRaw);
    if (!Number.isInteger(studies) || studies < 0 || studies > 99) {
      warnings.push(`${publisher.firstName} ${publisher.lastName}: Bible studies must be a whole number.`);
      continue;
    }

    const pioneerStatusUsed = aux
      ? "AUXILIARY"
      : publisher.pioneerStatus === "NONE"
        ? "NONE"
        : publisher.pioneerStatus;

    let hours: number | null = null;
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

    const data = {
      sharedInMinistry: shared,
      bibleStudies: shared ? studies : 0,
      hours: shared ? hours : null,
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

  const parts = [];
  if (saved) parts.push(`${saved} report${saved === 1 ? "" : "s"} saved`);
  if (cleared) parts.push(`${cleared} cleared`);

  return {
    ok: parts.length ? `${parts.join(", ")}.` : "Nothing to save.",
    warnings: warnings.length ? warnings : undefined,
  };
}
