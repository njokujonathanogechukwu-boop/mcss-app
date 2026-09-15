import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  reportingMonth, monthLabel, currentServiceYear, serviceYearMonths,
} from "@/lib/service-year";
import { displayName, formatDate, PIONEER_LABELS } from "@/lib/format";
import { auxCovers, auxPeriodLabel } from "@/lib/auxiliary";
import { PageHeader, Section, EmptyState } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import { AuxApprovalForm, AnnounceForm } from "./aux-forms";
import { closeApproval } from "./actions";

export const dynamic = "force-dynamic";

export default async function AuxiliaryPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;

  const fallback = reportingMonth();
  const [yStr, mStr] = (sp.period ?? `${fallback.year}-${fallback.month}`).split("-");
  const year = Number(yStr) || fallback.year;
  const month = Number(mStr) || fallback.month;

  const [approvals, publishers, people] = await Promise.all([
    prisma.auxiliaryPioneer.findMany({
      include: { publisher: { select: { firstName: true, lastName: true, status: true } } },
      orderBy: [{ publisher: { lastName: "asc" } }, { publisher: { firstName: "asc" } }],
    }),
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] }, pioneerStatus: { not: "NONE" } },
      include: { reports: { where: { year, month }, select: { hours: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const forMonth = approvals.filter((a) => auxCovers(a, year, month));
  const pending = forMonth.filter((a) => !a.announcedAt);
  const coveredIds = new Set(forMonth.map((a) => a.publisherId));
  const periodOptions = [
    ...serviceYearMonths(currentServiceYear()),
    ...serviceYearMonths(currentServiceYear() - 1),
  ];
  const canWrite = can(user.role, "publisher:write");
  const canAnnounce = can(user.role, "announcement:approve");

  return (
    <>
      <PageHeader
        back={{ href: "/reports", label: "Field service reports" }}
        title="Auxiliary pioneers"
        description={`${forMonth.length} approved for ${monthLabel(year, month)} · ${
          pending.length
        } not yet announced · ${publishers.length} publisher(s) expected to report hours.`}
      />

      <form method="get" className="mb-3 grid gap-3 rounded border border-rule bg-surface p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="period" className="field-label">Month</label>
          <select id="period" name="period" defaultValue={`${year}-${month}`} className="field-input">
            {periodOptions.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="secondary" className="w-full">Show this month</Button>
        </div>
      </form>

      {canAnnounce && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded border border-rule bg-surface px-4 py-3">
          <p className="text-xs text-ink-soft">
            {pending.length > 0
              ? `${pending.length} approval(s) for ${monthLabel(year, month)} have not been announced yet.`
              : `Every approval for ${monthLabel(year, month)} has been announced.`}
          </p>
          <AnnounceForm year={year} month={month} />
        </div>
      )}

      <Section
        title={`Approved for ${monthLabel(year, month)}`}
        description="Everyone serving as an auxiliary pioneer this month, with the span from their application."
      >
        {forMonth.length === 0 ? (
          <EmptyState
            title="No auxiliary pioneers this month"
            description="Record an approved application below and it will appear here and on the report sheet."
          />
        ) : (
          <ul className="divide-y divide-rule rounded border border-rule bg-surface">
            {forMonth.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    <Link href={`/publishers/${a.publisherId}`} className="hover:text-pine hover:underline">
                      {displayName(a.publisher)}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {auxPeriodLabel(a)}
                    {a.publisher.status !== "ACTIVE" && " · publisher no longer active"}
                    {a.notes ? ` · ${a.notes}` : ""}
                  </p>
                  {a.announcedAt ? (
                    <p className="mt-0.5 text-xxs text-pine-dark">
                      Announced {formatDate(a.announcedAt)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xxs text-clay">Recorded, not yet announced</p>
                  )}
                </div>
                {canWrite && a.months == null && (
                  <form action={closeApproval} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="year" value={year} />
                    <input type="hidden" name="month" value={month} />
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Closing…">
                      End service in {monthLabel(year, month)}
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Expect an hours report from"
        description={`Everyone recorded as an auxiliary, regular or special pioneer — the report sheet asks them for hours in ${monthLabel(year, month)}.`}
      >
        {publishers.length === 0 ? (
          <EmptyState
            title="Nobody is expected to report hours"
            description="Auxiliary and regular pioneers appear here once their status is set."
          />
        ) : (
          <ul className="divide-y divide-rule rounded border border-rule bg-surface">
            {publishers.map((p) => {
              const report = p.reports[0];
              const covered = coveredIds.has(p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/publishers/${p.id}`} className="text-sm font-medium text-ink hover:text-pine hover:underline">
                      {displayName(p)}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {PIONEER_LABELS[p.pioneerStatus] ?? p.pioneerStatus}
                    </p>
                    {p.pioneerStatus === "AUXILIARY" && !covered && (
                      <p className="mt-0.5 text-xxs text-clay">
                        No approval covers {monthLabel(year, month)} — clear their pioneer status if the service has ended.
                      </p>
                    )}
                  </div>
                  {report ? (
                    <p className="text-xs text-pine-dark">Reported · {report.hours} hours</p>
                  ) : (
                    <p className="text-xs text-clay">No report yet</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {canWrite && (
        <Section
          title="Record an approved application"
          description="Enter what the application form says: the start month and either a number of months or nothing at all for indefinite service."
        >
          <AuxApprovalForm people={people.map((p) => ({ value: p.id, label: displayName(p) }))} />
        </Section>
      )}
    </>
  );
}
