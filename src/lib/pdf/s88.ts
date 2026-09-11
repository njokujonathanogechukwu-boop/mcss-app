import "server-only";
import { prisma } from "@/lib/prisma";
import { serviceYearMonths, serviceYearLabel, serviceYearRange } from "@/lib/service-year";
import { formatDate } from "@/lib/format";
import { newDoc, text, textRight, rule, band, INK, SOFT, PINE } from "@/lib/pdf/kit";

export type AttendanceRow = {
  label: string;
  midweekMeetings: number;
  midweekTotal: number;
  midweekAverage: number;
  weekendMeetings: number;
  weekendTotal: number;
  weekendAverage: number;
};

export async function attendanceSummary(serviceYear: number): Promise<AttendanceRow[]> {
  const { start, end } = serviceYearRange(serviceYear);
  const records = await prisma.meetingAttendance.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });

  return serviceYearMonths(serviceYear).map((m) => {
    const inMonth = records.filter(
      (r) => r.date.getUTCFullYear() === m.year && r.date.getUTCMonth() + 1 === m.month,
    );
    const mid = inMonth.filter((r) => r.meetingType === "MIDWEEK");
    const wknd = inMonth.filter((r) => r.meetingType === "WEEKEND");
    const sum = (rows: typeof inMonth) => rows.reduce((t, r) => t + r.inPerson + r.zoom, 0);
    const midTotal = sum(mid);
    const wkndTotal = sum(wknd);
    return {
      label: m.label,
      midweekMeetings: mid.length,
      midweekTotal: midTotal,
      midweekAverage: mid.length ? Math.round(midTotal / mid.length) : 0,
      weekendMeetings: wknd.length,
      weekendTotal: wkndTotal,
      weekendAverage: wknd.length ? Math.round(wkndTotal / wknd.length) : 0,
    };
  });
}

/** Congregation Meeting Attendance Record. */
export async function buildS88(serviceYear: number): Promise<Uint8Array> {
  const rows = await attendanceSummary(serviceYear);

  const doc = await newDoc("portrait");
  const L = 42;
  const R = doc.width - 42;
  let y = doc.height - 54;

  text(doc, "Congregation Meeting Attendance Record", L, y, { size: 15, bold: true });
  textRight(doc, "S-88", R, y, { size: 12, bold: true, color: PINE });
  y -= 14;
  text(doc, `Maitama Congregation  ·  Service year ${serviceYearLabel(serviceYear)}`, L, y, {
    size: 8.5,
    color: SOFT,
  });
  y -= 12;
  rule(doc, L, R, y, 1, INK);
  y -= 30;

  const c = {
    month: L,
    midMeetings: L + 150,
    midTotal: L + 232,
    midAvg: L + 310,
    wkMeetings: L + 378,
    wkTotal: L + 444,
    wkAvg: R,
  };

  text(doc, "Midweek meeting", c.midMeetings, y + 16, { size: 8, bold: true, color: PINE });
  text(doc, "Weekend meeting", c.wkMeetings - 44, y + 16, { size: 8, bold: true, color: PINE });

  band(doc, L, y - 6, R - L, 18);
  text(doc, "Month", c.month, y, { size: 7.5, bold: true, color: SOFT });
  textRight(doc, "Meetings", c.midMeetings + 60, y, { size: 7.5, bold: true, color: SOFT });
  textRight(doc, "Total", c.midTotal + 56, y, { size: 7.5, bold: true, color: SOFT });
  textRight(doc, "Average", c.midAvg + 56, y, { size: 7.5, bold: true, color: SOFT });
  textRight(doc, "Meetings", c.wkMeetings + 44, y, { size: 7.5, bold: true, color: SOFT });
  textRight(doc, "Total", c.wkTotal + 44, y, { size: 7.5, bold: true, color: SOFT });
  textRight(doc, "Average", c.wkAvg, y, { size: 7.5, bold: true, color: SOFT });
  y -= 10;
  rule(doc, L, R, y, 0.7, INK);
  y -= 16;

  let midMeetings = 0, midTotal = 0, wkMeetings = 0, wkTotal = 0;

  for (const row of rows) {
    text(doc, row.label, c.month, y, { size: 8.5 });
    const dash = (n: number) => (n === 0 ? "—" : String(n));
    textRight(doc, dash(row.midweekMeetings), c.midMeetings + 60, y, { size: 8.5 });
    textRight(doc, dash(row.midweekTotal), c.midTotal + 56, y, { size: 8.5 });
    textRight(doc, dash(row.midweekAverage), c.midAvg + 56, y, { size: 8.5, bold: true });
    textRight(doc, dash(row.weekendMeetings), c.wkMeetings + 44, y, { size: 8.5 });
    textRight(doc, dash(row.weekendTotal), c.wkTotal + 44, y, { size: 8.5 });
    textRight(doc, dash(row.weekendAverage), c.wkAvg, y, { size: 8.5, bold: true });

    midMeetings += row.midweekMeetings;
    midTotal += row.midweekTotal;
    wkMeetings += row.weekendMeetings;
    wkTotal += row.weekendTotal;

    y -= 7;
    rule(doc, L, R, y, 0.4);
    y -= 16;
  }

  rule(doc, L, R, y + 11, 0.7, INK);
  text(doc, "Service year average", c.month, y, { size: 8.5, bold: true });
  textRight(doc, String(midMeetings), c.midMeetings + 60, y, { size: 8.5, bold: true });
  textRight(doc, String(midTotal), c.midTotal + 56, y, { size: 8.5, bold: true });
  textRight(doc, midMeetings ? String(Math.round(midTotal / midMeetings)) : "—", c.midAvg + 56, y, {
    size: 8.5, bold: true,
  });
  textRight(doc, String(wkMeetings), c.wkMeetings + 44, y, { size: 8.5, bold: true });
  textRight(doc, String(wkTotal), c.wkTotal + 44, y, { size: 8.5, bold: true });
  textRight(doc, wkMeetings ? String(Math.round(wkTotal / wkMeetings)) : "—", c.wkAvg, y, {
    size: 8.5, bold: true,
  });

  y -= 32;
  text(doc, "Totals include both in-person and video-conference attendance.", L, y, {
    size: 7.5, color: SOFT,
  });
  y -= 11;
  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, y, {
    size: 7.5, color: SOFT,
  });

  return doc.pdf.save();
}
