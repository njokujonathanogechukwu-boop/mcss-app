import "server-only";
import { prisma } from "@/lib/prisma";
import { monthLabel } from "@/lib/service-year";
import { formatDate } from "@/lib/format";
import { newDoc, text, textRight, rule, band, INK, SOFT, PINE } from "@/lib/pdf/kit";
import { getTemplate } from "@/lib/forms";
import { fillS1, type S1FillData } from "@/lib/pdf/fill";

export type S1Summary = S1FillData & { year: number; month: number };

/**
 * The monthly congregation totals: how many reported in each category,
 * their Bible studies, and pioneer hours. A publisher's category for the
 * month is the standing recorded on that report, so someone who auxiliary
 * pioneered in March counts as an auxiliary pioneer for March only.
 */
export async function congregationSummary(year: number, month: number): Promise<S1Summary> {
  const [reports, activePublishers, memorial] = await Promise.all([
    prisma.serviceReport.findMany({
      where: { year, month, sharedInMinistry: true },
      select: { pioneerStatusUsed: true, bibleStudies: true, hours: true },
    }),
    prisma.publisher.count({ where: { status: { in: ["ACTIVE", "IRREGULAR"] } } }),
    prisma.memorialRecord.findFirst({
      where: { year, date: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } },
    }),
  ]);

  const bucket = (status: string) => {
    const rows = reports.filter((r) => r.pioneerStatusUsed === status);
    return {
      reports: rows.length,
      studies: rows.reduce((t, r) => t + r.bibleStudies, 0),
      hours: rows.reduce((t, r) => t + (r.hours ?? 0), 0),
    };
  };
  const publishers = bucket("NONE");
  const auxiliary = bucket("AUXILIARY");
  const regular = bucket("REGULAR");
  const special = bucket("SPECIAL");

  return {
    year,
    month,
    congregation: "Maitama",
    monthLabel: monthLabel(year, month),
    activePublishers,
    rows: {
      publishers: { reports: publishers.reports, studies: publishers.studies },
      auxiliary,
      regular,
      special,
    },
    totals: {
      reports: reports.length,
      studies: publishers.studies + auxiliary.studies + regular.studies + special.studies,
      hours: auxiliary.hours + regular.hours + special.hours,
    },
    memorial: memorial ? { attendance: memorial.inPerson + memorial.video, partakers: memorial.partakers } : null,
  };
}

/** Congregation Report for one month: the official S-1 when uploaded, else the built-in layout. */
export async function buildS1(year: number, month: number): Promise<Uint8Array> {
  const data = await congregationSummary(year, month);
  const template = await getTemplate("S1");
  if (template) return fillS1(template, data);
  return drawS1(data);
}

async function drawS1(d: S1Summary): Promise<Uint8Array> {
  const doc = await newDoc("portrait");
  const L = 42;
  const R = doc.width - 42;
  let y = doc.height - 54;

  text(doc, "Congregation Report", L, y, { size: 15, bold: true });
  textRight(doc, "S-1", R, y, { size: 12, bold: true, color: PINE });
  y -= 14;
  text(doc, `Maitama Congregation  ·  ${d.monthLabel}`, L, y, { size: 8.5, color: SOFT });
  y -= 12;
  rule(doc, L, R, y, 1, INK);
  y -= 26;

  text(doc, "Active publishers", L, y, { size: 9 });
  textRight(doc, String(d.activePublishers), R, y, { size: 10, bold: true });
  y -= 8;
  text(doc, "Publishers on file marked active or irregular at the time of this report.", L, y - 2, { size: 7.5, color: SOFT });
  y -= 26;

  const c = { label: L, reports: L + 250, studies: L + 350, hours: R };
  band(doc, L, y - 6, R - L, 18);
  text(doc, "", c.label, y, { size: 7.5 });
  textRight(doc, "Number of reports", c.reports + 40, y, { size: 7.5, bold: true, color: SOFT });
  textRight(doc, "Bible studies", c.studies + 40, y, { size: 7.5, bold: true, color: SOFT });
  textRight(doc, "Hours", c.hours, y, { size: 7.5, bold: true, color: SOFT });
  y -= 10;
  rule(doc, L, R, y, 0.7, INK);
  y -= 16;

  const line = (label: string, reports: number, studies: number, hours: number | null, bold = false) => {
    text(doc, label, c.label, y, { size: 9, bold });
    textRight(doc, String(reports), c.reports + 40, y, { size: 9, bold });
    textRight(doc, String(studies), c.studies + 40, y, { size: 9, bold });
    textRight(doc, hours === null ? "—" : String(hours), c.hours, y, { size: 9, bold, color: hours === null ? SOFT : INK });
    y -= 6;
    rule(doc, L, R, y, 0.4);
    y -= 16;
  };
  line("Publishers", d.rows.publishers.reports, d.rows.publishers.studies, null);
  line("Auxiliary pioneers", d.rows.auxiliary.reports, d.rows.auxiliary.studies, d.rows.auxiliary.hours);
  line("Regular pioneers", d.rows.regular.reports, d.rows.regular.studies, d.rows.regular.hours);
  line("Special pioneers and field missionaries", d.rows.special.reports, d.rows.special.studies, d.rows.special.hours);
  y -= 2;
  line("Totals", d.totals.reports, d.totals.studies, d.totals.hours, true);

  if (d.memorial) {
    y -= 10;
    text(doc, "Memorial", L, y, { size: 9, bold: true });
    y -= 16;
    text(doc, "Attendance", c.label, y, { size: 9 });
    textRight(doc, String(d.memorial.attendance), R, y, { size: 9 });
    y -= 14;
    text(doc, "Partakers", c.label, y, { size: 9 });
    textRight(doc, String(d.memorial.partakers), R, y, { size: 9 });
    y -= 14;
  }

  y -= 20;
  text(doc, "Hours are totalled for pioneers only. Publishers report participation and Bible studies.", L, y, { size: 7.5, color: SOFT });
  y -= 11;
  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, y, { size: 7.5, color: SOFT });

  return doc.pdf.save();
}
