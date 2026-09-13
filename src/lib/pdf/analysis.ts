import "server-only";
import { prisma } from "@/lib/prisma";
import { periodLabel, type Analysis } from "@/lib/analysis";
import { formatDate } from "@/lib/format";
import { newDoc, text, textRight, rule, band, INK, SOFT, PINE } from "@/lib/pdf/kit";

type Col = { label: string; w: number; align?: "right" };
type Cell = string | number;

/** The analysis as a printable report: compiled summary, by month, by group, by publisher. */
export async function buildAnalysisPdf(a: Analysis, groupId?: string | null): Promise<Uint8Array> {
  const group = groupId
    ? await prisma.serviceGroup.findUnique({ where: { id: groupId }, select: { number: true, name: true } })
    : null;
  const single = a.from.year === a.to.year && a.from.month === a.to.month;
  const title = single ? periodLabel(a.from) : `${periodLabel(a.from)} to ${periodLabel(a.to)}`;

  const doc = await newDoc("landscape");
  const L = 40;
  const R = doc.width - 40;
  const bottom = 50;
  let y = doc.height - 46;

  const header = (first: boolean) => {
    text(doc, "Field Service Report", L, y, { size: first ? 15 : 11, bold: true });
    textRight(doc, `Maitama Congregation${group ? ` · Group ${group.number}` : ""} · ${title}`, R, y, { size: 8.5, color: SOFT });
    y -= first ? 14 : 10;
    rule(doc, L, R, y, 1, INK);
    y -= 20;
  };
  const ensure = (needed: number) => {
    if (y - needed < bottom) {
      doc.page = doc.pdf.addPage([doc.width, doc.height]);
      y = doc.height - 46;
      header(false);
    }
  };
  const heading = (label: string) => {
    ensure(40);
    band(doc, L, y - 5, R - L, 16);
    text(doc, label, L + 4, y, { size: 8, bold: true, color: PINE });
    y -= 22;
  };
  const table = (cols: Col[], rows: Cell[][], boldLast = false) => {
    const xs: number[] = [];
    let x = L;
    for (const c of cols) {
      xs.push(x);
      x += c.w;
    }
    ensure(30);
    cols.forEach((c, i) => {
      if (c.align === "right") textRight(doc, c.label, xs[i] + c.w - 4, y, { size: 7, bold: true, color: SOFT });
      else text(doc, c.label, xs[i], y, { size: 7, bold: true, color: SOFT });
    });
    y -= 6;
    rule(doc, L, R, y, 0.7, INK);
    y -= 12;
    rows.forEach((r, ri) => {
      ensure(14);
      const bold = boldLast && ri === rows.length - 1;
      if (bold) band(doc, L, y - 4, R - L, 14);
      r.forEach((v, i) => {
        const s = v === 0 ? "—" : String(v);
        if (cols[i].align === "right") textRight(doc, s, xs[i] + cols[i].w - 4, y, { size: 8, bold });
        else text(doc, s, xs[i], y, { size: 8, bold, maxWidth: cols[i].w - 6 });
      });
      y -= 5;
      rule(doc, L, R, y, 0.3);
      y -= 10;
    });
    y -= 8;
  };
  const dash = (n: number): Cell => (n ? n : "—");

  header(true);
  const t = a.totals;
  heading("Compiled summary");
  const summaryRows: Cell[][] = [
    ["Regular pioneers (RP)", t.regular.reports, t.regular.hours, t.regular.studies],
  ];
  if (t.special.reports) summaryRows.push(["Special pioneers / field missionaries", t.special.reports, t.special.hours, t.special.studies]);
  summaryRows.push(
    ["Auxiliary pioneers (AUX)", t.auxiliary.reports, t.auxiliary.hours, t.auxiliary.studies],
    ["Publishers (P)", t.publishers.reports, "—", t.publishers.studies],
    ["Reported but did not preach", t.didNotPreach, "—", "—"],
    ["No report received", t.noReport, "—", "—"],
    ["Late reports received", t.lateReceived, "—", "—"],
    ["TOTAL", t.regular.reports + t.special.reports + t.auxiliary.reports + t.publishers.reports, t.totalHours, t.totalStudies],
  );
  table(
    [{ label: "Category", w: 260 }, { label: "Reports", w: 90, align: "right" }, { label: "Hours", w: 90, align: "right" }, { label: "Bible studies", w: 100, align: "right" }],
    summaryRows,
    true,
  );

  if (!single) {
    heading("By month");
    table(
      [
        { label: "Month", w: 100 }, { label: "On file", w: 52, align: "right" }, { label: "Active", w: 48, align: "right" },
        { label: "No preach", w: 56, align: "right" }, { label: "No report", w: 56, align: "right" },
        { label: "RP", w: 44, align: "right" }, { label: "RP hrs", w: 50, align: "right" }, { label: "AUX", w: 44, align: "right" },
        { label: "AUX hrs", w: 50, align: "right" }, { label: "P", w: 40, align: "right" }, { label: "Hours", w: 52, align: "right" },
        { label: "Studies", w: 52, align: "right" }, { label: "Late", w: 44, align: "right" },
      ],
      [
        ...a.months.map((m): Cell[] => [
          m.label, dash(m.onFile), dash(m.active), dash(m.didNotPreach), dash(m.noReport),
          dash(m.regular.reports + m.special.reports), dash(m.regular.hours + m.special.hours),
          dash(m.auxiliary.reports), dash(m.auxiliary.hours), dash(m.publishers.reports), dash(m.totalHours), dash(m.totalStudies), dash(m.lateReceived),
        ]),
        [
          "Total", t.onFile, t.activeAverage, t.didNotPreach, t.noReport,
          t.regular.reports + t.special.reports, t.regular.hours + t.special.hours,
          t.auxiliary.reports, t.auxiliary.hours, t.publishers.reports, t.totalHours, t.totalStudies, t.lateReceived,
        ],
      ],
      true,
    );
  }

  if (!groupId) {
    heading("By group");
    table(
      [
        { label: "Group", w: 160 }, { label: "Members", w: 60, align: "right" }, { label: "RP", w: 50, align: "right" },
        { label: "RP hrs", w: 60, align: "right" }, { label: "AUX", w: 50, align: "right" }, { label: "AUX hrs", w: 60, align: "right" },
        { label: "P", w: 50, align: "right" }, { label: "Hours", w: 60, align: "right" }, { label: "Studies", w: 60, align: "right" },
      ],
      a.groups.map((g): Cell[] => [
        g.number ? `${g.number} — ${g.name}` : g.name, g.members, dash(g.regular.reports + g.special.reports), dash(g.regular.hours + g.special.hours),
        dash(g.auxiliary.reports), dash(g.auxiliary.hours), dash(g.publishers.reports), dash(g.totalHours), dash(g.totalStudies),
      ]),
    );
  }

  heading(group ? `Publishers in Group ${group.number}` : "By publisher");
  table(
    [
      { label: "S/N", w: 34, align: "right" }, { label: "Name", w: 200 }, { label: "Group", w: 50 }, { label: "Standing", w: 52 },
      { label: "On file", w: 55, align: "right" }, { label: "Active", w: 55, align: "right" },
      { label: "No preach", w: 56, align: "right" }, { label: "No report", w: 56, align: "right" },
      { label: "AUX months", w: 60, align: "right" },
      { label: "Hours", w: 60, align: "right" }, { label: "BS", w: 50, align: "right" },
    ],
    a.publishers.map((p, i): Cell[] => [
      i + 1, p.name, p.group, p.standing, p.monthsOnFile, p.monthsActive,
      dash(p.monthsDidNotPreach), dash(p.monthsNoReport), dash(p.auxMonths),
      p.hours || (p.monthsActive ? "YES" : "—"), dash(p.studies),
    ]),
  );

  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, 30, { size: 7.5, color: SOFT });
  return doc.pdf.save();
}
