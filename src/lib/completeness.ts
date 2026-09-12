import { monthLabel, reportingMonth, serviceYearMonths, serviceYearOf } from "@/lib/service-year";

/**
 * Record completeness review.
 *
 * Flags active publishers whose file is missing information the secretary
 * needs: bio-data, a way to reach them, a service group, this month's field
 * service report, or reports for earlier months in the current service year.
 *
 * Contact fields are only considered when the viewer is allowed to read them
 * (`publisher:readContact`); otherwise the contact check is skipped entirely
 * so a read-only account never learns whether a number is on file.
 */

export type ReviewMonth = { year: number; month: number; label: string };

export type PublisherInput = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  baptismDate: Date | null;
  isBaptized: boolean;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  groupId: string | null;
  pioneerStatus: string;
  createdAt: Date;
  group: { number: number; name: string } | null;
  reports: { year: number; month: number }[];
};

export type Review = {
  id: string;
  name: string;
  group: string | null;
  groupId: string | null;
  pioneerStatus: string;
  missing: {
    bio: string[];
    contact: string[];
    group: boolean;
    thisMonth: boolean;
    otherMonths: ReviewMonth[];
  };
  values: {
    dateOfBirth: string;
    baptismDate: string;
    isBaptized: boolean;
    phone: string;
    email: string;
    address: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  };
  issueCount: number;
};

export type ReviewSummary = {
  total: number;
  complete: number;
  bio: number;
  contact: number;
  group: number;
  thisMonth: number;
  otherMonths: number;
};

export type ReviewResult = {
  reviews: Review[];
  summary: ReviewSummary;
  thisMonth: ReviewMonth;
  serviceYearMonths: ReviewMonth[];
};

function toInput(value: Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Months of the current service year that have already ended, September first. */
export function reviewMonths(now = new Date()): { thisMonth: ReviewMonth; months: ReviewMonth[] } {
  const rm = reportingMonth(now);
  const sy = serviceYearOf(rm.year, rm.month);
  const all = serviceYearMonths(sy);
  const months: ReviewMonth[] = [];
  for (const m of all) {
    months.push({ year: m.year, month: m.month, label: m.label });
    if (m.year === rm.year && m.month === rm.month) break;
  }
  return {
    thisMonth: { year: rm.year, month: rm.month, label: monthLabel(rm.year, rm.month) },
    months,
  };
}

export function reviewPublishers(
  publishers: PublisherInput[],
  opts: { includeContact: boolean; now?: Date },
): ReviewResult {
  const { thisMonth, months } = reviewMonths(opts.now);

  const summary: ReviewSummary = {
    total: publishers.length,
    complete: 0,
    bio: 0,
    contact: 0,
    group: 0,
    thisMonth: 0,
    otherMonths: 0,
  };

  const reviews: Review[] = publishers.map((p) => {
    const reported = new Set(p.reports.map((r) => `${r.year}-${r.month}`));

    const bio: string[] = [];
    if (!p.dateOfBirth) bio.push("Date of birth");
    if (p.isBaptized && !p.baptismDate) bio.push("Baptism date");

    const contact: string[] = [];
    if (opts.includeContact) {
      if (!p.phone && !p.email) contact.push("Phone or email");
      if (!p.address) contact.push("Address");
      if (!p.emergencyContactName || !p.emergencyContactPhone) contact.push("Emergency contact");
    }

    const groupMissing = !p.groupId;
    const thisMonthMissing = !reported.has(`${thisMonth.year}-${thisMonth.month}`);

    // Only fault a publisher for months that ended after they were added.
    const otherMonths = months.filter((m) => {
      if (m.year === thisMonth.year && m.month === thisMonth.month) return false;
      const monthEnd = new Date(Date.UTC(m.year, m.month, 1));
      if (p.createdAt >= monthEnd) return false;
      return !reported.has(`${m.year}-${m.month}`);
    });

    if (bio.length) summary.bio++;
    if (contact.length) summary.contact++;
    if (groupMissing) summary.group++;
    if (thisMonthMissing) summary.thisMonth++;
    if (otherMonths.length) summary.otherMonths++;

    const issueCount =
      bio.length + contact.length + (groupMissing ? 1 : 0) + (thisMonthMissing ? 1 : 0) + otherMonths.length;
    if (issueCount === 0) summary.complete++;

    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      group: p.group ? `${p.group.number} — ${p.group.name}` : null,
      groupId: p.groupId,
      pioneerStatus: p.pioneerStatus,
      missing: { bio, contact, group: groupMissing, thisMonth: thisMonthMissing, otherMonths },
      values: {
        dateOfBirth: toInput(p.dateOfBirth),
        baptismDate: toInput(p.baptismDate),
        isBaptized: p.isBaptized,
        phone: p.phone ?? "",
        email: p.email ?? "",
        address: p.address ?? "",
        emergencyContactName: p.emergencyContactName ?? "",
        emergencyContactPhone: p.emergencyContactPhone ?? "",
      },
      issueCount,
    };
  });

  reviews.sort((a, b) => b.issueCount - a.issueCount || a.name.localeCompare(b.name));

  return { reviews, summary, thisMonth, serviceYearMonths: months };
}
