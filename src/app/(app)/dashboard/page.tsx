import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  currentServiceYear, serviceYearMonths, serviceYearLabel, serviceYearSpan, monthLabel, serviceYearOptions, serviceYearOf, dayPart,
} from "@/lib/service-year";
import { collectingMonth } from "@/lib/report-periods";
import { analyse, parsePeriod, periodKey } from "@/lib/analysis";
import { formatDate, formatTimeRange, displayName } from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td, EmptyState, Notice } from "@/components/shell";
import { Badge, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; sy?: string; period?: string }>;
}) {
  const user = await requireUser();
  const { denied, sy, period: periodParam } = await searchParams;

  const now = new Date();
  const thisYear = currentServiceYear(now);
  const collecting = await collectingMonth();

  // The month being looked at defaults to the one reports are being collected
  // for; the strip follows whichever service year that month falls in.
  const period = parsePeriod(periodParam) ?? collecting;
  const serviceYear = Number(sy) || serviceYearOf(period.year, period.month);
  const months = serviceYearMonths(serviceYear);
  const monthOptions = serviceYearMonths(serviceYear).filter(
    (m) => new Date(Date.UTC(m.year, m.month - 1, 1)) <= new Date(),
  );
  const monthAnalysis = await analyse(period, period);
  const t = monthAnalysis.totals;

  const [activePublishers, reportsThisYear, missing, pendingBookings, openItems, upcoming] =
    await Promise.all([
      prisma.publisher.count({ where: { status: { in: ["ACTIVE", "IRREGULAR"] } } }),
      prisma.serviceReport.groupBy({
        by: ["year", "month"],
        where: { OR: months.map((m) => ({ year: m.year, month: m.month })), outcome: { not: "NO_REPORT" } },
        _count: { _all: true },
      }),
      prisma.publisher.findMany({
        where: {
          status: { in: ["ACTIVE", "IRREGULAR"] },
          reports: { none: { year: period.year, month: period.month, outcome: { not: "NO_REPORT" } } },
        },
        select: { id: true, firstName: true, lastName: true, group: { select: { number: true, name: true } } },
        orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }],
        take: 40,
      }),
      can(user.role, "booking:decide")
        ? prisma.hallBooking.count({ where: { status: "PENDING" } })
        : Promise.resolve(0),
      can(user.role, "boe:read")
        ? prisma.boeDecision.findMany({
            where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
            include: { assignedTo: true },
            orderBy: [{ targetDate: "asc" }],
            take: 5,
          })
        : Promise.resolve([]),
      prisma.hallBooking.findMany({
        where: { status: "APPROVED", endTime: { gte: new Date() } },
        include: { resource: true },
        orderBy: { startTime: "asc" },
        take: 5,
      }),
    ]);

  const counts = new Map(reportsThisYear.map((r) => [`${r.year}-${r.month}`, r._count._all]));
  const reported = activePublishers - missing.length;
  const percent = activePublishers ? Math.round((reported / activePublishers) * 100) : 0;

  return (
    <>
      <PageHeader
        title={`Good ${dayPart(now)}, ${user.name.split(" ")[0]}`}
        description={`Service year ${serviceYearLabel(thisYear)} (${serviceYearSpan(thisYear)}). Reports for ${monthLabel(collecting.year, collecting.month)} are being collected.`}
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              <select name="sy" defaultValue={serviceYear} className="field-input py-1 text-xs" aria-label="Service year">
                {serviceYearOptions().map((y) => (
                  <option key={y} value={y}>{serviceYearLabel(y)}</option>
                ))}
              </select>
              <Button type="submit" variant="secondary" size="sm">Show</Button>
            </form>
            {can(user.role, "report:read") && (
              <Link href="/reports/analysis">
                <Button variant="secondary" size="sm">Analysis</Button>
              </Link>
            )}
          </>
        }
      />

      {denied && (
        <Notice tone="error">
          That page is not available to your account. Ask the secretary if you need wider access.
        </Notice>
      )}

      {/* The month strip: which months of the service year have reports on file */}
      <Section
        title="Reporting across the service year"
        description="Each block is one month. Height shows how many reports are on file."
      >
        <div className="rounded border border-rule bg-surface p-5">
          <div className="flex items-end gap-1.5 sm:gap-2.5">
            {months.map((m) => {
              const n = counts.get(`${m.year}-${m.month}`) ?? 0;
              const ratio = activePublishers ? Math.min(n / activePublishers, 1) : 0;
              const isCurrent = m.year === period.year && m.month === period.month;
              return (
                <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-xxs text-ink-faint">{n || ""}</span>
                  <div className="flex h-20 w-full items-end rounded-sm bg-paper">
                    <div
                      className={isCurrent ? "w-full rounded-sm bg-pine" : "w-full rounded-sm bg-rule-strong"}
                      style={{ height: `${Math.max(ratio * 100, n ? 6 : 2)}%` }}
                      title={`${m.label}: ${n} reports`}
                    />
                  </div>
                  <span className={`text-xxs ${isCurrent ? "font-medium text-pine-dark" : "text-ink-faint"}`}>
                    {m.short}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 border-t border-rule pt-3 text-xs text-ink-soft">
            {activePublishers} active publishers · {reported} have reported for{" "}
            {monthLabel(period.year, period.month)} ({percent}%)
          </p>
        </div>
      </Section>

      {can(user.role, "report:read") && (
        <Section
          title={`Compiled summary · ${monthLabel(period.year, period.month)}`}
          description={`${t.onFile} reports on file · ${t.activePublishers} publishers on the roster.`}
          actions={
            <>
              <form method="get" className="flex items-center gap-2">
                <input type="hidden" name="sy" value={serviceYear} />
                <select name="period" defaultValue={periodKey(period)} className="field-input py-1 text-xs" aria-label="Month">
                  {monthOptions.map((m) => (
                    <option key={m.label} value={periodKey(m)}>{m.label}</option>
                  ))}
                </select>
                <Button type="submit" variant="secondary" size="sm">Show</Button>
              </form>
              {can(user.role, "export:run") && (
                <a href={`/api/exports/analysis?from=${periodKey(period)}&to=${periodKey(period)}&format=pdf`} target="_blank" rel="noopener">
                  <Button variant="secondary" size="sm">PDF</Button>
                </a>
              )}
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Regular pioneers", c: t.regular, hours: true },
              { label: "Auxiliary pioneers", c: t.auxiliary, hours: true },
              { label: "Publishers", c: t.publishers, hours: false },
              { label: "Total", c: { reports: t.regular.reports + t.special.reports + t.auxiliary.reports + t.publishers.reports, hours: t.totalHours, studies: t.totalStudies }, hours: true },
            ].map((x) => (
              <div key={x.label} className="rounded border border-rule bg-surface px-4 py-3">
                <p className="text-xs text-ink-soft">{x.label}</p>
                <p className="mt-1 font-serif text-2xl text-ink">{x.c.reports}<span className="ml-1 text-xs text-ink-faint">reports</span></p>
                <p className="mt-1 text-xs text-ink-soft">
                  {x.hours ? `${x.c.hours} hours · ` : ""}{x.c.studies} Bible studies
                </p>
              </div>
            ))}
          </div>
          {t.lateReceived > 0 && (
            <p className="mt-2 text-xs text-ink-faint">{t.lateReceived} late report{t.lateReceived === 1 ? "" : "s"} for earlier months were entered during this month.</p>
          )}
        </Section>
      )}

      <Section
        title={`Still to report for ${monthLabel(period.year, period.month)}`}
        actions={
          <>
            <Link href={`/reports/reminders?period=${period.year}-${period.month}`}>
              <Button variant="secondary" size="sm">Remind the overseers</Button>
            </Link>
            <Link href="/reports">
              <Button variant="secondary" size="sm">Open the report sheet</Button>
            </Link>
          </>
        }
      >
        {missing.length === 0 ? (
          <EmptyState
            title="Every report is in"
            description={`All active publishers have a report on file for ${monthLabel(period.year, period.month)}.`}
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Publisher</Th>
                <Th>Group</Th>
                <Th align="right">Record</Th>
              </tr>
            </thead>
            <tbody>
              {missing.map((p) => (
                <tr key={p.id}>
                  <Td>{displayName(p)}</Td>
                  <Td className="text-ink-soft">
                    {p.group ? `${p.group.number} — ${p.group.name}` : <Badge tone="warn">No group</Badge>}
                  </Td>
                  <Td align="right">
                    <Link href={`/publishers/${p.id}`} className="text-xs text-pine hover:underline">
                      Open card
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section
          title="Next in the hall"
          actions={
            <Link href="/bookings" className="text-xs text-pine hover:underline">
              Calendar{pendingBookings > 0 ? ` · ${pendingBookings} pending` : ""}
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Approved bookings will appear here." />
          ) : (
            <ul className="divide-y divide-rule rounded border border-rule bg-surface">
              {upcoming.map((b) => (
                <li key={b.id} className="px-4 py-3">
                  <p className="text-sm text-ink">{b.eventType}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {formatTimeRange(b.startTime, b.endTime)} · {b.resource.name}
                  </p>
                  <p className="text-xs text-ink-faint">{b.requestingBody}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {can(user.role, "boe:read") && (
          <Section
            title="Open items from the body of elders"
            actions={
              <Link href="/boe" className="text-xs text-pine hover:underline">
                All items
              </Link>
            }
          >
            {openItems.length === 0 ? (
              <EmptyState title="Nothing outstanding" description="Assigned items will appear here." />
            ) : (
              <ul className="divide-y divide-rule rounded border border-rule bg-surface">
                {openItems.map((item) => {
                  const overdue = item.targetDate && item.targetDate < new Date();
                  return (
                    <li key={item.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-ink">{item.agendaItem}</p>
                        {overdue && <Badge tone="bad">Overdue</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {item.assignedTo ? displayName(item.assignedTo) : "Unassigned"}
                        {item.targetDate ? ` · due ${formatDate(item.targetDate)}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}
      </div>
    </>
  );
}
