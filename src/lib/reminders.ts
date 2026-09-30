import "server-only";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";
import { emailConfigured, sendEmail } from "@/lib/email";
import { isClosed } from "@/lib/report-periods";
import { auxCovers } from "@/lib/auxiliary";
import { ensureGroupTokens } from "@/lib/group-reports";
import { requestOrigin } from "@/lib/self-service";

export type ReminderPerson = {
  firstName: string;
  lastName: string;
  gender: string;
  phone?: string | null;
  email?: string | null;
};

export type ReminderGroup = {
  key: string;
  id: string | null;
  number: number | null;
  name: string | null;
  title: string;
  where: string;
  who: string | null;
  overseer: ReminderPerson | null;
  assistant: ReminderPerson | null;
  members: number;
  missing: MissingReport[];
  /** Everyone in the group pioneering this month, who reports hours. */
  pioneers: { name: string; role: string }[];
  message: string;
  /** Recipient addresses for this group: the overseer, else the assistant. */
  emails: string[];
  /**
   * The group's own page, where the overseer can send the missing reports. Null
   * once the month has gone to the branch — the page could not accept anything
   * then, so the reminder asks for the reports directly instead.
   */
  link: string | null;
};

export type MissingReport = {
  name: string;
  /** The secretary noted that no report came in. */
  noted: boolean;
  /** "Regular pioneer", "Auxiliary pioneer" or "Special pioneer" for this month; null otherwise. */
  pioneer: string | null;
  /** A pioneer whose report is in but carries no hours. */
  hoursOnly: boolean;
};

/**
 * Who pioneers in a given month, the way the report sheet reads it: a regular
 * or special pioneer every month, an auxiliary pioneer in the months an
 * approval covers (or every month while none is recorded for them).
 */
function pioneerRole(
  p: { pioneerStatus: string; auxApprovals: { startYear: number; startMonth: number; months: number | null }[] },
  year: number,
  month: number,
): string | null {
  if (p.pioneerStatus === "REGULAR") return "Regular pioneer";
  if (p.pioneerStatus === "SPECIAL") return "Special pioneer";
  if (p.auxApprovals.some((a) => auxCovers(a, year, month))) return "Auxiliary pioneer";
  if (p.pioneerStatus === "AUXILIARY" && p.auxApprovals.length === 0) return "Auxiliary pioneer";
  return null;
}

/** One line of the reminder for someone still to report. */
function missingLine(m: MissingReport): string {
  if (m.hoursOnly) return `• ${m.name} — ${m.pioneer}: report received, but without hours`;
  const notes = [m.pioneer ? `${m.pioneer}, report with hours` : null, m.noted ? "no report received" : null]
    .filter(Boolean);
  return `• ${m.name}${notes.length ? ` — ${notes.join("; ")}` : ""}`;
}

export type ReminderDigest = {
  year: number;
  month: number;
  label: string;
  /** True once the congregation's report for this month has been submitted. */
  closed: boolean;
  groups: ReminderGroup[];
  totalMissing: number;
};

/** How the overseer is addressed in the reminder, without guessing a title. */
export function addressed(p: ReminderPerson | null | undefined): string | null {
  if (!p) return null;
  const title = p.gender === "MALE" ? "Brother" : p.gender === "FEMALE" ? "Sister" : "";
  return title ? `${title} ${p.lastName}` : displayName(p);
}

