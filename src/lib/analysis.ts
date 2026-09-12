import { prisma } from "@/lib/prisma";
import { MONTH_NAMES, MONTH_SHORT, currentServiceYear, serviceYearMonths } from "@/lib/service-year";

/**
 * Field service analysis over any run of months, optionally one group.
 *
 * A report's category is the pioneer standing recorded on it, so a
 * publisher who auxiliary pioneered in March is an auxiliary pioneer for
 * March and a publisher for April. Hours are summed wherever they were
 * recorded, which for auxiliary pioneers is the month they served.
 *
 * "Late reports" are reports entered in a month for an earlier month,
 * which the secretary's compiled sheet tracks separately.
 */

export type Period = { year: number; month: number };

export type Category = { reports: number; hours: number; studies: number };

export type MonthRow = {
  year: number;
  month: number;
  label: string;
  short: string;
  onFile: number;
  active: number;
  publishers: Category;
  auxiliary: Category;
  regular: Category;
  special: Category;
  totalHours: number;
  totalStudies: number;
  lateReceived: number;
};

export type GroupRow = {
  id: string | null;
  number: number | null;
  name: string;
  members: number;
  publishers: Category;
  auxiliary: Category;
  regular: Category;
  special: Category;
  totalHours: number;
  totalStudies: number;
};

export type PublisherRow = {
  id: string;
  name: string;
  group: string;
  standing: string;
  monthsOnFile: number;
  monthsActive: number;
  hours: number;
  studies: number;
  auxMonths: number;
};

export type Analysis = {
  from: Period;
  to: Period;
  months: MonthRow[];
  groups: GroupRow[];
  publishers: PublisherRow[];
  totals: {
    onFile: number;
    activeAverage: number;
    activePublishers: number;
    publishers: Category;
    auxiliary: Category;
    regular: Category;
    special: Category;
    totalHours: number;
    totalStudies: number;
    lateReceived: number;
  };
};

const empty = (): Category => ({ reports: 0, hours: 0, studies: 0 });
const add = (c: Category, r: { hours: number | null; bibleStudies: number }) => {
  c.reports++;
  c.hours += r.hours ?? 0;
  c.studies += r.bibleStudies;
};

export function periodKey(p: Period) {
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

export function parsePeriod(text: string | undefined): Period | null {
  const m = (text ?? "").match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

export function periodsBetween(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  let y = from.year;
  let m = from.month;
  while (y < to.year || (y === to.year && m <= to.month)) {
    out.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 120) break; // ten years is plenty for one query
  }
  return out;
}

export function periodLabel(p: Period) {
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** Default window: the current service year so far. */
export function defaultWindow(): { from: Period; to: Period } {
  const months = serviceYearMonths(currentServiceYear());
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    from: { year: months[0].year, month: months[0].month },
    to: { year: last.getFullYear(), month: last.getMonth() + 1 },
  };
}

export async function analyse(from: Period, to: Period, groupId?: string | null): Promise<Analysis> {
  const periods = periodsBetween(from, to);
  if (periods.length === 0) periods.push(from);

  const [reports, publishers, groups] = await Promise.all([
    prisma.serviceReport.findMany({
      where: {
        OR: periods.map((p) => ({ year: p.year, month: p.month })),
        ...(groupId ? { publisher: { groupId } } : {}),
      },
      select: {
        publisherId: true, year: true, month: true, sharedInMinistry: true, bibleStudies: true,
        hours: true, pioneerStatusUsed: true, createdAt: true,
      },
    }),
    prisma.publisher.findMany({
      where: { ...(groupId ? { groupId } : {}) },
      select: { id: true, firstName: true, lastName: true, status: true, pioneerStatus: true, groupId: true, group: { select: { number: true, name: true } } },
    }),
    prisma.serviceGroup.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
  ]);

  const publisherById = new Map(publishers.map((p) => [p.id, p]));

  // ---- by month
  const months: MonthRow[] = periods.map((p) => {
    const inMonth = reports.filter((r) => r.year === p.year && r.month === p.month);
    const row: MonthRow = {
      year: p.year, month: p.month, label: periodLabel(p), short: `${MONTH_SHORT[p.month - 1]} ${String(p.year).slice(2)}`,
      onFile: inMonth.length, active: 0,
      publishers: empty(), auxiliary: empty(), regular: empty(), special: empty(),
      totalHours: 0, totalStudies: 0, lateReceived: 0,
    };
    for (const r of inMonth) {
      if (!r.sharedInMinistry) continue;
      row.active++;
      const bucket = r.pioneerStatusUsed === "AUXILIARY" ? row.auxiliary : r.pioneerStatusUsed === "REGULAR" ? row.regular : r.pioneerStatusUsed === "SPECIAL" ? row.special : row.publishers;
      add(bucket, r);
      row.totalHours += r.hours ?? 0;
      row.totalStudies += r.bibleStudies;
    }
    // Reports entered during this calendar month that belong to an earlier month.
    const start = new Date(Date.UTC(p.year, p.month - 1, 1));
    const end = new Date(Date.UTC(p.year, p.month, 1));
    row.lateReceived = reports.filter(
      (r) => r.createdAt >= start && r.createdAt < end && (r.year < p.year || (r.year === p.year && r.month < p.month)),
    ).length;
    return row;
  });

  // ---- by group
  const groupRows: GroupRow[] = [...groups.map((g) => ({ id: g.id as string | null, number: g.number as number | null, name: g.name })), { id: null, number: null, name: "No group" }]
    .filter((g) => !groupId || g.id === groupId)
    .map((g) => {
      const members = publishers.filter((p) => p.groupId === g.id && (p.status === "ACTIVE" || p.status === "IRREGULAR")).length;
      const row: GroupRow = { ...g, members, publishers: empty(), auxiliary: empty(), regular: empty(), special: empty(), totalHours: 0, totalStudies: 0 };
      for (const r of reports) {
        if (!r.sharedInMinistry) continue;
        const pub = publisherById.get(r.publisherId);
        if ((pub?.groupId ?? null) !== g.id) continue;
        const bucket = r.pioneerStatusUsed === "AUXILIARY" ? row.auxiliary : r.pioneerStatusUsed === "REGULAR" ? row.regular : r.pioneerStatusUsed === "SPECIAL" ? row.special : row.publishers;
        add(bucket, r);
        row.totalHours += r.hours ?? 0;
        row.totalStudies += r.bibleStudies;
      }
      return row;
    })
    .filter((g) => g.members > 0 || g.totalHours > 0 || g.publishers.reports > 0);

  // ---- by publisher
  const perPublisher = new Map<string, PublisherRow>();
  for (const r of reports) {
    const pub = publisherById.get(r.publisherId);
    if (!pub) continue;
    let row = perPublisher.get(pub.id);
    if (!row) {
      row = {
        id: pub.id, name: `${pub.lastName}, ${pub.firstName}`,
        group: pub.group ? `${pub.group.number}` : "—",
        standing: pub.pioneerStatus === "REGULAR" ? "RP" : pub.pioneerStatus === "SPECIAL" ? "SP" : "P",
        monthsOnFile: 0, monthsActive: 0, hours: 0, studies: 0, auxMonths: 0,
      };
      perPublisher.set(pub.id, row);
    }
    row.monthsOnFile++;
    if (r.sharedInMinistry) {
      row.monthsActive++;
      row.hours += r.hours ?? 0;
      row.studies += r.bibleStudies;
      if (r.pioneerStatusUsed === "AUXILIARY") row.auxMonths++;
    }
  }
  const publisherRows = [...perPublisher.values()].sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true }) || a.name.localeCompare(b.name));

  // ---- totals
  const sum = (pick: (m: MonthRow) => Category): Category => months.reduce((t, m) => {
    const c = pick(m);
    return { reports: t.reports + c.reports, hours: t.hours + c.hours, studies: t.studies + c.studies };
  }, empty());
  const activeCount = months.filter((m) => m.onFile > 0).length || 1;
  const totals: Analysis["totals"] = {
    onFile: months.reduce((t, m) => t + m.onFile, 0),
    activeAverage: Math.round(months.reduce((t, m) => t + m.active, 0) / activeCount),
    activePublishers: publishers.filter((p) => p.status === "ACTIVE" || p.status === "IRREGULAR").length,
    publishers: sum((m) => m.publishers),
    auxiliary: sum((m) => m.auxiliary),
    regular: sum((m) => m.regular),
    special: sum((m) => m.special),
    totalHours: months.reduce((t, m) => t + m.totalHours, 0),
    totalStudies: months.reduce((t, m) => t + m.totalStudies, 0),
    lateReceived: months.reduce((t, m) => t + m.lateReceived, 0),
  };

  return { from, to, months, groups: groupRows, publishers: publisherRows, totals };
}

