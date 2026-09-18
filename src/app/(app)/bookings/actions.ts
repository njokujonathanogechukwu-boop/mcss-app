"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { bookingSchema, hallCommitteeSchema, fieldErrors } from "@/lib/validation";
import { findClashes } from "@/lib/bookings";
import { formatTimeRange } from "@/lib/format";
import {
  HALL_MAIL_LABELS,
  hallRecipients,
  recipientAddresses,
  saveHallContacts,
  sendHallMail,
  type HallContacts,
} from "@/lib/hall-mail";

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

  const fields = [
    "chairmanName", "chairmanEmail", "chairmanEmail2",
    "assistantName", "assistantEmail", "assistantEmail2",
    "memberName", "memberEmail", "memberEmail2",
  ] as const;
  const parsed = hallCommitteeSchema.safeParse(
    Object.fromEntries(fields.map((f) => [f, formData.get(f) ?? ""])),
  );
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const d = parsed.data;
  const contacts: HallContacts = {
    chairman: { name: d.chairmanName, email: d.chairmanEmail ?? "", email2: d.chairmanEmail2 ?? "" },
    assistant: { name: d.assistantName, email: d.assistantEmail ?? "", email2: d.assistantEmail2 ?? "" },
    member: { name: d.memberName, email: d.memberEmail ?? "", email2: d.memberEmail2 ?? "" },
  };
  await saveHallContacts(contacts);

  const listed = recipientAddresses(hallRecipients(contacts)).join(", ");

  await recordAudit(
    auth.session.userId, "updated", "CongregationSetting", "hallCommittee",
    listed ? `Hall committee emails set to ${listed}` : "Hall committee emails cleared",
  );

  revalidatePath("/bookings");
  return { ok: listed ? `Saved. Hall emails will go to ${listed}.` : "Saved. No address is set, so no hall email will go out." };
}

export type HallMailState = BookingState;

/**
 * Sends one of the three hall emails straight away, whatever the daily cron has
 * already done — this is how the secretary checks that the committee's addresses
 * and the mail account are working.
 */
export async function sendHallMailNow(
  _prev: HallMailState,
  formData: FormData,
): Promise<HallMailState> {
  const auth = await guard("booking:decide");
  if (!auth.ok) return { error: auth.error };

  const requested = String(formData.get("what") ?? "");
  const what = requested === "month" || requested === "day" ? requested : "week";
  const result = await sendHallMail(new Date(), {
    week: what === "week",
    day: what === "day",
    month: what === "month",
    force: true,
  });

  if (!result.configured) {
    return { error: "No mail account is connected yet, so nothing was sent. Set one up on the Email page." };
  }
  if (result.recipients.length === 0) {
    return { error: "No committee address is set. Fill in at least one email above first." };
  }

  const step = result.steps[0];
  if (!step) return { error: "There was nothing to send." };

  const label = HALL_MAIL_LABELS[step.what];
  const described =
    `${label} (${step.label}): ` +
    (step.sent ? "sent" : step.error ? step.error : step.skipped ?? "not sent");

  await recordAudit(
    auth.session.userId, step.sent ? "sent" : "attempted", "HallBooking", null,
    `${step.sent ? "Sent" : "Tried to send"} the hall committee the ${label.toLowerCase()}. ${described}`,
  );
  revalidatePath("/bookings");

  if (step.error) return { error: step.error };
  if (!step.sent) return { error: `Nothing went out — ${step.skipped ?? "no mail to send"}.` };
  return {
    ok: `Emailed ${recipientAddresses(result.recipients).join(", ")}. ${described}`,
  };
}
