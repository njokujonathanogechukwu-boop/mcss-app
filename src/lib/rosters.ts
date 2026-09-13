import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { displayName, formatDate, APPOINTMENT_LABELS, PIONEER_LABELS, STATUS_LABELS } from "@/lib/format";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  appointment: string;
  pioneerStatus: string;
  isBaptized: boolean;
  baptismDate: Date | null;
  status: string;
  phone: string | null;
  email: string | null;
};

type Group = {
  number: number;
  name: string;
  overseerId: string | null;
  assistantId: string | null;
  members: Member[];
};

/**
 * Roster order the congregation reads: the overseer first, then his assistant,
 * then ministerial servants, then pioneers, then the publishers — each block
 * alphabetical inside itself.
 */
function rankOf(m: Member, g: Group): number {
  if (g.overseerId === m.id) return 0;
  if (g.assistantId === m.id) return 1;
  if (m.appointment === "MINISTERIAL_SERVANT") return 2;
  if (m.pioneerStatus === "REGULAR" || m.pioneerStatus === "SPECIAL") return 3;
  return 4;
}

function roleOf(m: Member, g: Group): string {
  switch (rankOf(m, g)) {
    case 0:
      return "Group overseer";
    case 1:
      return "Assistant overseer";
    case 2:
      return "Ministerial servant";
    case 3:
      return m.pioneerStatus === "SPECIAL" ? "Special pioneer" : "Regular pioneer";
    default:
      return "Publisher";
  }
}

/** One worksheet per active group, rosters in standing order. */
export async function buildRosterWorkbook(includeContact: boolean): Promise<Uint8Array> {
  const groups = await prisma.serviceGroup.findMany({
    where: { active: true },
    include: {
      members: { where: { status: { in: ["ACTIVE", "IRREGULAR"] } } },
    },
    orderBy: { number: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Maitama Congregation Secretary System";
  workbook.created = new Date();

  for (const g of groups as Group[]) {
    const sheet = workbook.addWorksheet(`Group ${g.number}`);
    sheet.columns = [
      { header: "Name", key: "name", width: 26 },
      { header: "Role", key: "role", width: 20 },
      { header: "Appointment", key: "appointment", width: 18 },
      { header: "Pioneer", key: "pioneer", width: 18 },
      { header: "Baptized", key: "baptized", width: 12 },
      { header: "Standing", key: "standing", width: 12 },
      ...(includeContact
        ? [
            { header: "Phone", key: "phone", width: 16 },
            { header: "Email", key: "email", width: 26 },
          ]
        : []),
    ];
    sheet.getRow(1).font = { bold: true };

    const members = [...g.members].sort(
      (a, b) =>
        rankOf(a, g) - rankOf(b, g) ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );

    for (const m of members) {
      sheet.addRow({
        name: displayName(m),
        role: roleOf(m, g),
        appointment: APPOINTMENT_LABELS[m.appointment] ?? m.appointment,
        pioneer: PIONEER_LABELS[m.pioneerStatus] ?? m.pioneerStatus,
        baptized: m.isBaptized ? formatDate(m.baptismDate) : "",
        standing: STATUS_LABELS[m.status] ?? m.status,
        ...(includeContact ? { phone: m.phone ?? "", email: m.email ?? "" } : {}),
      });
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
