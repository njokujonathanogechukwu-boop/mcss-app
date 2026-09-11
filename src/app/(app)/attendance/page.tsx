import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { attendanceSummary } from "@/lib/pdf/s88";
import { currentServiceYear, serviceYearLabel, serviceYearOptions, serviceYearRange } from "@/lib/service-year";
import { formatDate } from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td, EmptyState } from "@/components/shell";
import { Button } from "@/components/ui";
import { AttendanceForm } from "./attendance-form";
import { deleteAttendance } from "./actions";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const user = await requirePermission("attendance:read");
  const { sy } = await searchParams;
  const serviceYear = Number(sy) || currentServiceYear();
  const { start, end } = serviceYearRange(serviceYear);

  const [rows, recent] = await Promise.all([
    attendanceSummary(serviceYear),
    prisma.meetingAttendance.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { date: "desc" },
      take: 14,
    }),
  ]);

  const canWrite = can(user.role, "attendance:write");
  const totalMeetings = rows.reduce((t, r) => t + r.midweekMeetings + r.weekendMeetings, 0);

  return (
    <>
      <PageHeader
        title="Meeting attendance"
        description="Counts for both meetings each week, in the hall and by video. The service year totals here match the S-88."
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
            {can(user.role, "export:run") && (
              <a href={`/api/exports/s88?sy=${serviceYear}`} target="_blank" rel="noopener">
                <Button size="sm">Download S-88</Button>
              </a>
            )}
          </>
        }
      />

      <Section title={`Service year ${serviceYearLabel(serviceYear)}`} description={`${totalMeetings} meetings recorded.`}>
        {totalMeetings === 0 ? (
          <EmptyState
            title="No counts recorded yet"
            description="Record the first meeting below and the monthly averages will build up here."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Midweek meetings</Th>
                <Th align="right">Midweek total</Th>
                <Th align="right">Midweek average</Th>
                <Th align="right">Weekend meetings</Th>
                <Th align="right">Weekend total</Th>
                <Th align="right">Weekend average</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <Td className="whitespace-nowrap">{r.label}</Td>
                  <Td align="right">{r.midweekMeetings || "—"}</Td>
                  <Td align="right">{r.midweekTotal || "—"}</Td>
                  <Td align="right" className="font-medium">{r.midweekAverage || "—"}</Td>
                  <Td align="right">{r.weekendMeetings || "—"}</Td>
                  <Td align="right">{r.weekendTotal || "—"}</Td>
                  <Td align="right" className="font-medium">{r.weekendAverage || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        {canWrite && (
          <Section title="Record a meeting">
            <AttendanceForm />
          </Section>
        )}

        <Section title="Latest counts">
          {recent.length === 0 ? (
            <p className="rounded border border-dashed border-rule-strong bg-surface px-4 py-6 text-sm text-ink-soft">
              Nothing recorded for this service year.
            </p>
          ) : (
            <ul className="divide-y divide-rule rounded border border-rule bg-surface">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      {formatDate(r.date)} · {r.meetingType === "MIDWEEK" ? "Midweek" : "Weekend"}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {r.inPerson + r.zoom} present — {r.inPerson} in the hall, {r.zoom} by video
                      {r.notes ? ` · ${r.notes}` : ""}
                    </p>
                  </div>
                  {canWrite && (
                    <form action={deleteAttendance}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="shrink-0 text-xs text-ink-faint hover:text-clay">Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
