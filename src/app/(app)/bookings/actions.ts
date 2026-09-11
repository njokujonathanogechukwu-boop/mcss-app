"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { bookingSchema, fieldErrors } from "@/lib/validation";
import { findClashes } from "@/lib/bookings";
import { formatTimeRange } from "@/lib/format";

export type BookingState = {
  error?: string;
  errors?: Record<string, string>;
  ok?: string;
  clashes?: string[];
};

export async function requestBooking(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const auth = await guard("booking:request");
  if (!auth.ok) return { error: auth.error };

  const parsed = bookingSchema.safeParse({
    resourceId: formData.get("resourceId"),
    requestingBody: formData.get("requestingBody"),
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone") ?? "",
    eventType: formData.get("eventType"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    setupRequirements: formData.get("setupRequirements") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);

  // A clash does not throw the request away. It is saved as pending and
  // the overlap is shown, so the elders can decide which booking stands.
  const clashes = await findClashes(parsed.data.resourceId, start, end);

  const booking = await prisma.hallBooking.create({
    data: {
      resourceId: parsed.data.resourceId,
      requestingBody: parsed.data.requestingBody,
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      eventType: parsed.data.eventType,
      startTime: start,
      endTime: end,
      setupRequirements: parsed.data.setupRequirements,
      status: "PENDING",
    },
  });

  await recordAudit(
    auth.session.userId, "requested", "HallBooking", booking.id,
    `${parsed.data.requestingBody} requested the hall for ${parsed.data.eventType}`,
  );

  revalidatePath("/bookings");

  if (clashes.length > 0) {
    return {
      ok: "Request saved as pending.",
      clashes: clashes.map(
        (c) => `${c.requestingBody} — ${c.eventType}, ${formatTimeRange(c.startTime, c.endTime)}`,
      ),
    };
  }
  return { ok: "Request saved. It is now waiting for a decision." };
}

export async function decideBooking(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const auth = await guard("booking:decide");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));
  const note = String(formData.get("decisionNote") ?? "").trim() || null;

  if (!["APPROVED", "DECLINED", "CANCELLED"].includes(decision)) {
    return { error: "That decision is not one this system records." };
  }

  const booking = await prisma.hallBooking.findUnique({ where: { id } });
  if (!booking) return { error: "That request no longer exists." };

  // The authoritative check. The calendar may have changed since the
  // request was made, so approval is refused while an overlap stands.
  if (decision === "APPROVED") {
    const clashes = await findClashes(
      booking.resourceId,
      booking.startTime,
      booking.endTime,
      booking.id,
    );
    if (clashes.length > 0) {
      return {
        error: "This cannot be approved while another approved booking overlaps it.",
        clashes: clashes.map(
          (c) => `${c.requestingBody} — ${c.eventType}, ${formatTimeRange(c.startTime, c.endTime)}`,
        ),
      };
    }
  }

  await prisma.hallBooking.update({
    where: { id },
    data: {
      status: decision as "APPROVED" | "DECLINED" | "CANCELLED",
      decisionNote: note,
      decidedById: auth.session.userId,
      decidedAt: new Date(),
    },
  });

  await recordAudit(
    auth.session.userId, decision.toLowerCase(), "HallBooking", id,
    `${booking.requestingBody} — ${booking.eventType}`,
  );

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { ok: `Request ${decision.toLowerCase()}.` };
}
