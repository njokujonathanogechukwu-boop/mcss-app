"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { bookingSchema, hallCommitteeSchema, fieldErrors } from "@/lib/validation";
import { findClashes } from "@/lib/bookings";
import { formatTimeRange } from "@/lib/format";
import { saveHallContacts, sendHallMail } from "@/lib/hall-mail";

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

/** Who on the operating committee the hall emails go to. */
export async function saveHallCommittee(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const auth = await guard("booking:decide");
  if (!auth.ok) return { error: auth.error };

  const parsed = hallCommitteeSchema.safeParse({
    chairmanName: formData.get("chairmanName") ?? "",
    chairmanEmail: formData.get("chairmanEmail") ?? "",
    assistantName: formData.get("assistantName") ?? "",
    assistantEmail: formData.get("assistantEmail") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { chairmanName, chairmanEmail, assistantName, assistantEmail } = parsed.data;
  await saveHallContacts({
    chairman: { name: chairmanName, email: chairmanEmail ?? "" },
    assistant: { name: assistantName, email: assistantEmail ?? "" },
  });

  const addresses = [chairmanEmail, assistantEmail].filter(Boolean).join(", ");
  await recordAudit(
    auth.session.userId, "updated", "CongregationSetting", "hallCommittee",
    addresses ? `Hall committee emails set to ${addresses}` : "Hall committee emails cleared",
  );

  revalidatePath("/bookings");
  return { ok: addresses ? `Saved. Hall emails will go to ${addresses}.` : "Saved. No address is set, so no hall email will go out." };
}

export type HallMailState = BookingState;

/**
 * Sends the week-ahead notice or the month's schedule straight away, whatever
 * the daily cron has already done — this is how the secretary checks that the
 * committee's addresses and the mail account are working.
 */
export async function sendHallMailNow(
  _prev: HallMailState,
  formData: FormData,
): Promise<HallMailState> {
  const auth = await guard("booking:decide");
  if (!auth.ok) return { error: auth.error };

  const what = formData.get("what") === "month" ? "month" : "week";
  const result = await sendHallMail(new Date(), {
    week: what === "week",
    month: what === "month",
    force: true,
  });

  if (!result.configured) {
    return { error: "No mail account is connected yet, so nothing was sent. Set one up on the Email page." };
  }
  if (result.recipients.length === 0) {
    return { error: "No committee address is set. Fill in the chairman's or assistant's email above first." };
  }

  const step = result.steps[0];
  if (!step) return { error: "There was nothing to send." };

  const described =
    `${step.what === "week" ? "Week-ahead notice" : "Monthly schedule"} (${step.label}): ` +
    (step.sent ? "sent" : step.error ? step.error : step.skipped ?? "not sent");

  await recordAudit(
    auth.session.userId, step.sent ? "sent" : "attempted", "HallBooking", null,
    `${step.sent ? "Sent" : "Tried to send"} the hall committee ` +
      `${what === "week" ? "the week-ahead notice" : "the monthly schedule"}. ${described}`,
  );
  revalidatePath("/bookings");

  if (step.error) return { error: step.error };
  if (!step.sent) return { error: `Nothing went out — ${step.skipped ?? "no mail to send"}.` };
  return {
    ok: `Emailed ${result.recipients.map((r) => r.email).join(" and ")}. ${described}`,
  };
}
