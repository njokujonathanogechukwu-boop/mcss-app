import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  reportingMonth, monthLabel, currentServiceYear, serviceYearMonths,
  serviceYearLabel, serviceYearOptions, serviceYearOf,
} from "@/lib/service-year";
import { displayName } from "@/lib/format";
import { PageHeader, Section, EmptyState } from "@/components/shell";
import { Button } from "@/components/ui";
import { ReportSheet, type SheetRow } from "./report-sheet";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; group?: string }>;
}) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;

  const fallback = reportingMonth();
  const [yStr, mStr] = (sp.period ?? `${fallback.year}-${fallback.month}`).split("-");
  const year = Number(yStr) || fallback.year;
  const month = Number(mStr) || fallback.month;
  const serviceYear = serviceYearOf(year, month);

  const [publishers, groups] = await Promise.all([
    prisma.publisher.findMany({
      where: {
        status: { in: ["ACTIVE", "IRREGULAR"] },
        ...(sp.group ? { groupId: sp.group } : {}),
      },
      include: {
        group: { select: { number: true, name: true } },
        reports: { where: { year, month } },
      },
      orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.serviceGroup.findMany({ where: { active: true }, orderBy: { number: "asc" } }),
  ]);

  const rows: SheetRow[] = publishers.map((p) => {
    const existing = p.reports[0];
    return {
      id: p.id,
      name: displayName(p),
      group: p.group ? `Group ${p.group.number}` : "No group",
      pioneerStatus: p.pioneerStatus,
      existing: existing
        ? {
            sharedInMinistry: existing.sharedInMinistry,
            bibleStudies: existing.bibleStudies,
            hours: existing.hours,
            pioneerStatusUsed: existing.pioneerStatusUsed,
            remarks: existing.remarks,
          }
        : null,
    };
  });

  const onFile = rows.filter((r) => r.existing).length;
  const periodOptions = [
    ...serviceYearMonths(currentServiceYear()),
    ...serviceYearMonths(currentServiceYear() - 1),
  ];

  return (
    <>
      <PageHeader
        title="Field service reports"
        description={`${onFile} of ${rows.length} publishers have a report on file for ${monthLabel(year, month)}.`}
        actions={
          <Link href={`/reports/summary?sy=${serviceYear}`}>
            <Button variant="secondary" size="sm">Service year summary</Button>
          </Link>
        }
      />

      <form method="get" className="mb-6 grid gap-3 rounded border border-rule bg-surface p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="period" className="field-label">Reporting month</label>
          <select id="period" name="period" defaultValue={`${year}-${month}`} className="field-input">
            {periodOptions.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="group" className="field-label">Group</label>
          <select id="group" name="group" defaultValue={sp.group ?? ""} className="field-input">
            <option value="">Every group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.number} — {g.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full">Show the sheet</Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="No publishers to report on"
          description="Add publishers or choose a different group to see the report sheet."
          action={<Link href="/publishers/new"><Button variant="secondary">Add a publisher</Button></Link>}
        />
      ) : can(user.role, "report:write") ? (
        <ReportSheet rows={rows} year={year} month={month} monthLabel={monthLabel(year, month)} />
      ) : (
        <Section>
          <p className="rounded border border-rule bg-surface px-4 py-5 text-sm text-ink-soft">
            Your account can view reports but not record them. Ask the secretary for access.
          </p>
        </Section>
      )}
    </>
  );
}
