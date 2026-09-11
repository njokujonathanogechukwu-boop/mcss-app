import "server-only";
import { prisma } from "@/lib/prisma";
import { serviceYearMonths, serviceYearLabel } from "@/lib/service-year";
import { formatDate, APPOINTMENT_LABELS, PIONEER_LABELS } from "@/lib/format";
import { newDoc, text, textRight, rule, band, INK, SOFT, PINE } from "@/lib/pdf/kit";

/** Congregation Publisher Record — one card per publisher per service year. */
export async function buildS21(publisherId: string, serviceYear: number): Promise<Uint8Array> {
  const publisher = await prisma.publisher.findUniqueOrThrow({
    where: { id: publisherId },
    include: { group: true },
  });

  const months = serviceYearMonths(serviceYear);
  const reports = await prisma.serviceReport.findMany({
    where: {
      publisherId,
      OR: months.map((m) => ({ year: m.year, month: m.month })),
    },
  });
  const byKey = new Map(reports.map((r) => [`${r.year}-${r.month}`, r]));

  const doc = await newDoc("portrait");
  const L = 42;
  const R = doc.width - 42;
  let y = doc.height - 54;

  text(doc, "Congregation Publisher Record", L, y, { size: 15, bold: true });
  textRight(doc, "S-21", R, y, { size: 12, bold: true, color: PINE });
  y -= 14;
  text(doc, `Maitama Congregation  ·  Service year ${serviceYearLabel(serviceYear)}`, L, y, {
    size: 8.5,
    color: SOFT,
  });
  y -= 12;
  rule(doc, L, R, y, 1, INK);
  y -= 22;

  // Identity block, two columns
  const col2 = L + (R - L) / 2;
  const field = (x: number, label: string, value: string, dy: number) => {
    text(doc, label, x, y - dy, { size: 7.5, color: SOFT });
    text(doc, value || "—", x + 96, y - dy, { size: 9, bold: false, maxWidth: (R - L) / 2 - 104 });
  };

  field(L, "Name", `${publisher.lastName}, ${publisher.firstName}`, 0);
  field(col2, "Service group", publisher.group ? `${publisher.group.number} — ${publisher.group.name}` : "Unassigned", 0);
  field(L, "Date of birth", formatDate(publisher.dateOfBirth), 15);
  field(col2, "Appointment", APPOINTMENT_LABELS[publisher.appointment], 15);
  field(L, "Date of baptism", formatDate(publisher.baptismDate), 30);
  field(col2, "Pioneer", PIONEER_LABELS[publisher.pioneerStatus], 30);
  field(L, "Sex", publisher.gender === "MALE" ? "Male" : "Female", 45);
  field(col2, "Hope", publisher.isAnointed ? "Anointed" : "Other sheep", 45);

  y -= 66;
  rule(doc, L, R, y, 0.5);
  y -= 24;

  // Ledger
  const cols = [
    { label: "Month", x: L, w: 96, align: "left" as const },
    { label: "Shared", x: L + 100, w: 52, align: "left" as const },
    { label: "Bible studies", x: L + 158, w: 70, align: "right" as const },
    { label: "Aux. pioneer", x: L + 236, w: 68, align: "left" as const },
    { label: "Hours", x: L + 312, w: 46, align: "right" as const },
    { label: "Remarks", x: L + 366, w: R - (L + 366), align: "left" as const },
  ];

  band(doc, L, y - 6, R - L, 18);
  for (const c of cols) {
    if (c.align === "right") textRight(doc, c.label, c.x + c.w, y, { size: 7.5, bold: true, color: SOFT });
    else text(doc, c.label, c.x, y, { size: 7.5, bold: true, color: SOFT });
  }
  y -= 10;
  rule(doc, L, R, y, 0.7, INK);
  y -= 15;

  let totalStudies = 0;
  let totalHours = 0;
  let monthsShared = 0;
  let monthsReported = 0;

  for (const m of months) {
    const r = byKey.get(`${m.year}-${m.month}`);
    text(doc, m.label, cols[0].x, y, { size: 8.5 });

    if (!r) {
      text(doc, "not reported", cols[1].x, y, { size: 8, color: SOFT });
    } else {
      monthsReported++;
      text(doc, r.sharedInMinistry ? "Yes" : "No", cols[1].x, y, { size: 8.5 });
      if (r.sharedInMinistry) monthsShared++;
      textRight(doc, String(r.bibleStudies), cols[2].x + cols[2].w, y, { size: 8.5 });
      totalStudies += r.bibleStudies;
      text(doc, r.pioneerStatusUsed === "AUXILIARY" ? "Yes" : "", cols[3].x, y, { size: 8.5 });
      if (r.hours != null) {
        textRight(doc, String(r.hours), cols[4].x + cols[4].w, y, { size: 8.5 });
        totalHours += r.hours;
      } else {
        textRight(doc, "—", cols[4].x + cols[4].w, y, { size: 8.5, color: SOFT });
      }
      if (r.remarks) text(doc, r.remarks, cols[5].x, y, { size: 8, maxWidth: cols[5].w });
    }

    y -= 6;
    rule(doc, L, R, y, 0.4);
    y -= 15;
  }

  y -= 4;
  rule(doc, L, R, y + 10, 0.7, INK);
  text(doc, "Service year totals", cols[0].x, y, { size: 8.5, bold: true });
  textRight(doc, String(totalStudies), cols[2].x + cols[2].w, y, { size: 8.5, bold: true });
  textRight(doc, publisher.pioneerStatus === "NONE" && totalHours === 0 ? "—" : String(totalHours),
    cols[4].x + cols[4].w, y, { size: 8.5, bold: true });
  text(doc, `${monthsShared} of ${monthsReported} reported months active`, cols[5].x, y, { size: 8 });

  y -= 30;
  text(
    doc,
    "Hours are recorded for pioneers only. Publishers report participation and Bible studies.",
    L,
    y,
    { size: 7.5, color: SOFT },
  );
  y -= 11;
  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, y, {
    size: 7.5,
    color: SOFT,
  });

  return doc.pdf.save();
}
