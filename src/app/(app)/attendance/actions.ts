"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { attendanceSchema, fieldErrors } from "@/lib/validation";

export type AttendanceState = { error?: string; errors?: Record<string, string>; ok?: string };

export async function recordAttendance(
  _prev: AttendanceState,
  formData: FormData,
): Promise<AttendanceState> {
  const auth = await guard("attendance:write");
  if (!auth.ok) return { error: auth.error };

  const parsed = attendanceSchema.safeParse({
    date: formData.get("date"),
    meetingType: formData.get("meetingType"),
    inPerson: formData.get("inPerson"),
    zoom: formData.get("zoom"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { date, meetingType, inPerson, zoom, notes } = parsed.data;
  const day = new Date(`${date}T00:00:00.000Z`);

  if (day > new Date()) {
    return { errors: { date: "That date is in the future." } };
  }

  // One count per meeting per day. Re-entering a date corrects the figure
  // rather than creating a duplicate.
  await prisma.meetingAttendance.upsert({
    where: { date_meetingType: { date: day, meetingType } },
    create: { date: day, meetingType, inPerson, zoom, notes },
    update: { inPerson, zoom, notes },
  });

  await recordAudit(
    auth.session.userId, "recorded", "MeetingAttendance", null,
    `${meetingType === "MIDWEEK" ? "Midweek" : "Weekend"} attendance for ${date}: ${inPerson + zoom}`,
  );

  revalidatePath("/attendance");
  return { ok: `Recorded ${inPerson + zoom} present.` };
}

export async function deleteAttendance(formData: FormData) {
  const auth = await guard("attendance:write");
  if (!auth.ok) return;
  const id = String(formData.get("id"));
  await prisma.meetingAttendance.delete({ where: { id } });
  await recordAudit(auth.session.userId, "deleted", "MeetingAttendance", id, "Removed an attendance count");
  revalidatePath("/attendance");
}
