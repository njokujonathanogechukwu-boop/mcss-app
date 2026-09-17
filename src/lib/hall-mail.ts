import "server-only";

import { prisma } from "@/lib/prisma";
import { emailConfigured, sendEmail } from "@/lib/email";
import { formatTimeRange } from "@/lib/format";
import { CONGREGATION_TIMEZONE, MONTH_NAMES } from "@/lib/service-year";

/**
 * The Kingdom Hall operating committee is kept informed by email: once a week
 * ahead of every approved booking, and once a month with the whole month's
 * schedule. Both go to the chairman and his assistant, whose names and
 * addresses the secretary keeps on the bookings page. With no addresses or no
 * mail account configured nothing is sent and nothing is stamped, so the daily
 * cron can run forever without doing harm.
 */

export type HallContact = { name: string; email: string };
export type HallContacts = { chairman: HallContact; assistant: HallContact };
export type HallRecipient = HallContact & { role: "chairman" | "assistant" };

const KEYS = {
  chairmanName: "hallChairmanName",
  chairmanEmail: "hallChairmanEmail",
  assistantName: "hallAssistantName",
  assistantEmail: "hallAssistantEmail",
  /** "2026-10" once the summary for October 2026 has gone out. */
  summarySentFor: "hallSummarySentFor",
} as const;

export const EMPTY_CONTACTS: HallContacts = {
  chairman: { name: "", email: "" },
  assistant: { name: "", email: "" },
};

/** On how many days into a month the summary is still sent if the 1st was missed. */
const SUMMARY_GRACE_DAYS = 3;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CONGREGATION_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar day at the congregation as "2026-09-24", whatever timezone the host is in. */
export function lagosDayKey(when: Date): string {
  return dayFormatter.format(when);
}

function shiftDayKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthKeyOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** A long weekday and date, for the notice line: "Thursday 24 September 2026". */
function longDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export async function readHallContacts(): Promise<HallContacts> {
  const rows = await prisma.congregationSetting.findMany({
    where: {
      key: { in: [KEYS.chairmanName, KEYS.chairmanEmail, KEYS.assistantName, KEYS.assistantEmail] },
    },
  });
  const value = new Map(rows.map((r) => [r.key, r.value]));
  return {
    chairman: {
      name: value.get(KEYS.chairmanName) ?? "",
      email: value.get(KEYS.chairmanEmail) ?? "",
    },
    assistant: {
      name: value.get(KEYS.assistantName) ?? "",
      email: value.get(KEYS.assistantEmail) ?? "",
    },
  };
}

export async function saveHallContacts(contacts: HallContacts): Promise<void> {
  const rows: [string, string][] = [
    [KEYS.chairmanName, contacts.chairman.name.trim()],
    [KEYS.chairmanEmail, contacts.chairman.email.trim()],
    [KEYS.assistantName, contacts.assistant.name.trim()],
    [KEYS.assistantEmail, contacts.assistant.email.trim()],
  ];
  await prisma.$transaction(
    rows.map(([key, value]) =>
      prisma.congregationSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
}

/**
 * Who the hall emails go to. An address used twice — a chairman who is also
 * recorded as his own assistant — is only mailed once.
 */
export function hallRecipients(contacts: HallContacts): HallRecipient[] {
  const out: HallRecipient[] = [];
  const seen = new Set<string>();
  const add = (contact: HallContact, role: HallRecipient["role"]) => {
    const email = contact.email.trim();
    if (!email) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: contact.name.trim(), email, role });
  };
  add(contacts.chairman, "chairman");
  add(contacts.assistant, "assistant");
  return out;
}

export type HallBookingLine = {
  id: string;
  eventType: string;
  requestingBody: string;
  contactName: string;
  contactPhone: string | null;
  startTime: Date;
  endTime: Date;
  setupRequirements: string | null;
  resource: { name: string };
};

const BOOKING_SELECT = {
  id: true,
  eventType: true,
  requestingBody: true,
  contactName: true,
  contactPhone: true,
  startTime: true,
  endTime: true,
  setupRequirements: true,
  resource: { select: { name: true } },
} as const;

