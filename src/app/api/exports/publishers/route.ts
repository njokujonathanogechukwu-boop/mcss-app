import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const GENDER: Record<string, string> = { MALE: "Male", FEMALE: "Female" };
const APPOINTMENT: Record<string, string> = {
  PUBLISHER: "Publisher",
  MINISTERIAL_SERVANT: "Ministerial servant",
  ELDER: "Elder",
};
const PIONEER: Record<string, string> = {
  NONE: "",
  AUXILIARY: "Auxiliary pioneer",
  REGULAR: "Regular pioneer",
  SPECIAL: "Special pioneer",
};

function cell(value: string | number | boolean | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/**
 * Bio-data and emergency contact details for every active publisher, as a
 * spreadsheet. Guarded by publisher:readContact as well as export:run because
 * the emergency contact columns are the sensitive part of the file.
 */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run") || !can(session.role, "publisher:readContact")) {
    return new NextResponse("Your account cannot download publisher contact details.", { status: 403 });
  }

  const groupId = new URL(request.url).searchParams.get("group") || undefined;

  const publishers = await prisma.publisher.findMany({
    where: { status: { in: ["ACTIVE", "IRREGULAR"] }, ...(groupId ? { groupId } : {}) },
    include: { group: { select: { number: true, name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const header = [
    "Last name",
    "First name",
    "Gender",
    "Date of birth",
    "Baptized",
    "Baptism date",
    "Appointment",
    "Pioneer status",
    "Service group",
    "Phone",
    "Email",
    "Address",
    "Emergency contact",
    "Emergency contact phone",
  ];
  const rows = publishers.map((p) => [
    p.lastName,
    p.firstName,
    GENDER[p.gender] ?? p.gender,
    day(p.dateOfBirth),
    p.isBaptized ? "Yes" : "No",
    day(p.baptismDate),
    APPOINTMENT[p.appointment] ?? p.appointment,
    PIONEER[p.pioneerStatus] ?? p.pioneerStatus,
    p.group ? `${p.group.number} — ${p.group.name}` : "",
    p.phone,
    p.email,
    p.address,
    p.emergencyContactName,
    p.emergencyContactPhone,
  ]);

  const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="publishers-biodata-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
