import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate, displayName, APPOINTMENT_LABELS } from "@/lib/format";
import { newDoc, text, textRight, rule, band, INK, SOFT, PINE, wrap } from "@/lib/pdf/kit";

const CATEGORY_LABELS: Record<string, string> = {
  CONGREGATION: "Congregation assignments",
  MEETING: "Meeting duties",
  OTHER: "Other",
};

/** Privileges and assignments: first grouped by privilege, then by publisher. */
export async function buildPrivileges(): Promise<Uint8Array> {
  const privileges = await prisma.privilege.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      holders: {
        where: { endDate: null },
        include: { publisher: { select: { id: true, firstName: true, lastName: true, appointment: true, group: { select: { number: true } } } } },
        orderBy: [{ publisher: { lastName: "asc" } }],
      },
    },
  });

  const doc = await newDoc("portrait");
  const L = 42;
  const R = doc.width - 42;
  const bottom = 60;
  let y = doc.height - 54;

  const header = (first: boolean) => {
    text(doc, "Privileges and Assignments", L, y, { size: first ? 15 : 11, bold: true });
    textRight(doc, "Maitama Congregation", R, y, { size: 8.5, color: SOFT });
    y -= first ? 14 : 10;
    if (first) {
      text(doc, `As at ${formatDate(new Date())}`, L, y, { size: 8.5, color: SOFT });
      y -= 12;
    }
    rule(doc, L, R, y, 1, INK);
    y -= 22;
  };
  const ensure = (needed: number) => {
    if (y - needed < bottom) {
      doc.page = doc.pdf.addPage([doc.width, doc.height]);
      y = doc.height - 54;
      header(false);
    }
  };

  header(true);

  // ---- Part 1: by privilege
  let lastCategory = "";
  for (const p of privileges) {
    if (p.category !== lastCategory) {
      ensure(40);
      band(doc, L, y - 5, R - L, 16);
      text(doc, CATEGORY_LABELS[p.category] ?? p.category, L + 4, y, { size: 8, bold: true, color: PINE });
      y -= 22;
      lastCategory = p.category;
    }
    ensure(30 + p.holders.length * 12);
    text(doc, p.name, L, y, { size: 9.5, bold: true });
    if (p.description) {
      const lines = wrap(doc.regular, p.description, 7.5, R - L - 160);
      lines.slice(0, 2).forEach((line, i) => text(doc, line, L + 160, y - i * 9, { size: 7.5, color: SOFT }));
    }
    y -= 13;
    if (p.holders.length === 0) {
      text(doc, "Nobody assigned", L + 12, y, { size: 8, color: SOFT });
      y -= 12;
    }
    for (const h of p.holders) {
      text(doc, displayName(h.publisher), L + 12, y, { size: 8.5 });
      const meta = [
        h.publisher.group ? `Group ${h.publisher.group.number}` : null,
        h.publisher.appointment !== "PUBLISHER" ? APPOINTMENT_LABELS[h.publisher.appointment] : null,
        h.startDate ? `since ${formatDate(h.startDate)}` : null,
      ].filter(Boolean).join(" · ");
      if (meta) text(doc, meta, L + 200, y, { size: 7.5, color: SOFT });
      if (h.notes) text(doc, h.notes, L + 360, y, { size: 7.5, color: SOFT, maxWidth: R - (L + 360) });
      y -= 12;
    }
    y -= 6;
    rule(doc, L, R, y + 3, 0.4);
    y -= 8;
  }

  // ---- Part 2: by publisher
  const byPublisher = new Map<string, { name: string; group: number | null; items: string[] }>();
  for (const p of privileges) {
    for (const h of p.holders) {
      const key = h.publisher.id;
      const entry = byPublisher.get(key) ?? { name: `${h.publisher.lastName}, ${h.publisher.firstName}`, group: h.publisher.group?.number ?? null, items: [] };
      entry.items.push(p.name);
      byPublisher.set(key, entry);
    }
  }
  const people = [...byPublisher.values()].sort((a, b) => a.name.localeCompare(b.name));

  ensure(60);
  y -= 6;
  band(doc, L, y - 5, R - L, 16);
  text(doc, "By publisher", L + 4, y, { size: 8, bold: true, color: PINE });
  y -= 24;

  for (const person of people) {
    const lines = wrap(doc.regular, person.items.join(", "), 8, R - (L + 190));
    ensure(12 * Math.max(1, lines.length) + 6);
    text(doc, person.name, L, y, { size: 8.5, bold: true, maxWidth: 140 });
    if (person.group) text(doc, `Group ${person.group}`, L + 148, y, { size: 7.5, color: SOFT });
    lines.forEach((line, i) => text(doc, line, L + 190, y - i * 11, { size: 8 }));
    y -= 11 * lines.length + 5;
    rule(doc, L, R, y + 3, 0.3);
    y -= 6;
  }

  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, 36, { size: 7.5, color: SOFT });
  return doc.pdf.save();
}

