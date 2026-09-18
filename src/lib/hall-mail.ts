import "server-only";

import { prisma } from "@/lib/prisma";
import { emailConfigured, sendEmail } from "@/lib/email";
import { formatTimeRange } from "@/lib/format";
import { CONGREGATION_TIMEZONE, MONTH_NAMES } from "@/lib/service-year";

/**
 * The Kingdom Hall operating committee is kept informed by email: a week ahead
 * of every approved booking, the day before it, and once a month with the whole
 * month's schedule. The day-before notice is not a spare copy of the week-ahead
 * one — a booking approved inside its last seven days never had a week-ahead
 * notice, so that is the only email the committee gets about it. All three go to
 * the chairman, his assistant and one other member, each of whom may have two
 * addresses — the secretary keeps the names and addresses on the bookings page.
 * With no addresses or no mail account configured nothing is sent and nothing is
 * stamped, so the daily cron can run forever without doing harm.
 */

export type HallContact = { name: string; email: string; email2: string };
export type HallRole = "chairman" | "assistant" | "member";
export type HallContacts = Record<HallRole, HallContact>;
/** One person on the committee and every address of his that will be mailed. */
export type HallRecipient = { name: string; role: HallRole; emails: string[] };

const ROLES: HallRole[] = ["chairman", "assistant", "member"];

const KEYS = {
  chairmanName: "hallChairmanName",
  chairmanEmail: "hallChairmanEmail",
  chairmanEmail2: "hallChairmanEmail2",
  assistantName: "hallAssistantName",
  assistantEmail: "hallAssistantEmail",
  assistantEmail2: "hallAssistantEmail2",
  memberName: "hallMemberName",
  memberEmail: "hallMemberEmail",
  memberEmail2: "hallMemberEmail2",
  /** "2026-10" once the summary for October 2026 has gone out. */
  summarySentFor: "hallSummarySentFor",
} as const;

/** A blank committee — a fresh object every time, never shared between callers. */
export function emptyContacts(): HallContacts {
  return {
    chairman: { name: "", email: "", email2: "" },
    assistant: { name: "", email: "", email2: "" },
    member: { name: "", email: "", email2: "" },
  };
}

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

const ROLE_KEYS: Record<HallRole, { name: string; email: string; email2: string }> = {
  chairman: { name: KEYS.chairmanName, email: KEYS.chairmanEmail, email2: KEYS.chairmanEmail2 },
  assistant: { name: KEYS.assistantName, email: KEYS.assistantEmail, email2: KEYS.assistantEmail2 },
  member: { name: KEYS.memberName, email: KEYS.memberEmail, email2: KEYS.memberEmail2 },
};

export async function readHallContacts(): Promise<HallContacts> {
  const rows = await prisma.congregationSetting.findMany({
    where: { key: { in: ROLES.flatMap((role) => Object.values(ROLE_KEYS[role])) } },
  });
  const value = new Map(rows.map((r) => [r.key, r.value]));
  const out = emptyContacts();
  for (const role of ROLES) {
    const keys = ROLE_KEYS[role];
    out[role] = {
      name: value.get(keys.name) ?? "",
      email: value.get(keys.email) ?? "",
      email2: value.get(keys.email2) ?? "",
    };
  }
  return out;
}

export async function saveHallContacts(contacts: HallContacts): Promise<void> {
  const rows: [string, string][] = ROLES.flatMap((role) => {
    const keys = ROLE_KEYS[role];
    const contact = contacts[role];
    return [
      [keys.name, contact.name.trim()],
      [keys.email, contact.email.trim()],
      [keys.email2, contact.email2.trim()],
    ] as [string, string][];
  });
  await prisma.$transaction(
    rows.map(([key, value]) =>
      prisma.congregationSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
    ),
  );
}

/**
 * Who the hall emails go to: one entry per person, holding every address of his
 * that is filled in. An address recorded twice — under two brothers, or as both
 * of one brother's — is only mailed once, and a person left without an address
 * drops out altogether.
 */
export function hallRecipients(contacts: HallContacts): HallRecipient[] {
  const out: HallRecipient[] = [];
  const seen = new Set<string>();
  for (const role of ROLES) {
    const contact = contacts[role];
    const emails: string[] = [];
    for (const raw of [contact.email, contact.email2]) {
      const email = raw.trim();
      if (!email) continue;
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(email);
    }
    if (emails.length > 0) out.push({ name: contact.name.trim(), role, emails });
  }
  return out;
}

