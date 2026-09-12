import "server-only";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { newDoc, text, textRight, rule, band, INK, SOFT, PINE, wrap } from "@/lib/pdf/kit";
import type { PrivilegeRole } from "@prisma/client";

const ROLES: PrivilegeRole[] = ["OVERSEER", "ASSISTANT", "SERVANT", "ASSIGNEE"];
const HEADERS = ["DEPARTMENT", "OVERSEER", "ASSISTANT", "SERVANTS", "ASSIGNEES"];

function shortName(p: { firstName: string; lastName: string }) {
  const initial = p.firstName.trim().charAt(0).toUpperCase();
  return (initial ? `${initial}. ${p.lastName}` : p.lastName).toUpperCase();
}

/**
 * Ministerial assignments, laid out as the congregation's sheet: one row
 * per department with overseer, assistant, servants and assignees across.
 */
export async function buildPrivileges(): Promise<Uint8Array> {
  const departments = await prisma.privilege.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      holders: {
        where: { endDate: null },
        include: { publisher: { select: { firstName: true, lastName: true } } },
        orderBy: [{ startDate: "asc" }, { publisher: { lastName: "asc" } }],
      },
    },
  });

  const doc = await newDoc("landscape");
  const L = 36;
  const R = doc.width - 36;
  const bottom = 48;
  let y = doc.height - 44;

  const widths = [150, 140, 140, 165, R - L - 595];
  const xs: number[] = [];
  let x = L;
  for (const w of widths) {
    xs.push(x);
    x += w;
  }

  const header = (first: boolean) => {
    text(doc, "MAITAMA MINISTERIAL ASSIGNMENTS", L, y, { size: first ? 14 : 11, bold: true });
    textRight(doc, `As at ${formatDate(new Date())}`, R, y, { size: 8.5, color: SOFT });
    y -= first ? 16 : 12;
    rule(doc, L, R, y, 1, INK);
    y -= 16;
    band(doc, L, y - 5, R - L, 16);
    HEADERS.forEach((h, i) => text(doc, h, xs[i] + 4, y, { size: 7.5, bold: true, color: PINE }));
    y -= 18;
  };
  header(true);

  for (const d of departments) {
    const cells: string[][] = [
      wrap(doc.bold, d.name.toUpperCase(), 8, widths[0] - 8),
      ...ROLES.map((role) => d.holders.filter((h) => h.role === role).map((h) => shortName(h.publisher))),
    ];
    const lines = Math.max(1, ...cells.map((c) => c.length));
    const height = lines * 11 + 8;
    if (y - height < bottom) {
      doc.page = doc.pdf.addPage([doc.width, doc.height]);
      y = doc.height - 44;
      header(false);
    }
    cells.forEach((c, i) => {
      if (c.length === 0) {
        text(doc, "—", xs[i] + 4, y, { size: 8, color: SOFT });
        return;
      }
      c.forEach((line, n) => text(doc, line, xs[i] + 4, y - n * 11, { size: 8, bold: i === 0, maxWidth: widths[i] - 8 }));
    });
    y -= height - 4;
    rule(doc, L, R, y + 2, 0.4);
    y -= 10;
  }

  text(doc, `Generated ${formatDate(new Date())} · Maitama Congregation Secretary System`, L, 30, { size: 7.5, color: SOFT });
  return doc.pdf.save();
}