/** wa.me takes digits only, in international format, and no plus sign. */
export function waHref(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = `234${digits.slice(1)}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Everyone still to report for a month, grouped by field service group, each
 * with the reminder text ready to send. A publisher counts as outstanding when
 * they have no report on file, or when the secretary noted "no report" came in.
 */
export async function gatherReminders(year: number, month: number): Promise<ReminderDigest> {
  const label = monthLabel(year, month);

  const [closed, publishers] = await Promise.all([
    isClosed(year, month),
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        groupId: true,
        sinceDate: true,
        pioneerStatus: true,
        auxApprovals: { select: { startYear: true, startMonth: true, months: true } },
        group: {
          select: {
            number: true,
            name: true,
            overseer: { select: { firstName: true, lastName: true, gender: true, phone: true, email: true } },
            assistant: { select: { firstName: true, lastName: true, gender: true, phone: true, email: true } },
          },
        },
        reports: { where: { year, month }, select: { outcome: true, hours: true } },
      },
      orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  // A publisher recorded as moving in or starting after the month asked about
  // was not on the roll yet, so nothing was expected of them for it.
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  type Bucket = {
    id: string | null;
    number: number | null;
    name: string | null;
    overseer: ReminderPerson | null;
    assistant: ReminderPerson | null;
    members: number;
    missing: MissingReport[];
    pioneers: { name: string; role: string }[];
  };
  const buckets = new Map<string, Bucket>();

  for (const p of publishers) {
    if (p.sinceDate && p.sinceDate > monthEnd) continue;
    const key = p.groupId ?? "none";
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        id: p.groupId,
        number: p.group?.number ?? null,
        name: p.group?.name ?? null,
        overseer: p.group?.overseer ?? null,
        assistant: p.group?.assistant ?? null,
        members: 0,
        missing: [],
        pioneers: [],
      };
      buckets.set(key, bucket);
    }
    bucket.members++;
    const name = displayName(p);
    const pioneer = pioneerRole(p, year, month);
    if (pioneer) bucket.pioneers.push({ name, role: pioneer });
    const report = p.reports[0];
    if (!report || report.outcome === "NO_REPORT") {
      bucket.missing.push({ name, noted: report?.outcome === "NO_REPORT", pioneer, hoursOnly: false });
    } else if (pioneer && report.outcome === "SHARED" && report.hours == null) {
      // A pioneer's report is not complete without the hours.
      bucket.missing.push({ name, noted: false, pioneer, hoursOnly: true });
    }
  }

  const outstanding = [...buckets.values()]
    .filter((b) => b.missing.length > 0)
    .sort((a, b) => ((a.number ?? 9999) - (b.number ?? 9999)) || (a.name?.localeCompare(b.name ?? "") ?? 0));

  // One pass for every group, so the reminders page and the scheduled email do
  // not each pay for a round trip per group. A month already at the branch gets
  // no links at all: the group's page could not accept a report for it, so
  // handing one out would only mislead.
  const [origin, tokens] = await Promise.all([
    requestOrigin(),
    closed
      ? Promise.resolve(new Map<string, string>())
      : ensureGroupTokens(outstanding.map((b) => b.id).filter((id): id is string => Boolean(id))),
  ]);

  const groups: ReminderGroup[] = outstanding.map((g) => {
    const title = g.number ? `Group ${g.number}${g.name ? ` — ${g.name}` : ""}` : "No group";
    const where = g.number ? `Group ${g.number}${g.name ? ` — ${g.name}` : ""}` : "publishers with no group";
    const who = addressed(g.overseer);
    const token = g.id ? tokens.get(g.id) : undefined;
    const link = origin && token ? `${origin}/group/${token}?period=${year}-${month}` : null;

    const message = [
      who ? `Good day ${who},` : "Good day,",
      "",
      `These ${where} have not sent their field service report for ${label}:`,
      "",
      ...g.missing.map(missingLine),
      "",
      ...(g.pioneers.length
        ? [
            `The pioneers in the group for ${label}, who report their hours as well:`,
            "",
            ...g.pioneers.map((p) => `• ${p.name} — ${p.role}`),
            "",
          ]
        : []),
      ...(closed
        ? [
            `The congregation's report for ${label} has already been submitted to the branch office,`,
            "so anything that comes now is added to the next month's figure. Kindly remind them to",
            "send it to the secretary.",
          ]
        : [
            link
              ? "Kindly remind them to send it to the secretary — or send it for them here:"
              : "Kindly remind them to send it to the secretary.",
            ...(link ? ["", link] : []),
            "",
            "The congregation's report goes to the branch office by the 20th of the month, and a report",
            "that comes after that is added to the following month's report.",
            ...(link
              ? [
                  "",
                  "This link is for your group only. Please do not forward it, because anyone holding it",
                  "can send reports for your publishers.",
                ]
              : []),
          ]),
      "",
      "Thank you for your help.",
    ].join("\n");

    const emails: string[] = [];
    if (g.overseer?.email) emails.push(g.overseer.email);
    else if (g.assistant?.email) emails.push(g.assistant.email);

    return {
      key: `${g.number ?? "none"}-${g.name ?? ""}`,
      id: g.id,
      number: g.number,
      name: g.name,
      title,
      where,
      who,
      overseer: g.overseer,
      assistant: g.assistant,
      members: g.members,
      missing: g.missing,
      pioneers: g.pioneers,
      message,
      emails,
      link,
    };
  });

  return {
    year,
    month,
    label,
    closed,
    groups,
    totalMissing: groups.reduce((t, g) => t + g.missing.length, 0),
  };
}

export type SendSummary = {
  configured: boolean;
  sent: number;
  failed: number;
  noEmail: number;
  errors: string[];
};

/**
 * Email each group's reminder to its overseer (or assistant when the overseer
 * has no address). Groups with no address on file are counted, not sent, so
 * the caller can point the secretary at WhatsApp for those. Never throws.
 */
export async function sendReminderEmails(year: number, month: number): Promise<SendSummary> {
  const summary: SendSummary = {
    configured: emailConfigured(),
    sent: 0,
    failed: 0,
    noEmail: 0,
    errors: [],
  };
  if (!summary.configured) return summary;

  const { groups, label } = await gatherReminders(year, month);
  for (const g of groups) {
    if (g.emails.length === 0) {
      summary.noEmail++;
      continue;
    }
    const result = await sendEmail(g.emails, `Field service report reminder — ${g.title} (${label})`, g.message, "REMINDER");
    if (result.ok) summary.sent++;
    else {
      summary.failed++;
      summary.errors.push(`${g.title}: ${result.error ?? "send failed"}`);
    }
  }
  return summary;
}
