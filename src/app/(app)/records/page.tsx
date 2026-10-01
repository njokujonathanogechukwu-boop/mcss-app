import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { reviewPublishers, withholdValues } from "@/lib/completeness";
import { PageHeader, Section, EmptyState } from "@/components/shell";
import { Button } from "@/components/ui";
import { ReviewTable } from "./review-table";

export const dynamic = "force-dynamic";

type Filter = "all" | "bio" | "contact" | "group" | "thisMonth" | "otherMonths";

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; show?: string }>;
}) {
  const user = await requirePermission("publisher:read");
  const sp = await searchParams;
  const showContact = can(user.role, "publisher:readContact");
  const filter = (sp.show as Filter) ?? "all";

  const [publishers, groups] = await Promise.all([
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] }, ...(sp.group ? { groupId: sp.group } : {}) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        baptismDate: true,
        isBaptized: true,
        pioneerStatus: true,
        groupId: true,
        createdAt: true,
        group: { select: { number: true, name: true } },
        reports: { select: { year: true, month: true, outcome: true } },
        ...(showContact
          ? {
              phone: true,
              email: true,
              address: true,
              emergencyContactName: true,
              emergencyContactPhone: true,
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.serviceGroup.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
  ]);

  const { reviews, summary, thisMonth } = reviewPublishers(
    publishers.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      baptismDate: p.baptismDate,
      isBaptized: p.isBaptized,
      pioneerStatus: p.pioneerStatus,
      groupId: p.groupId,
      createdAt: p.createdAt,
      group: p.group,
      reports: p.reports,
      phone: "phone" in p ? (p.phone as string | null) : null,
      email: "email" in p ? (p.email as string | null) : null,
      address: "address" in p ? (p.address as string | null) : null,
      emergencyContactName: "emergencyContactName" in p ? (p.emergencyContactName as string | null) : null,
      emergencyContactPhone: "emergencyContactPhone" in p ? (p.emergencyContactPhone as string | null) : null,
    })),
    { includeContact: showContact },
  );

  // Who may fill the gaps but not read the records: the values already on
  // file never leave the server for them, and only empty fields are offered.
  const gapsOnly = can(user.role, "records:fix") && !can(user.role, "publisher:write");
  const flags = {
    canEditPublisher: can(user.role, "records:fix"),
    canEditContact: can(user.role, "records:fix") && showContact,
    canEditGroup: can(user.role, "publisher:write"),
    canEditReport: can(user.role, "report:write"),
  };

  const filtered = reviews.filter((r) => {
    switch (filter) {
      case "bio":
        return r.missing.bio.length > 0;
      case "contact":
        return r.missing.contact.length > 0;
      case "group":
        return r.missing.group;
      case "thisMonth":
        return r.missing.thisMonth;
      case "otherMonths":
        return r.missing.otherMonths.length > 0;
      default:
        return r.issueCount > 0;
    }
  });

  const cards: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Incomplete records", count: summary.total - summary.complete },
    { key: "bio", label: "Missing bio-data", count: summary.bio },
    ...(showContact ? [{ key: "contact" as Filter, label: "Missing contact", count: summary.contact }] : []),
    { key: "group", label: "No service group", count: summary.group },
    { key: "thisMonth", label: `No report for ${thisMonth.label}`, count: summary.thisMonth },
    { key: "otherMonths", label: "Missing earlier months", count: summary.otherMonths },
  ];

  const keep = (key: Filter) => {
    const params = new URLSearchParams();
    if (sp.group) params.set("group", sp.group);
    if (key !== "all") params.set("show", key);
    const q = params.toString();
    return `/records${q ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Records check"
        description={`${summary.complete} of ${summary.total} active publishers have a complete file. Pick a card to see who is missing what, then fix it in place.`}
        actions={
          <>
            {can(user.role, "export:run") && showContact && (
              <a
                href={`/api/exports/publishers${sp.group ? `?group=${sp.group}` : ""}`}
                target="_blank"
                rel="noopener"
              >
                <Button variant="secondary" size="sm">Download bio-data &amp; contacts</Button>
              </a>
            )}
            <Link href="/m/records">
              <Button variant="secondary" size="sm">Open phone app</Button>
            </Link>
          </>
        }
      />

      <form method="get" className="mb-6 grid gap-3 rounded border border-rule bg-surface p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="group" className="field-label">Group</label>
          <select id="group" name="group" defaultValue={sp.group ?? ""} className="field-input">
            <option value="">Every group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.number} — {g.name}</option>
            ))}
          </select>
        </div>
        {filter !== "all" && <input type="hidden" name="show" value={filter} />}
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full">Apply</Button>
        </div>
      </form>

      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const active = filter === c.key;
          return (
            <Link
              key={c.key}
              href={keep(c.key)}
              className={`rounded border p-4 transition-colors ${
                active ? "border-pine bg-pine-light" : "border-rule bg-surface hover:border-ink-faint"
              }`}
            >
              <p className="font-serif text-2xl text-ink">{c.count}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{c.label}</p>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing outstanding here"
          description="Every publisher in this view has the information on file. Try another card or group."
        />
      ) : (
        <Section title={`${filtered.length} publisher${filtered.length === 1 ? "" : "s"} to review`}>
          <ReviewTable reviews={gapsOnly ? withholdValues(filtered) : filtered} groups={groups} month={thisMonth} flags={flags} />
        </Section>
      )}
    </>
  );
}
