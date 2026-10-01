import "server-only";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { isLocalPhone, normalizePhone } from "@/lib/phone";

export type PhoneChange = {
  table: "publisher" | "student" | "booking";
  id: string;
  field: "phone" | "emergencyContactPhone" | "guardianPhone" | "contactPhone";
  who: string;
  label: string;
  before: string;
  after: string;
};

export type PhoneCleanup = {
  /** Numbers that will be rewritten to begin with 0. */
  changes: PhoneChange[];
  /** Numbers that could not be read as Nigerian ones, left exactly as they are. */
  unreadable: Omit<PhoneChange, "after">[];
  /** Numbers already in the local form. */
  alreadyLocal: number;
};

const LABELS: Record<PhoneChange["field"], string> = {
  phone: "Phone",
  emergencyContactPhone: "Emergency contact phone",
  guardianPhone: "Guardian's phone",
  contactPhone: "Booking contact phone",
};

/**
 * Every phone number on file, read against the local form that begins with 0:
 * which ones would change, and which cannot be read and are left alone. Nothing
 * is written here; applyPhoneCleanup writes exactly what this returns.
 */
export async function planPhoneCleanup(): Promise<PhoneCleanup> {
  const [publishers, students, bookings] = await Promise.all([
    prisma.publisher.findMany({
      where: { OR: [{ phone: { not: null } }, { emergencyContactPhone: { not: null } }] },
      select: { id: true, firstName: true, lastName: true, phone: true, emergencyContactPhone: true },
    }),
    prisma.schoolStudent.findMany({
      where: { OR: [{ phone: { not: null } }, { guardianPhone: { not: null } }] },
      select: { id: true, firstName: true, lastName: true, phone: true, guardianPhone: true },
    }),
    prisma.hallBooking.findMany({
      where: { contactPhone: { not: null } },
      select: { id: true, contactName: true, requestingBody: true, contactPhone: true },
    }),
  ]);

  const result: PhoneCleanup = { changes: [], unreadable: [], alreadyLocal: 0 };
  const look = (table: PhoneChange["table"], id: string, who: string, field: PhoneChange["field"], value: string | null) => {
    if (value == null || value.trim() === "") return;
    const after = normalizePhone(value);
    const entry = { table, id, field, who, label: LABELS[field], before: value };
    if (after && isLocalPhone(after)) {
      if (after === value) result.alreadyLocal++;
      else result.changes.push({ ...entry, after });
    } else {
      result.unreadable.push(entry);
    }
  };

  for (const p of publishers) {
    look("publisher", p.id, displayName(p), "phone", p.phone);
    look("publisher", p.id, displayName(p), "emergencyContactPhone", p.emergencyContactPhone);
  }
  for (const s of students) {
    look("student", s.id, `${displayName(s)} (student)`, "phone", s.phone);
    look("student", s.id, `${displayName(s)} (student)`, "guardianPhone", s.guardianPhone);
  }
  for (const b of bookings) {
    look("booking", b.id, `${b.contactName} (${b.requestingBody} booking)`, "contactPhone", b.contactPhone);
  }
  return result;
}

/** Writes the plan in one transaction, so a failure leaves every number as it was. */
export async function applyPhoneCleanup(changes: PhoneChange[]): Promise<number> {
  await prisma.$transaction(
    changes.map((c) =>
      c.table === "publisher"
        ? prisma.publisher.update({ where: { id: c.id }, data: { [c.field]: c.after } })
        : c.table === "student"
          ? prisma.schoolStudent.update({ where: { id: c.id }, data: { [c.field]: c.after } })
          : prisma.hallBooking.update({ where: { id: c.id }, data: { contactPhone: c.after } }),
    ),
  );
  return changes.length;
}
