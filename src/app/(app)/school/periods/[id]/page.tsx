import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { displayName, toDateInput } from "@/lib/format";
import { WEEKDAY_LABELS, clockLabel, formatDay, formatWeekOf, periodLabel } from "@/lib/school";
import {
  loadPeriod, periodTally, schoolDocuments, weekProgress,
} from "@/lib/school-queries";
import { DataTable, EmptyState, PageHeader, Section, Td, Th } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { SchoolTabs } from "../../tabs";
import {
  AddWeekForm, DeletePeriodForm, DeleteWeekForm, PeriodSettingsForm,
} from "../../school-forms";
import { DocumentTable } from "../../document-list";
import { UploadDocumentsForm } from "../../document-forms";

export const dynamic = "force-dynamic";

export default async function PeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");
  const { id } = await params;

  const period = await loadPeriod(id);
  if (!period) notFound();

  const [tally, documents] = await Promise.all([
    periodTally(id),
    schoolDocuments({ periodId: id }),
  ]);

  const last = period.weeks[period.weeks.length - 1];
  const suggested = last
    ? toDateInput(new Date(last.weekOf.getTime() + 7 * 24 * 60 * 60 * 1000))
    : undefined;

  return (
    <>
      <PageHeader
        back={{ href: "/school", label: "All schedules" }}
        title={period.label}
        description={`${periodLabel(period.startYear, period.startMonth)} · ${WEEKDAY_LABELS[period.meetingWeekday]}s at ${clockLabel(period.startHour, period.startMinute)}`}
        actions={
          <>
            <a href={`/api/exports/midweek?period=${period.id}`} target="_blank" rel="noopener">
              <Button variant="secondary" size="sm">Print every week</Button>
            </a>
            {canWrite && (
              <DeletePeriodForm id={period.id} label={period.label} weeks={period.weeks.length} />
            )}
          </>
        }
      />

      <SchoolTabs />

      <Section
        title="Meetings"
        description="Open a week to fill in its parts. A week reads as complete only when both halls are named."
      >
        {period.weeks.length === 0 ? (
          <EmptyState
            title="No meetings on this schedule"
            description="Add the first one below. An assembly or convention week is simply left off, or marked as not held."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Meeting</Th>
                <Th>Chairman</Th>
                <Th align="right">Names filled in</Th>
                <Th align="right"></Th>
                {canWrite && <Th align="right"></Th>}
              </tr>
            </thead>
            <tbody>
              {period.weeks.map((week) => {
                const progress = weekProgress(week);
                const done = progress.need > 0 && progress.have >= progress.need;
                return (
                  <tr key={week.id} className="hover:bg-paper">
                    <Td>
                      <Link
                        href={`/school/weeks/${week.id}`}
                        className="font-medium hover:text-pine hover:underline"
                      >
                        {formatWeekOf(week.weekOf)}
                      </Link>
                      {week.note && <span className="ml-2"><Badge tone="warn">{week.note}</Badge></span>}
                      {week.cancelled && (
                        <span className="ml-2">
                          <Badge tone="bad">No meeting{week.cancelledReason ? ` — ${week.cancelledReason}` : ""}</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-ink-soft">
                      {week.chairman ? displayName(week.chairman) : <Badge tone="warn">Not assigned</Badge>}
                    </Td>
                    <Td align="right">
                      {week.cancelled ? (
                        <span className="text-ink-faint">—</span>
                      ) : done ? (
                        <Badge tone="good">Complete</Badge>
                      ) : (
                        <span className={progress.have === 0 ? "text-ink-faint" : "text-ink-soft"}>
                          {progress.have} of {progress.need}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <a href={`/api/exports/midweek?week=${week.id}`} target="_blank" rel="noopener">
                        <Button variant="ghost" size="sm">Print</Button>
                      </a>
                    </Td>
                    {canWrite && (
                      <Td align="right">
                        <DeleteWeekForm id={week.id} date={formatWeekOf(week.weekOf)} />
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Section>

      {canWrite && (
        <Section>
          <AddWeekForm periodId={period.id} suggested={suggested} />
        </Section>
      )}

      <Section
        title="Who has been given what"
        description="Every name on this schedule and the parts they handle. Use it to spread the assignments rather than lean on the same few brothers and students."
      >
        {tally.length === 0 ? (
          <EmptyState
            title="Nothing assigned yet"
            description="Names given to parts on this schedule are counted here, week by week."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th align="right">Parts</Th>
                <Th>What they were given</Th>
              </tr>
            </thead>
            <tbody>
              {tally.map((entry) => (
                <tr key={entry.key} className="hover:bg-paper">
                  <Td>
                    <span className="font-medium">{entry.name}</span>
                    {entry.isStudent && <span className="ml-2"><Badge tone="neutral">student</Badge></span>}
                  </Td>
                  <Td align="right">{entry.total}</Td>
                  <Td className="text-ink-soft">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {entry.parts.map((part, index) => (
                        <span key={`${part.date.toISOString()}-${index}`}>
                          {formatDay(part.date)} · {part.title}{" "}
                          <span className="text-ink-faint">({part.slot})</span>
                        </span>
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      <Section title="Filed under this schedule">
        <DocumentTable documents={documents} canWrite={canWrite} />
        {canWrite && (
          <div className="mt-4">
            <UploadDocumentsForm periodId={period.id} />
          </div>
        )}
      </Section>

      {canWrite && (
        <Section title="Settings" description="The name this schedule goes by, the day the congregation meets and the time the meeting starts.">
          <div className="max-w-2xl">
            <PeriodSettingsForm period={period} />
          </div>
        </Section>
      )}
    </>
  );
}
