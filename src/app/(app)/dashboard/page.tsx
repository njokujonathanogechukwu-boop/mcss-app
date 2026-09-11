import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  currentServiceYear, serviceYearMonths, serviceYearLabel, reportingMonth, monthLabel,
} from "@/lib/service-year";
import { formatDate, formatTimeRange, displayName } from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td, EmptyState, Notice } from "@/components/shell";
import { Badge, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requireUser();
  const { denied } = await searchParams;

  const serviceYear = currentServiceYear();
  const months = serviceYearMonths(serviceYear);
  const period = reportingMonth();

  const [activePublishers, reportsThisYear, missing, pendingBookings, openItems, upcoming] =
    await Promise.all([
      prisma.publisher.count({ where: { status: { in: ["ACTIVE", "IRREGULAR"] } } }),
      prisma.serviceReport.groupBy({
        by: ["year", "month"],
        where: { OR: months.map((m) => ({ year: m.year, month: m.month })) },
        _count: { _all: true },
      }),
      prisma.publisher.findMany({
        where: {
          status: { in: ["ACTIVE", "IRREGULAR"] },
          reports: { none: { year: period.year, month: period.month } },
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
        title={`Good day, ${user.name.split(" ")[0]}`}
        description={`Service year ${serviceYearLabel(serviceYear)}. Reports are currently being collected for ${monthLabel(period.year, period.month)}.`}
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

      <Section
        title={`Still to report for ${monthLabel(period.year, period.month)}`}
        actions={
          <Link href="/reports">
            <Button variant="secondary" size="sm">Open the report sheet</Button>
          </Link>
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
