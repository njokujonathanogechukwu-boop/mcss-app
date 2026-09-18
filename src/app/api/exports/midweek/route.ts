import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { drawMidweekSchedule, type ScheduleSheet } from "@/lib/pdf/midweek";
import { formatDay } from "@/lib/school";
import { loadWeek, loadWeeks, toSchedulePart, toScheduleWeek, type WeekRow } from "@/lib/school-queries";

/**
 * The printed schedule: one meeting with `?week=`, a whole workbook with
 * `?period=`. The congregation is given this, so it is available to everyone who
 * can read the school's records rather than only to those who may change them.
 */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "school:read")) {
    return new NextResponse("Your account cannot open the school records.", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const weekId = params.get("week");
  const periodId = params.get("period");

  let rows: WeekRow[];
  if (weekId) {
    const row = await loadWeek(weekId);
    rows = row ? [row] : [];
  } else if (periodId) {
    rows = await loadWeeks(periodId);
  } else {
    return new NextResponse("Say what to print: ?week=ID for one meeting, ?period=ID for the whole schedule.", {
      status: 400,
    });
  }
  if (rows.length === 0) return new NextResponse("That schedule is no longer on file.", { status: 404 });

  const sheets: ScheduleSheet[] = rows.map((row) => ({
    period: row.period.label,
    week: toScheduleWeek(row),
    parts: row.parts.map((part) => toSchedulePart(part)),
    startHour: row.period.startHour,
    startMinute: row.period.startMinute,
  }));

  const pdf = await drawMidweekSchedule(sheets);
  const stamp = rows.length === 1
    ? `week_${formatDay(rows[0].weekOf).replace(/\s+/g, "")}`
    : rows[0].period.label.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="midweek_schedule_${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
