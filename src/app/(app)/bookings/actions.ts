"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { guard, recordAudit } from "@/lib/auth";
import { bookingSchema, hallCommitteeSchema, fieldErrors } from "@/lib/validation";
import { eventIds, findClashes, loadBookingLinks, setBookingGroup } from "@/lib/bookings";
import { checkLetter, eventKeyOf, moveLetter, removeLetter, saveLetter } from "@/lib/booking-letters";
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

/** The parts of the hall a form asked for: every one ticked, each once. */
function chosenResources(formData: FormData): string[] {
  return [...new Set(formData.getAll("resourceId").map(String).filter(Boolean))];
}

function bookingFields(formData: FormData, resourceId: string) {
  return bookingSchema.safeParse({
    resourceId,
    requestingBody: formData.get("requestingBody"),
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone") ?? "",
    eventType: formData.get("eventType"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    setupRequirements: formData.get("setupRequirements") ?? "",
  });
}

/** The request letter posted with a form, checked; null when none was attached. */
function postedLetter(formData: FormData):
  | { ok: true; file: File; mimeType: string }
  | { ok: false; error: string }
  | null {
  const file = formData.get("letter");
  if (!(file instanceof File) || file.size === 0) return null;
  const checked = checkLetter(file);
  return checked.ok ? { ok: true, file, mimeType: checked.mimeType } : checked;
}

const clashLine = (c: { requestingBody: string; eventType: string; startTime: Date; endTime: Date }) =>
  `${c.requestingBody} — ${c.eventType}, ${formatTimeRange(c.startTime, c.endTime)}`;

/**
 * Asks for the hall. An event that uses more than one part of it — both halls
 * at once — is saved as a booking for each part, linked as one event.
 */
export async function requestBooking(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const auth = await guard("booking:request");
  if (!auth.ok) return { error: auth.error };

  const resourceIds = chosenResources(formData);
  if (resourceIds.length === 0) return { errors: { resourceId: "Choose which part of the hall is needed" } };
  const known = await prisma.hallResource.count({ where: { id: { in: resourceIds }, active: true } });
  if (known !== resourceIds.length) return { errors: { resourceId: "Choose the parts of the hall from the list" } };

  const parsed = bookingFields(formData, resourceIds[0]);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  // The request letter, when one is attached, is checked before anything is saved.
  const letter = postedLetter(formData);
  if (letter && !letter.ok) return { errors: { letter: letter.error } };

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);

  // A clash does not throw the request away. It is saved as pending and
  // the overlap is shown, so the elders can decide which booking stands.
  const clashes = (await Promise.all(resourceIds.map((r) => findClashes(r, start, end)))).flat();

  const { resourceId: _first, ...details } = parsed.data;
  const created = await prisma.$transaction(
    resourceIds.map((resourceId) =>
      prisma.hallBooking.create({
        data: { ...details, resourceId, startTime: start, endTime: end, status: "PENDING" },
        select: { id: true },
      }),
    ),
  );
  if (created.length > 1) await setBookingGroup(created.map((c) => c.id));
  // The event is known by its first booking, linked or alone.
  if (letter?.ok) await saveLetter(created[0].id, letter.file, letter.mimeType);

  await recordAudit(
    auth.session.userId, "requested", "HallBooking", created[0].id,
    `${parsed.data.requestingBody} requested ${created.length > 1 ? `${created.length} parts of the hall` : "the hall"} for ${parsed.data.eventType}`,
  );

  revalidatePath("/bookings");

  if (clashes.length > 0) {
    return { ok: "Request saved as pending.", clashes: clashes.map(clashLine) };
  }
  return { ok: "Request saved. It is now waiting for a decision." };
}

/**
 * Approves, declines or cancels a request, and with it every other booking
 * of the same event.
 */
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

  const ids = eventIds(id, await loadBookingLinks());
  const bookings = await prisma.hallBooking.findMany({ where: { id: { in: ids } } });
  if (bookings.length === 0) return { error: "That request no longer exists." };

  // The authoritative check. The calendar may have changed since the
  // request was made, so approval is refused while an overlap stands in any
  // part of the hall the event uses.
  if (decision === "APPROVED") {
    const clashes = (
      await Promise.all(bookings.map((b) => findClashes(b.resourceId, b.startTime, b.endTime, b.id)))
    )
      .flat()
      .filter((c) => !ids.includes(c.id));
    if (clashes.length > 0) {
      return {
        error: "This cannot be approved while another approved booking overlaps it.",
        clashes: clashes.map(clashLine),
      };
    }
  }

  await prisma.hallBooking.updateMany({
    where: { id: { in: bookings.map((b) => b.id) } },
    data: {
      status: decision as "APPROVED" | "DECLINED" | "CANCELLED",
      decisionNote: note,
      decidedById: auth.session.userId,
      decidedAt: new Date(),
    },
  });

  await recordAudit(
    auth.session.userId, decision.toLowerCase(), "HallBooking", id,
    `${bookings[0].requestingBody} — ${bookings[0].eventType}`,
  );

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return { ok: `Request ${decision.toLowerCase()}.` };
}

