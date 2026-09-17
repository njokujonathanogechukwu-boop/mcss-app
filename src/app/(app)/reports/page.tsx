import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  reportingMonth, monthLabel, currentServiceYear, serviceYearMonths,
  serviceYearLabel, serviceYearOptions, serviceYearOf,
} from "@/lib/service-year";
import { displayName, formatDate } from "@/lib/format";
import { auxCovers } from "@/lib/auxiliary";
import { PageHeader, Section, EmptyState } from "@/components/shell";
import { Button } from "@/components/ui";
import { ReportSheet, type SheetRow } from "./report-sheet";
import { getPeriod, outstandingLateReports } from "@/lib/report-periods";
import { CloseMonthButton, ReopenMonthButton } from "./close-month";

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

  const [publishers, groups, approvals] = await Promise.all([
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
    prisma.auxiliaryPioneer.findMany({
      select: { publisherId: true, startYear: true, startMonth: true, months: true },
    }),
  ]);

  const applied = new Set<string>();
  const covered = new Set<string>();
  for (const a of approvals) {
    applied.add(a.publisherId);
    if (auxCovers(a, year, month)) covered.add(a.publisherId);
  }

  // A publisher recorded as moving in or starting after this month was not on
  // the roll yet, so no report is expected of them for it.
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const rows: SheetRow[] = publishers
    .filter((p) => !p.sinceDate || p.sinceDate <= monthEnd)
    .map((p) => {
      const existing = p.reports[0];
      return {
        id: p.id,
        name: displayName(p),
        group: p.group ? `Group ${p.group.number}` : "No group",
        pioneerStatus: p.pioneerStatus,
        pioneerForMonth:
          p.pioneerStatus === "NONE"
            ? false
            : p.pioneerStatus === "AUXILIARY"
              ? !applied.has(p.id) || covered.has(p.id)
              : true,
        existing: existing
          ? {
              outcome: existing.outcome,
              bibleStudies: existing.bibleStudies,
              hours: existing.hours,
              pioneerStatusUsed: existing.pioneerStatusUsed,
              remarks: existing.remarks,
            }
          : null,
      };
    });

  const shared = rows.filter((r) => r.existing?.outcome === "SHARED").length;
  const didNotPreach = rows.filter((r) => r.existing?.outcome === "DID_NOT_PREACH").length;
  const noReport = rows.filter((r) => r.existing?.outcome === "NO_REPORT").length;
  const outstanding = rows.length - rows.filter((r) => r.existing).length;
  const isOpenMonth = year === fallback.year && month === fallback.month;
  const [period, outstandingLate] = await Promise.all([getPeriod(year, month), outstandingLateReports()]);
  const canWrite = can(user.role, "report:write");
  const hasEnded = year * 12 + month <= fallback.year * 12 + fallback.month;
  const periodOptions = [
    ...serviceYearMonths(currentServiceYear()),
    ...serviceYearMonths(currentServiceYear() - 1),
  ];

  return (
    <>
      <PageHeader
        title="Field service reports"
        description={`${shared} shared · ${didNotPreach} did not preach · ${noReport} no report · ${outstanding} not yet recorded for ${monthLabel(year, month)}.`}
        actions={
          <>
            {can(user.role, "export:run") && (
              <a href={`/api/exports/s1?year=${year}&month=${month}`} target="_blank" rel="noopener">
                <Button size="sm">Download S-1 for {monthLabel(year, month)}</Button>
              </a>
            )}
            <Link href={`/reports/reminders?period=${year}-${month}`}>
              <Button variant="secondary" size="sm">Who has not reported</Button>
            </Link>
            <Link href={`/reports/auxiliary?period=${year}-${month}`}>
              <Button variant="secondary" size="sm">Auxiliary pioneers</Button>
            </Link>
            <Link href={`/reports/summary?sy=${serviceYear}`}>
              <Button variant="secondary" size="sm">Service year summary</Button>
            </Link>
            <Link href={`/reports/s10?sy=${serviceYear}`}>
              <Button variant="secondary" size="sm">Congregation analysis (S-10)</Button>
            </Link>
            <Link href={`/reports/pioneers?sy=${serviceYear}`}>
              <Button variant="secondary" size="sm">Pioneer review</Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 rounded border border-rule bg-surface px-4 py-3 text-sm">
        {period ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-soft">
              <span className="font-medium text-pine-dark">Submitted to the branch</span> on{" "}
              {formatDate(period.submittedAt)}. {period.onTimeIds.length} reported on time
              {period.lateKeys.length
                ? `; ${period.lateKeys.length} late report(s) rolled into this month&rsquo;s figure`
                : ""}
              . Reports you add for {monthLabel(year, month)} now are treated as late and roll into
              the next month you close.
            </p>
            {canWrite && <ReopenMonthButton year={year} month={month} />}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-soft">
              {isOpenMonth
                ? `The congregation's report for ${monthLabel(year, month)} is due to the branch office by the 20th. `
                : `${monthLabel(year, month)} has not been submitted to the branch yet. `}
              {outstandingLate.length > 0 &&
                `${outstandingLate.length} late report(s) from earlier months will roll into this month when you close it. `}
              A report that comes in after you close is added to the following month&rsquo;s report
              and marked late — it does not make a publisher irregular.
            </p>
            {canWrite && hasEnded && <CloseMonthButton year={year} month={month} />}
          </div>
        )}
      </div>

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
