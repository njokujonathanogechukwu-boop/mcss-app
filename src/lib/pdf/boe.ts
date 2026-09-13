import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, displayName, DECISION_LABELS } from "@/lib/format";
import { newDoc, text, textRight, rule, wrap, INK, SOFT, PINE } from "@/lib/pdf/kit";

export type BoeSummaryItem = {
  agendaItem: string;
  decision: string;
  assignedTo: string | null;
  targetDate: Date | null;
  status: string;
  completedAt: Date | null;
  notes: string | null;
};

/** Every decision reached at one meeting of the body of elders, in the order logged. */
export async function meetingDecisions(date: string): Promise<BoeSummaryItem[]> {
  const rows = await prisma.boeDecision.findMany({
    where: { meetingDate: new Date(`${date}T00:00:00.000Z`) },
    include: { assignedTo: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    agendaItem: r.agendaItem,
    decision: r.decision,
    assignedTo: r.assignedTo ? displayName(r.assignedTo) : null,
    targetDate: r.targetDate,
    status: r.status,
    completedAt: r.completedAt,
    notes: r.notes,
  }));
}

/**
 * A one-page-per-meeting summary of the decisions reached, for sharing with the
 * body of elders. There is no official form for it, so it is always drawn here.
 */
export async function buildBoeSummary(date: string): Promise<Uint8Array> {
  return drawBoeSummary(date, await meetingDecisions(date));
}

export async function drawBoeSummary(date: string, items: BoeSummaryItem[]): Promise<Uint8Array> {

  const doc = await newDoc("portrait");
  const L = 42;
  const R = doc.width - 42;
  const W = R - L;
  let y = doc.height - 54;

  const ensure = (need: number) => {
    if (y >= need) return;
    doc.page = doc.pdf.addPage([doc.width, doc.height]);
    y = doc.height - 54;
  };

  text(doc, "Body of Elders — Meeting Summary", L, y, { size: 15, bold: true, maxWidth: W });
  y -= 14;
  text(doc, `Maitama Congregation  ·  Meeting of ${formatDate(new Date(`${date}T00:00:00.000Z`))}`, L, y, {
    size: 8.5,
    color: SOFT,
  });
  y -= 12;
  rule(doc, L, R, y, 1, INK);
  y -= 26;

  if (items.length === 0) {
    text(doc, "No decisions are recorded for this meeting.", L, y, { size: 9, color: SOFT });
    y -= 20;
  }

  items.forEach((item, n) => {
    const decisionLines = wrap(doc.regular, item.decision, 9, W - 10);
    const notesLines = item.notes ? wrap(doc.regular, item.notes, 8, W - 10) : [];
    ensure(70 + decisionLines.length * 12 + notesLines.length * 10);

    text(doc, `${n + 1}.  ${item.agendaItem}`, L, y, { size: 10, bold: true, maxWidth: W - 90 });
    textRight(doc, DECISION_LABELS[item.status] ?? item.status, R, y, { size: 8, bold: true, color: PINE });
    y -= 7;
    rule(doc, L, R, y, 0.4);
    y -= 14;

    for (const line of decisionLines) {
      text(doc, line, L, y, { size: 9 });
      y -= 12;
    }
    y -= 2;

    const meta = [
      item.assignedTo ? `Carried out by ${item.assignedTo}` : "Not assigned",
      item.targetDate ? `due ${formatDate(item.targetDate)}` : null,
      item.completedAt ? `completed ${formatDate(item.completedAt)}` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");
    text(doc, meta, L, y, { size: 7.5, color: SOFT, maxWidth: W });
    y -= 11;

    for (const line of notesLines) {
      text(doc, line, L, y, { size: 8, color: SOFT });
      y -= 10;
    }
    y -= 10;
  });

  ensure(70);
  rule(doc, L, R, y + 4, 0.7, INK);
  y -= 10;
  text(doc, `${items.length} decision${items.length === 1 ? "" : "s"} recorded at this meeting.`, L, y, {
    size: 8,
    color: SOFT,
  });
  y -= 11;
  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, y, {
    size: 7.5,
    color: SOFT,
  });

  return doc.pdf.save();
}