/** The flat To list for one email to the whole committee. */
export function recipientAddresses(recipients: HallRecipient[]): string[] {
  return recipients.flatMap((r) => r.emails);
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

/** Which of the two reminder stamps a query is looking for bookings without. */
type ReminderStamp = "weekReminderSentAt" | "dayReminderSentAt";

/**
 * Approved bookings inside a window of congregation days, one day wider at each
 * end than needed so a booking stored near midnight is never missed; the caller
 * filters on the day it actually falls on. `unreminded` narrows it to the
 * bookings that notice has not gone out for yet.
 */
async function approvedBetween(
  fromKey: string,
  toKey: string,
  unreminded: ReminderStamp | null,
): Promise<HallBookingLine[]> {
  return prisma.hallBooking.findMany({
    where: {
      status: "APPROVED",
      startTime: {
        gte: new Date(`${shiftDayKey(fromKey, -1)}T00:00:00Z`),
        lt: new Date(`${shiftDayKey(toKey, 1)}T00:00:00Z`),
      },
      ...(unreminded ? { [unreminded]: null } : {}),
    },
    select: BOOKING_SELECT,
    orderBy: { startTime: "asc" },
  });
}

/**
 * Approved bookings that start on one congregation day. By default only those
 * the notice in question has not gone out for; pass `null` for all of them.
 */
export async function bookingsOnDay(
  dayKey: string,
  unreminded: ReminderStamp | null = "weekReminderSentAt",
): Promise<HallBookingLine[]> {
  const rows = await approvedBetween(dayKey, dayKey, unreminded);
  return rows.filter((b) => lagosDayKey(b.startTime) === dayKey);
}

/** Every approved booking in one calendar month, reminded about or not. */
export async function bookingsInMonth(year: number, month: number): Promise<HallBookingLine[]> {
  const key = `${year}-${pad(month)}`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows = await approvedBetween(`${key}-01`, `${key}-${pad(lastDay)}`, null);
  return rows.filter((b) => monthKeyOf(lagosDayKey(b.startTime)) === key);
}

function greeting(recipients: HallRecipient[]): string {
  const names = recipients.map((r) => r.name).filter(Boolean);
  if (names.length === 0) return "Good day,";
  if (names.length === 1) return `Good day ${names[0]},`;
  return `Good day ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]},`;
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

export function dayReminderSubject(dayKey: string): string {
  return `Kingdom Hall booking tomorrow — ${longDay(dayKey)}`;
}

export function dayReminderText(recipients: HallRecipient[], dayKey: string, bookings: HallBookingLine[]): string {
  return [
    greeting(recipients),
    "",
    `Tomorrow, ${longDay(dayKey)}, the Kingdom Hall is booked for:`,
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
    "Anything added later will reach you a week before it happens, and again the day before.",
    "",
    FOOTER,
  ].join("\n").trimEnd();
}

export type HallMailStep = {
  what: "week" | "day" | "month";
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

/** One of the two notices aimed at a single day: which stamp it honours, and its wording. */
type DayNotice = {
  what: "week" | "day";
  stamp: ReminderStamp;
  subject: (dayKey: string) => string;
  text: (recipients: HallRecipient[], dayKey: string, bookings: HallBookingLine[]) => string;
};

const WEEK_NOTICE: DayNotice = {
  what: "week",
  stamp: "weekReminderSentAt",
  subject: weekReminderSubject,
  text: weekReminderText,
};

const DAY_NOTICE: DayNotice = {
  what: "day",
  stamp: "dayReminderSentAt",
  subject: dayReminderSubject,
  text: dayReminderText,
};

/** What each automatic hall email is called, wherever the secretary is told about one. */
export const HALL_MAIL_LABELS: Record<HallMailStep["what"], string> = {
  week: "Week-ahead notice",
  day: "Day-before reminder",
  month: "Monthly schedule",
};

async function sendBookingNotice(
  notice: DayNotice,
  dayKey: string,
  recipients: HallRecipient[],
  force: boolean,
): Promise<HallMailStep> {
  const bookings = await bookingsOnDay(dayKey, force ? null : notice.stamp);
  const step: HallMailStep = {
    what: notice.what,
    label: longDay(dayKey),
    bookings: bookings.length,
    sent: false,
  };

  if (recipients.length === 0) return { ...step, skipped: "no committee address" };
  if (bookings.length === 0) return { ...step, skipped: "nothing booked that day" };

  const result = await sendEmail(
    recipientAddresses(recipients),
    notice.subject(dayKey),
    notice.text(recipients, dayKey, bookings),
    "BOOKING",
  );
  if (!result.ok) return { ...step, error: result.error ?? "send failed" };

  // Stamped only after the mail went out, so a failed send is retried the next
  // day rather than the booking being forgotten.
  const sentAt = new Date();
  await prisma.hallBooking.updateMany({
    where: { id: { in: bookings.map((b) => b.id) } },
    data:
      notice.stamp === "weekReminderSentAt"
        ? { weekReminderSentAt: sentAt }
        : { dayReminderSentAt: sentAt },
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
    recipientAddresses(recipients),
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
 * out, the day-before reminder for tomorrow, and — on the 1st, or within the
 * first days of a month if the 1st was missed — the schedule for the month now
 * beginning. `force` ignores what has already been sent, for the secretary's
 * own test.
 */
export async function sendHallMail(
  now = new Date(),
  opts: { week?: boolean; day?: boolean; month?: boolean; force?: boolean } = {},
): Promise<HallMailResult> {
  const doWeek = opts.week ?? true;
  const doDay = opts.day ?? true;
  const doMonth = opts.month ?? true;
  const force = opts.force ?? false;
  const contacts = await readHallContacts();
  const recipients = hallRecipients(contacts);
  const result: HallMailResult = { configured: emailConfigured(), recipients, steps: [] };

  if (!result.configured) {
    if (doWeek) result.steps.push({ what: "week", label: "", bookings: 0, sent: false, skipped: "no mail account" });
    if (doDay) result.steps.push({ what: "day", label: "", bookings: 0, sent: false, skipped: "no mail account" });
    if (doMonth) result.steps.push({ what: "month", label: "", bookings: 0, sent: false, skipped: "no mail account" });
    return result;
  }

  const todayKey = lagosDayKey(now);

  if (doWeek) {
    result.steps.push(await sendBookingNotice(WEEK_NOTICE, shiftDayKey(todayKey, 7), recipients, force));
  }

  if (doDay) {
    result.steps.push(await sendBookingNotice(DAY_NOTICE, shiftDayKey(todayKey, 1), recipients, force));
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