/** The analysis as comma-separated text, three tables one after another. */
export function analysisCsv(a: Analysis): string {
  const q = (v: string | number | null) => (typeof v === "number" ? String(v) : `"${String(v ?? "").replace(/"/g, '""')}"`);
  const lines: string[] = [];
  lines.push(["Month", "Reports on file", "Active", "Publishers", "Pub studies", "Aux pioneers", "Aux hours", "Aux studies", "Regular pioneers", "RP hours", "RP studies", "Special", "SP hours", "SP studies", "Total hours", "Total studies", "Late reports received"].map(q).join(","));
  for (const m of a.months) {
    lines.push([m.label, m.onFile, m.active, m.publishers.reports, m.publishers.studies, m.auxiliary.reports, m.auxiliary.hours, m.auxiliary.studies, m.regular.reports, m.regular.hours, m.regular.studies, m.special.reports, m.special.hours, m.special.studies, m.totalHours, m.totalStudies, m.lateReceived].map(q).join(","));
  }
  const t = a.totals;
  lines.push(["Total", t.onFile, t.activeAverage, t.publishers.reports, t.publishers.studies, t.auxiliary.reports, t.auxiliary.hours, t.auxiliary.studies, t.regular.reports, t.regular.hours, t.regular.studies, t.special.reports, t.special.hours, t.special.studies, t.totalHours, t.totalStudies, t.lateReceived].map(q).join(","));
  lines.push("");
  lines.push(["Group", "Members", "Publisher reports", "Pub studies", "Aux reports", "Aux hours", "Aux studies", "RP reports", "RP hours", "RP studies", "Total hours", "Total studies"].map(q).join(","));
  for (const g of a.groups) {
    lines.push([g.number ? `${g.number} - ${g.name}` : g.name, g.members, g.publishers.reports, g.publishers.studies, g.auxiliary.reports, g.auxiliary.hours, g.auxiliary.studies, g.regular.reports, g.regular.hours, g.regular.studies, g.totalHours, g.totalStudies].map(q).join(","));
  }
  lines.push("");
  lines.push(["Publisher", "Group", "Standing", "Months on file", "Months active", "Aux months", "Hours", "Bible studies"].map(q).join(","));
  for (const p of a.publishers) {
    lines.push([p.name, p.group, p.standing, p.monthsOnFile, p.monthsActive, p.auxMonths, p.hours, p.studies].map(q).join(","));
  }
  return lines.join("\r\n");
}
