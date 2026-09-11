import "server-only";
import { prisma } from "@/lib/prisma";
import { serviceYearMonths, serviceYearLabel } from "@/lib/service-year";
import { formatDate, APPOINTMENT_LABELS } from "@/lib/format";
import { newDoc, text, textRight, rule, band, INK, SOFT, PINE } from "@/lib/pdf/kit";

/** Field service analysis for one group across a service year. */
export async function buildGroupAnalysis(groupId: string, serviceYear: number): Promise<Uint8Array> {
  const group = await prisma.serviceGroup.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      overseer: true,
      assistant: true,
      members: { where: { status: { in: ["ACTIVE", "IRREGULAR"] } }, orderBy: [{ lastName: "asc" }] },
    },
  });

  const months = serviceYearMonths(serviceYear);
  const reports = await prisma.serviceReport.findMany({
    where: {
      publisherId: { in: group.members.map((m) => m.id) },
      OR: months.map((m) => ({ year: m.year, month: m.month })),
    },
  });

  const doc = await newDoc("landscape");
  const L = 40;
  const R = doc.width - 40;
  let y = doc.height - 48;

  text(doc, `Group ${group.number} — ${group.name}`, L, y, { size: 15, bold: true });
  textRight(doc, `Service year ${serviceYearLabel(serviceYear)}`, R, y, { size: 10, color: PINE, bold: true });
  y -= 14;
  const overseer = group.overseer ? `${group.overseer.firstName} ${group.overseer.lastName}` : "not assigned";
  const assistant = group.assistant ? `${group.assistant.firstName} ${group.assistant.lastName}` : "not assigned";
  text(doc, `Overseer: ${overseer}   ·   Assistant: ${assistant}   ·   ${group.members.length} publishers`, L, y, {
    size: 8.5, color: SOFT,
  });
  y -= 12;
  rule(doc, L, R, y, 1, INK);
  y -= 24;

  const nameW = 170;
  const cellW = (R - L - nameW - 60) / 12;

  band(doc, L, y - 6, R - L, 18);
  text(doc, "Publisher", L, y, { size: 7.5, bold: true, color: SOFT });
  months.forEach((m, i) => {
    textRight(doc, m.short, L + nameW + cellW * (i + 1) - 4, y, { size: 7, bold: true, color: SOFT });
  });
  textRight(doc, "Active", R, y, { size: 7.5, bold: true, color: SOFT });
  y -= 10;
  rule(doc, L, R, y, 0.7, INK);
  y -= 14;

  for (const member of group.members) {
    text(doc, `${member.lastName}, ${member.firstName}`, L, y, { size: 8, maxWidth: nameW - 56 });
    text(doc, APPOINTMENT_LABELS[member.appointment] === "Publisher" ? "" : APPOINTMENT_LABELS[member.appointment],
      L + nameW - 54, y, { size: 6.5, color: SOFT, maxWidth: 50 });

    let active = 0;
    months.forEach((m, i) => {
      const r = reports.find(
        (x) => x.publisherId === member.id && x.year === m.year && x.month === m.month,
      );
      const x = L + nameW + cellW * (i + 1) - 4;
      if (!r) {
        textRight(doc, "·", x, y, { size: 8, color: SOFT });
      } else if (!r.sharedInMinistry) {
        textRight(doc, "0", x, y, { size: 8, color: SOFT });
      } else {
        active++;
        textRight(doc, r.hours != null ? String(r.hours) : "✓", x, y, { size: 8 });
      }
    });
    textRight(doc, `${active}/12`, R, y, { size: 8, bold: true });

    y -= 6;
    rule(doc, L, R, y, 0.35);
    y -= 14;

    if (y < 60) break;
  }

  text(doc, "✓ shared in the ministry · number = hours reported by pioneers · · = no report on file", L, 40, {
    size: 7, color: SOFT,
  });
  textRight(doc, `Generated ${formatDate(new Date())}`, R, 40, { size: 7, color: SOFT });

  return doc.pdf.save();
}
