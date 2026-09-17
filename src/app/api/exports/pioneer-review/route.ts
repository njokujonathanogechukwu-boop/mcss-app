import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { pioneerReview, MONTHLY_GOAL, YEARLY_GOAL, FULL_YEAR_GOAL } from "@/lib/pioneer-review";
import {
  reportingMonth, serviceYearOf, serviceYearLabel, serviceYearMonths,
} from "@/lib/service-year";

export const dynamic = "force-dynamic";

function csv(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The pioneer review as a spreadsheet, for the service committee's file. */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const asked = Number(new URL(request.url).searchParams.get("sy"));
  const cutoff = reportingMonth();
  const serviceYear =
    Number.isInteger(asked) && asked >= 2000 && asked <= 2100
      ? asked
      : serviceYearOf(cutoff.year, cutoff.month);

  const { rows } = await pioneerReview(serviceYear);
  const months = serviceYearMonths(serviceYear);

  const lines = [
    [
      "Pioneer", "Group", "Months counted", "Field hours", "Hour credit", "Combined",
      "Monthly average", "Projected total", `Hours a month to ${FULL_YEAR_GOAL}`,
      `Hours a month to ${YEARLY_GOAL}`, "Standing", ...months.map((m) => m.label),
    ].map(csv).join(","),
  ];
  for (const r of rows) {
    const standing = r.noHours
      ? "No hours recorded yet"
      : r.yearComplete
        ? r.meetsYear
          ? `Reached ${YEARLY_GOAL} hours - may continue${r.meetsFullYear ? ` (full ${FULL_YEAR_GOAL} reached)` : ""}`
          : `Below ${YEARLY_GOAL} hours - for the Congregation Service Committee`
        : r.belowPace
          ? `Below the ${MONTHLY_GOAL}-hour average - service overseer and group overseer to meet with the pioneer`
          : r.projected !== null && r.projected < YEARLY_GOAL
            ? `Projected ${r.projected} hours by August - below ${YEARLY_GOAL}`
            : "On pace";
    lines.push(
      [
        r.name,
        r.group ?? "",
        r.countedMonths || "",
        r.fieldHours,
        r.creditHours,
        r.combined,
        r.average === null ? "" : r.average.toFixed(1),
        r.projected === null ? "" : r.projected,
        r.neededForFull === null ? "" : r.neededForFull,
        r.neededPerMonth === null ? "" : r.neededPerMonth,
        standing,
        ...r.months.map((c) =>
          c.state === "ahead"
            ? ""
            : c.state === "missing"
              ? "no report recorded"
              : c.state === "no-report"
                ? "no report"
                : c.credit > 0
                  ? `${c.hours}+${c.credit}`
                  : String(c.combined),
        ),
      ].map(csv).join(","),
    );
  }

  // A byte-order mark so Excel reads the UTF-8 names correctly.
  return new NextResponse("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Pioneer_review_${serviceYearLabel(serviceYear).replace("/", "-")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