/**
 * Changes a booking that is pending or already approved — with every other
 * booking of the same event: the parts of the hall, who it is for, the event,
 * the contact, the times and the setting up, with a note for the record. A
 * part of the hall taken off the event is cancelled; one added is booked with
 * the event's own standing. An approved event may only move to rooms and a time
 * no other approved booking holds, and when its time or rooms change the
 * operating committee's week-ahead and day-before emails go out again with the
 * new details.
 */
export async function updateBooking(
  _prev: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const auth = await guard("booking:decide");
  if (!auth.ok) return { error: auth.error };

  const id = String(formData.get("id") ?? "");
  const resourceIds = chosenResources(formData);
  if (resourceIds.length === 0) return { errors: { resourceId: "Choose which part of the hall is needed" } };
  const known = await prisma.hallResource.count({ where: { id: { in: resourceIds } } });
  if (known !== resourceIds.length) return { errors: { resourceId: "Choose the parts of the hall from the list" } };

  const parsed = bookingFields(formData, resourceIds[0]);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const note = String(formData.get("decisionNote") ?? "").trim().slice(0, 200) || null;
  const letter = postedLetter(formData);
  if (letter && !letter.ok) return { errors: { letter: letter.error } };

  const links = await loadBookingLinks();
  const oldKey = eventKeyOf(id, links);
  const ids = eventIds(id, links);
  const bookings = await prisma.hallBooking.findMany({ where: { id: { in: ids } } });
  if (bookings.length === 0) return { error: "That booking no longer exists." };
  const status = bookings[0].status;
  if (status !== "APPROVED" && status !== "PENDING") {
    return { error: "A declined or cancelled booking cannot be changed. Make a new request instead." };
  }

  const start = new Date(parsed.data.startTime);
  const end = new Date(parsed.data.endTime);
  const keep = bookings.filter((b) => resourceIds.includes(b.resourceId));
  const drop = bookings.filter((b) => !resourceIds.includes(b.resourceId));
  const add = resourceIds.filter((r) => !bookings.some((b) => b.resourceId === r));
  const timeMoved = (b: { startTime: Date; endTime: Date }) =>
    b.startTime.getTime() !== start.getTime() || b.endTime.getTime() !== end.getTime();
  const moved = add.length > 0 || drop.length > 0 || keep.some(timeMoved);

  // The same line approval holds: two approved bookings never share a room
  // and a time.
  if (status === "APPROVED" && moved) {
    const clashes = (await Promise.all(resourceIds.map((r) => findClashes(r, start, end))))
      .flat()
      .filter((c) => !ids.includes(c.id));
    if (clashes.length > 0) {
      return {
        error: "That time is already taken by another approved booking, so the change was not saved.",
        clashes: clashes.map(clashLine),
      };
    }
  }

  const { resourceId: _first, ...details } = parsed.data;
  const shared = { ...details, startTime: start, endTime: end, decisionNote: note };
  const written = await prisma.$transaction([
    ...keep.map((b) =>
      prisma.hallBooking.update({
        where: { id: b.id },
        data: {
          ...shared,
          // A new time is news to the committee: its notices are sent again.
          ...(timeMoved(b) ? { weekReminderSentAt: null, dayReminderSentAt: null } : {}),
        },
        select: { id: true },
      }),
    ),
    ...add.map((resourceId) =>
      prisma.hallBooking.create({
        data: {
          ...shared,
          resourceId,
          status,
          ...(status === "APPROVED" ? { decidedById: auth.session.userId, decidedAt: new Date() } : {}),
        },
        select: { id: true },
      }),
    ),
    ...drop.map((b) =>
      prisma.hallBooking.update({
        where: { id: b.id },
        data: { status: "CANCELLED", decidedById: auth.session.userId, decidedAt: new Date() },
        select: { id: true },
      }),
    ),
  ]);
  // Kept and added bookings stay one event; a part taken off it stands alone.
  const remaining = written.slice(0, keep.length + add.length).map((w) => w.id);
  await setBookingGroup(remaining, drop.map((b) => b.id));

  // The letter follows the event, which is now known by its first booking.
  const newKey = remaining[0];
  await moveLetter(oldKey, newKey);
  if (letter?.ok) await saveLetter(newKey, letter.file, letter.mimeType);
  else if (formData.get("removeLetter") === "true") await removeLetter(newKey);

  await recordAudit(
    auth.session.userId, "updated", "HallBooking", id,
    `Changed the booking for ${parsed.data.requestingBody} — ${parsed.data.eventType}` +
      (moved ? `, now ${formatTimeRange(start, end)}` : ""),
  );

  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  return {
    ok: moved && status === "APPROVED"
      ? "Booking changed. The operating committee's reminders will go out again with the new details."
      : "Booking changed.",
  };
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