/**
 * Approved bookings inside a window of congregation days, one day wider at each
 * end than needed so a booking stored near midnight is never missed; the caller
 * filters on the day it actually falls on.
 */
async function approvedBetween(
  fromKey: string,
  toKey: string,
  onlyUnreminded: boolean,
): Promise<HallBookingLine[]> {
  return prisma.hallBooking.findMany({
    where: {
      status: "APPROVED",
      startTime: {
        gte: new Date(`${shiftDayKey(fromKey, -1)}T00:00:00Z`),
        lt: new Date(`${shiftDayKey(toKey, 1)}T00:00:00Z`),
      },
      ...(onlyUnreminded ? { weekReminderSentAt: null } : {}),
    },
    select: BOOKING_SELECT,
    orderBy: { startTime: "asc" },
  });
}

/** Approved bookings that start on one congregation day. */
export async function bookingsOnDay(dayKey: string, onlyUnreminded = true): Promise<HallBookingLine[]> {
  const rows = await approvedBetween(dayKey, dayKey, onlyUnreminded);
  return rows.filter((b) => lagosDayKey(b.startTime) === dayKey);
}

/** Every approved booking in one calendar month, reminded about or not. */
export async function bookingsInMonth(year: number, month: number): Promise<HallBookingLine[]> {
  const key = `${year}-${pad(month)}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows = await approvedBetween(`${key}-01`, `${key}-${pad(lastDay)}`, false);
  return rows.filter((b) => monthKeyOf(lagosDayKey(b.startTime)) === key);
}

function greeting(recipients: HallRecipient[]): string {
  const names = recipients.map((r) => r.name).filter(Boolean);
  return names.length === 0
    ? "Good day,"
    : `Good day ${names.join(" and ")},`;
}

function bookingLines(b: HallBookingLine): string[] {
  const lines = [
    `• ${b.eventType} — ${b.requestingBody}`,
    `  ${formatTimeRange(b.startTime, b.endTime)}`,
    `  ${b.resource.name}`,
    `  Contact: ${b.contactName}${b.contactPhone ? ` (${b.contactPhone})` : ""}`,
  ];
  if (b.setupRequirements) lines.push(`  Setting up: ${b.setupRequirements}`);
  return lines;
}

const FOOTER = "Sent automatically by the Maitama Congregation system.";

export function weekReminderSubject(dayKey: string): string {
  return `Kingdom Hall booking next week — ${longDay(dayKey)}`;
}

export function weekReminderText(recipients: HallRecipient[], dayKey: string, bookings: HallBookingLine[]): string {
  return [
    greeting(recipients),
    "",
    `A week from now, on ${longDay(dayKey)}, the Kingdom Hall is booked for:`,
    "",
    ...bookings.flatMap((b) => [...bookingLines(b), ""]),
    "Please see to it that the hall is opened, cleaned and set up in time.",
    "",
    FOOTER,
  ].join("\n").trimEnd();
}

export function monthSummarySubject(year: number, month: number): string {
  return `Kingdom Hall bookings for ${MONTH_NAMES[month - 1]} ${year}`;
}

export function monthSummaryText(
  recipients: HallRecipient[],
  year: number,
  month: number,
  bookings: HallBookingLine[],
): string {
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  const body =
    bookings.length === 0
      ? [`Nothing is approved for ${label} yet.`]
      : bookings.flatMap((b) => [...bookingLines(b), ""]);

  return [
    greeting(recipients),
    "",
    bookings.length === 0
      ? `Here is the Kingdom Hall schedule for ${label}:`
      : `Here is everything booked at the Kingdom Hall for ${label} — ${bookings.length} approved ${bookings.length === 1 ? "booking" : "bookings"}:`,
    "",
    ...body,
    "Anything added later will reach you a week before it happens.",
    "",
    FOOTER,
  ].join("\n").trimEnd();
}

export type HallMailStep = {
  what: "week" | "month";
  label: string;
  bookings: number;
  sent: boolean;
  /** Why nothing went out: no mail account, no committee address, nothing booked. */
  skipped?: string;
  error?: string;
};

export type HallMailResult = {
  configured: boolean;
  recipients: HallRecipient[];
  steps: HallMailStep[];
};

async function sendWeekReminder(
  dayKey: string,
  recipients: HallRecipient[],
  force: boolean,
): Promise<HallMailStep> {
  const bookings = await bookingsOnDay(dayKey, !force);
  const step: HallMailStep = {
    what: "week",
    label: longDay(dayKey),
    bookings: bookings.length,
    sent: false,
  };

  if (recipients.length === 0) return { ...step, skipped: "no committee address" };
  if (bookings.length === 0) return { ...step, skipped: "nothing booked that day" };

  const result = await sendEmail(
    recipients.map((r) => r.email),
    weekReminderSubject(dayKey),
    weekReminderText(recipients, dayKey, bookings),
    "BOOKING",
  );
  if (!result.ok) return { ...step, error: result.error ?? "send failed" };

  // Stamped only after the mail went out, so a failed send is retried the next
  // day rather than the booking being forgotten.
  await prisma.hallBooking.updateMany({
    where: { id: { in: bookings.map((b) => b.id) } },
    data: { weekReminderSentAt: new Date() },
  });
  return { ...step, sent: true };
}

async function sendMonthSummary(
  year: number,
  month: number,
  recipients: HallRecipient[],
  force: boolean,
): Promise<HallMailStep> {
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  const bookings = await bookingsInMonth(year, month);
  const step: HallMailStep = { what: "month", label, bookings: bookings.length, sent: false };

  if (recipients.length === 0) return { ...step, skipped: "no committee address" };
  if (!force && bookings.length === 0) return { ...step, skipped: "nothing booked that month" };

  const result = await sendEmail(
    recipients.map((r) => r.email),
    monthSummarySubject(year, month),
    monthSummaryText(recipients, year, month, bookings),
    "BOOKING",
  );
  if (!result.ok) return { ...step, error: result.error ?? "send failed" };

  await prisma.congregationSetting.upsert({
    where: { key: KEYS.summarySentFor },
    update: { value: `${year}-${pad(month)}` },
    create: { key: KEYS.summarySentFor, value: `${year}-${pad(month)}` },
  });
  return { ...step, sent: true };
}

/**
 * Everything the daily cron does: the week-ahead notice for the day seven days
 * out, and — on the 1st, or within the first days of a month if the 1st was
 * missed — the schedule for the month now beginning. `force` sends the summary
 * whatever the month's state, for the secretary's own test.
 */
export async function sendHallMail(
  now = new Date(),
  opts: { week?: boolean; month?: boolean; force?: boolean } = {},
): Promise<HallMailResult> {
  const doWeek = opts.week ?? true;
  const doMonth = opts.month ?? true;
  const force = opts.force ?? false;
  const contacts = await readHallContacts();
  const recipients = hallRecipients(contacts);
  const result: HallMailResult = { configured: emailConfigured(), recipients, steps: [] };

  if (!result.configured) {
    if (doWeek) result.steps.push({ what: "week", label: "", bookings: 0, sent: false, skipped: "no mail account" });
    if (doMonth) result.steps.push({ what: "month", label: "", bookings: 0, sent: false, skipped: "no mail account" });
    return result;
  }

  const todayKey = lagosDayKey(now);

  if (doWeek) {
    result.steps.push(await sendWeekReminder(shiftDayKey(todayKey, 7), recipients, force));
  }

  if (doMonth) {
    const [y, m, d] = todayKey.split("-").map(Number);
    const alreadySent = force ? "" : await readSummarySentFor();
    if (force || d <= SUMMARY_GRACE_DAYS) {
      if (alreadySent !== `${y}-${pad(m)}`) {
        result.steps.push(await sendMonthSummary(y, m, recipients, force));
      }
    }
  }

  return result;
}

async function readSummarySentFor(): Promise<string> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: KEYS.summarySentFor } });
  return row?.value ?? "";
}
