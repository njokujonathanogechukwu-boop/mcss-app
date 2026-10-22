import "server-only";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";
import { emailConfigured, sendEmail } from "@/lib/email";
import { isClosed } from "@/lib/report-periods";
import { statusForMonth } from "@/lib/pioneer-status";
import { loadPioneerStarts } from "@/lib/pioneer-review";
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
  /** Inactive publishers in the group, for the overseer to reach out to. */
  inactive: InactivePublisher[];
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

export type InactivePublisher = {
  name: string;
  /** The last month they reported, as "March 2026"; null when none is on file. */
  lastReported: string | null;
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
  regularStart: { year: number; month: number } | null,
  year: number,
  month: number,
): string | null {
  const status = statusForMonth({ ...p, regularStart }, year, month);
  if (status === "REGULAR") return "Regular pioneer";
  if (status === "SPECIAL") return "Special pioneer";
  if (status === "AUXILIARY") return "Auxiliary pioneer";
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
  /** Every group with publishers on the roll, reported or not, for the status update. */
  summary: { title: string; members: number; missing: number }[];
  /** The status update for the congregation's general group, ready to paste. */
  status: string;
};

/**
 * How far each group has got with the month's reports, one line a group, for
 * posting in the congregation's general group. Names are left out on purpose:
 * it goes to everyone, so it says only how many are still to come.
 */
export function statusMessage(
  label: string,
  summary: { title: string; members: number; missing: number }[],
): string {
  const people = (n: number) => `${n} publisher${n === 1 ? "" : "s"}`;
  const members = summary.reduce((t, g) => t + g.members, 0);
  const missing = summary.reduce((t, g) => t + g.missing, 0);
  return [
    `Field service report status for ${label} (hours, Bible studies and remarks):`,
    "",
    ...summary.map((g) =>
      `${g.title} - ${people(g.members)} - ${g.missing ? `${g.missing} yet to submit` : "All submitted ✅"}`),
    "",
    missing
      ? `Total: ${missing} of ${people(members)} yet to submit.`
      : `Total: all ${people(members)} submitted ✅ Thank you!`,
  ].join("\n");
}

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

  const [closed, publishers, inactivePublishers, starts] = await Promise.all([
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
    // Inactive publishers are not asked for a report, but their overseer is
    // asked to reach out to them, with the last month they reported.
    prisma.publisher.findMany({
      where: { status: "INACTIVE" },
      select: {
        firstName: true,
        lastName: true,
        groupId: true,
        group: {
          select: {
            number: true,
            name: true,
            overseer: { select: { firstName: true, lastName: true, gender: true, phone: true, email: true } },
            assistant: { select: { firstName: true, lastName: true, gender: true, phone: true, email: true } },
          },
        },
        reports: {
          where: { outcome: { in: ["SHARED", "DID_NOT_PREACH"] } },
          select: { year: true, month: true },
          orderBy: [{ year: "desc" }, { month: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    loadPioneerStarts(),
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
    inactive: InactivePublisher[];
  };
  const buckets = new Map<string, Bucket>();
  const bucketFor = (p: {
    groupId: string | null;
    group: { number: number; name: string; overseer: ReminderPerson | null; assistant: ReminderPerson | null } | null;
  }): Bucket => {
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
        inactive: [],
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const p of publishers) {
    if (p.sinceDate && p.sinceDate > monthEnd) continue;
    const bucket = bucketFor(p);
    bucket.members++;
    const name = displayName(p);
    const pioneer = pioneerRole(p, starts[p.id] ?? null, year, month);
    if (pioneer) bucket.pioneers.push({ name, role: pioneer });
    const report = p.reports[0];
    if (!report || report.outcome === "NO_REPORT") {
      bucket.missing.push({ name, noted: report?.outcome === "NO_REPORT", pioneer, hoursOnly: false });
    } else if (pioneer && report.outcome === "SHARED" && report.hours == null) {
      // A pioneer's report is not complete without the hours.
      bucket.missing.push({ name, noted: false, pioneer, hoursOnly: true });
    }
  }

  for (const p of inactivePublishers) {
    const last = p.reports[0];
    bucketFor(p).inactive.push({
      name: displayName(p),
      lastReported: last ? monthLabel(last.year, last.month) : null,
    });
  }

  // A group is written to when reports are outstanding, or when it has
  // inactive publishers its overseer is asked to encourage.
  const outstanding = [...buckets.values()]
    .filter((b) => b.missing.length > 0 || b.inactive.length > 0)
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
    // A group named only by its number ("Group 9") is not called "Group 9 — Group 9".
    const named = g.name && g.name.trim().toLowerCase() !== `group ${g.number}` ? ` — ${g.name}` : "";
    const title = g.number ? `Group ${g.number}${named}` : "No group";
    const where = g.number ? `Group ${g.number}${named}` : "publishers with no group";
    const who = addressed(g.overseer);
    const token = g.id ? tokens.get(g.id) : undefined;
    const link = origin && token ? `${origin}/group/${token}?period=${year}-${month}` : null;

    const message = [
      who ? `Good day ${who},` : "Good day,",
      "",
      ...(g.missing.length
        ? [`These ${where} have not sent their field service report for ${label}:`, "", ...g.missing.map(missingLine), ""]
        : [`Everyone in ${where} has sent their field service report for ${label}. Thank you.`, ""]),
      ...(g.pioneers.length
        ? [
            `The pioneers in the group for ${label}, who report their hours as well:`,
            "",
            ...g.pioneers.map((p) => `• ${p.name} — ${p.role}`),
            "",
          ]
        : []),
      ...(g.missing.length === 0
        ? []
        : closed
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
      ...(g.inactive.length
        ? [
            // After the report lines a blank line parts them; the all-reported line has its own.
            ...(g.missing.length ? [""] : []),
            `${g.inactive.length === 1 ? "This publisher" : "These publishers"} in the group ${g.inactive.length === 1 ? "is" : "are"} inactive at present:`,
            "",
            ...g.inactive.map((p) => `• ${p.name}${p.lastReported ? ` — last reported ${p.lastReported}` : ""}`),
            "",
            "Please make a point of reaching out to them this month. A warm call or visit, a kind word",
            "or an invitation to the meeting can do much to encourage them, and to let them know they",
            "are loved and missed. Kindly let the elders know of any who would welcome further help.",
          ]
        : []),
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
      inactive: g.inactive,
      message,
      emails,
      link,
    };
  });

  const summary = [...buckets.values()]
    .filter((b) => b.members > 0)
    .sort((a, b) => ((a.number ?? 9999) - (b.number ?? 9999)) || (a.name?.localeCompare(b.name ?? "") ?? 0))
    .map((b) => ({ title: b.number ? `Group ${b.number}` : "No group", members: b.members, missing: b.missing.length }));

  return {
    year,
    month,
    label,
    closed,
    groups,
    totalMissing: groups.reduce((t, g) => t + g.missing.length, 0),
    summary,
    status: statusMessage(label, summary),
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
