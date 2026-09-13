import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { serviceYearMonths, serviceYearLabel } from "@/lib/service-year";
import { formatDate, APPOINTMENT_LABELS, PIONEER_LABELS } from "@/lib/format";
import { newDoc, text, textRight, rule, band, INK, SOFT, PINE } from "@/lib/pdf/kit";
import { getTemplate } from "@/lib/forms";
import { fillS21, type S21FillData } from "@/lib/pdf/fill";
import { PDFDocument } from "pdf-lib";

type PublisherWithGroup = NonNullable<Awaited<ReturnType<typeof loadPublisher>>>;

function loadPublisher(id: string) {
  return prisma.publisher.findUnique({ where: { id }, include: { group: true } });
}

/**
 * Congregation Publisher Record, one card per publisher. When the official
 * S-21 has been uploaded under Accounts → Official forms it is filled in;
 * otherwise the built-in layout is drawn. `template` lets a batch reuse one
 * copy of the form instead of re-reading it for every publisher.
 */
export async function buildS21(
  publisherId: string,
  serviceYear: number,
  template?: Buffer | null,
): Promise<Uint8Array> {
  const publisher = await loadPublisher(publisherId);
  if (!publisher) throw new Error("No such publisher.");
  const form = template === undefined ? await getTemplate("S21") : template;
  if (form) return fillS21(form, await s21FillData(publisher, serviceYear, form));
  return drawS21(publisher, serviceYear);
}

/**
 * The three combined Publisher Records the handbook calls for, by standing:
 * regular and special pioneers (plus field missionaries), auxiliary pioneers,
 * and everyone else.
 */
export type S21Category = "pioneers" | "auxiliary" | "others";

export const CATEGORY_WHERE: Record<S21Category, Prisma.PublisherWhereInput> = {
  pioneers: { pioneerStatus: { in: ["REGULAR", "SPECIAL"] } },
  auxiliary: { pioneerStatus: "AUXILIARY" },
  others: { pioneerStatus: "NONE" },
};

/**
 * Every card in one PDF, for printing or filing. Active and irregular
 * publishers, optionally one group only and optionally one of the three
 * combined-record categories, in surname order.
 */
export async function buildS21Batch(
  serviceYear: number,
  groupId?: string | null,
  category?: S21Category | null,
): Promise<{ pdf: Uint8Array; count: number }> {
  const publishers = await prisma.publisher.findMany({
    where: {
      status: { in: ["ACTIVE", "IRREGULAR"] },
      ...(groupId ? { groupId } : {}),
      ...(category ? CATEGORY_WHERE[category] : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true },
  });
  const template = await getTemplate("S21");
  const merged = await PDFDocument.create();
  for (const p of publishers) {
    const bytes = await buildS21(p.id, serviceYear, template);
    const doc = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return { pdf: await merged.save(), count: publishers.length };
}

/** How many twelve-row tables the uploaded form has: fill that many consecutive service years. */
async function tableCount(form: Buffer): Promise<number> {
  const { collectWidgets, groupRows, pagesOf } = await import("@/lib/pdf/fields");
  const pdf = await PDFDocument.load(form, { ignoreEncryption: true, updateMetadata: false });
  const widgets = collectWidgets(pdf);
  let n = 0;
  for (const page of pagesOf(widgets)) {
    const rows = groupRows(widgets.filter((w) => w.page === page)).filter(
      (r) => r.filter((w) => w.kind === "check").length >= 2 && r.filter((w) => w.kind === "text").length >= 2,
    );
    n += Math.floor(rows.length / 12);
  }
  return Math.max(1, n);
}

async function s21FillData(publisher: PublisherWithGroup, serviceYear: number, form: Buffer): Promise<S21FillData> {
  const tables = await tableCount(form);
  const years: S21FillData["years"] = [];
  for (let t = 0; t < tables; t++) {
    const sy = serviceYear + t;
    const months = serviceYearMonths(sy);
    const reports = await prisma.serviceReport.findMany({
      where: { publisherId: publisher.id, OR: months.map((m) => ({ year: m.year, month: m.month })) },
    });
    const byKey = new Map(reports.map((r) => [`${r.year}-${r.month}`, r]));
    let totalHours = 0;
    years.push({
      serviceYear: sy,
      months: months.map((m) => {
        const r = byKey.get(`${m.year}-${m.month}`);
        if (!r) return null;
        if (r.hours) totalHours += r.hours;
        return { shared: r.outcome === "SHARED", studies: r.bibleStudies, aux: r.pioneerStatusUsed === "AUXILIARY", hours: r.hours, remarks: r.remarks };
      }),
      totalHours,
    });
  }
  return {
    name: `${publisher.firstName} ${publisher.lastName}`,
    dateOfBirth: formatDate(publisher.dateOfBirth) === "—" ? "" : formatDate(publisher.dateOfBirth),
    baptismDate: formatDate(publisher.baptismDate) === "—" ? "" : formatDate(publisher.baptismDate),
    gender: publisher.gender,
    anointed: publisher.isAnointed,
    appointment: publisher.appointment,
    pioneerStatus: publisher.pioneerStatus,
    years,
  };
}

async function drawS21(publisher: PublisherWithGroup, serviceYear: number): Promise<Uint8Array> {
  const publisherId = publisher.id;
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
    } else if (r.outcome === "NO_REPORT") {
      text(doc, "no report", cols[1].x, y, { size: 8, color: SOFT });
      if (r.remarks) text(doc, r.remarks, cols[5].x, y, { size: 8, maxWidth: cols[5].w });
    } else {
      monthsReported++;
      const shared = r.outcome === "SHARED";
      text(doc, shared ? "Yes" : "No", cols[1].x, y, { size: 8.5 });
      if (shared) monthsShared++;
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
