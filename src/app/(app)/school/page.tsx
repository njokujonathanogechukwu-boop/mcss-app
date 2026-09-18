import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatWeekOf, nextPeriodStart, periodLabel } from "@/lib/school";
import { loadPeriods, weekProgress, type PeriodRow } from "@/lib/school-queries";
import { DataTable, EmptyState, Notice, PageHeader, Panel, Section, Td, Th } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { SchoolTabs } from "./tabs";
import { NewPeriodForm } from "./school-forms";
import { WorkbookImportForm } from "./workbook-form";

export const dynamic = "force-dynamic";

function periodProgress(period: PeriodRow) {
  let need = 0;
  let have = 0;
  for (const week of period.weeks) {
    const p = weekProgress(week);
    need += p.need;
    have += p.have;
  }
  return { need, have };
}

export default async function SchoolPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");
  const { denied } = await searchParams;

  const [periods, students] = await Promise.all([
    loadPeriods(),
    prisma.schoolStudent.count({ where: { active: true } }),
  ]);

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const upcoming = periods
    .flatMap((period) => period.weeks.map((week) => ({ period, week })))
    .filter(({ week }) => week.weekOf.getTime() >= today)
    .sort((a, b) => a.week.weekOf.getTime() - b.week.weekOf.getTime())[0];

  const next = nextPeriodStart(
    now,
    periods.map((p) => ({ startYear: p.startYear, startMonth: p.startMonth })),
  );

  return (
    <>
      <PageHeader
        title="Life and Ministry Meeting School"
        description="Plan the midweek meeting one workbook at a time: the parts, who handles them in each hall, and the schedule the congregation is given."
      />

      <SchoolTabs />

      {denied && (
        <Notice tone="error">Your account cannot open that part of the records.</Notice>
      )}

      {upcoming && (
        <Section title="Next meeting">
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-serif text-base text-ink">{formatWeekOf(upcoming.week.weekOf)}</p>
              <p className="mt-0.5 text-sm text-ink-soft">
                {upcoming.period.label}
                {upcoming.week.cancelled && <Badge tone="warn">No meeting</Badge>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={`/api/exports/midweek?week=${upcoming.week.id}`} target="_blank" rel="noopener">
                <Button variant="secondary" size="sm">Print this week</Button>
              </a>
              <Link href={`/school/weeks/${upcoming.week.id}`}>
                <Button size="sm">Open the schedule</Button>
              </Link>
            </div>
          </Panel>
        </Section>
      )}

      <Section
        title="Schedules"
        description="One for each workbook, two months at a time. S-38 par. 24: the parts are all assigned when the workbook arrives, and the schedule goes out at least three weeks before."
      >
        {periods.length === 0 ? (
          <EmptyState
            title="No schedule yet"
            description="Start one for the workbook you have. Each week is created with the parts the S-140 prints, ready for names."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Schedule</Th>
                <Th align="right">Meetings</Th>
                <Th align="right">Names filled in</Th>
                <Th>First meeting</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => {
                const progress = periodProgress(period);
                const done = progress.need > 0 && progress.have >= progress.need;
                const first = period.weeks[0];
                return (
                  <tr key={period.id} className="hover:bg-paper">
                    <Td>
                      <Link
                        href={`/school/periods/${period.id}`}
                        className="font-medium hover:text-pine hover:underline"
                      >
                        {period.label}
                      </Link>
                      <span className="block text-xs text-ink-faint">
                        {periodLabel(period.startYear, period.startMonth)}
                      </span>
                    </Td>
                    <Td align="right">{period.weeks.length}</Td>
                    <Td align="right">
                      {done ? (
                        <Badge tone="good">Complete</Badge>
                      ) : (
                        <span className={progress.have === 0 ? "text-ink-faint" : "text-ink-soft"}>
                          {progress.have} of {progress.need}
                        </span>
                      )}
                    </Td>
                    <Td className="text-ink-soft">
                      {first ? formatWeekOf(first.weekOf) : "—"}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={`/api/exports/midweek?period=${period.id}`} target="_blank" rel="noopener">
                          <Button variant="ghost" size="sm">Print all</Button>
                        </a>
                        <Link href={`/school/periods/${period.id}`}>
                          <Button variant="secondary" size="sm">Open</Button>
                        </Link>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Section>

      {canWrite && (
        <>
          <Section
            title="Build a schedule from the workbook"
            description="Upload the workbook's EPUB and every week and part is read out of it — titles, lengths, the songs and the weekly Bible reading — leaving only the names."
          >
            <WorkbookImportForm
              defaultWeekday={periods[0]?.meetingWeekday ?? 2}
              defaultHour={periods[0]?.startHour ?? 18}
              defaultMinute={periods[0]?.startMinute ?? 0}
              taken={periods.map((p) => p.label)}
            />
          </Section>

          <Section
            title="Start a blank schedule"
            description="For when the EPUB is not to hand. Pick the first of the two months and each week is created with the parts the S-140 prints, ready to be retitled against the workbook."
          >
            <NewPeriodForm
              defaultYear={next.startYear}
              defaultMonth={next.startMonth}
              defaultWeekday={periods[0]?.meetingWeekday ?? 2}
            />
          </Section>
        </>
      )}

      <Section title="The roll of the school">
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-ink-soft">
            {students} student{students === 1 ? "" : "s"} enrolled who are not publishing yet.
          </p>
          <Link href="/school/students">
            <Button variant="secondary" size="sm">Open the roll</Button>
          </Link>
        </Panel>
      </Section>
    </>
  );
}
