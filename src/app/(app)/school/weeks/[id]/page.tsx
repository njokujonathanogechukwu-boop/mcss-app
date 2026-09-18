import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { displayName, toDateInput } from "@/lib/format";
import {
  MINUTES_PER_S38, SECTION_LABELS, buildSchedule, clockLabel,
  formatWeekOf, meetingLength, partKind, slotField,
} from "@/lib/school";
import {
  assignedValue, loadPools, loadWeek, schoolDocuments, toSchedulePart, toScheduleWeek,
} from "@/lib/school-queries";
import { DataTable, Notice, PageHeader, Panel, Section, Td, Th } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { SchoolTabs } from "../../tabs";
import { AddPartForm, PartCard, WeekHeaderForm, type PartProps } from "../../week-forms";
import { DocumentTable } from "../../document-list";
import { UploadDocumentsForm } from "../../document-forms";

export const dynamic = "force-dynamic";

export default async function WeekPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");
  const { id } = await params;

  const week = await loadWeek(id);
  if (!week) notFound();

  const [pools, documents] = await Promise.all([
    loadPools(),
    schoolDocuments({ weekId: week.id }),
  ]);

  const scheduleParts = week.parts.map(toSchedulePart);
  const parts: PartProps[] = week.parts.map((part) => ({
    id: part.id,
    position: part.position,
    section: part.section,
    title: part.title,
    minutes: part.minutes,
    detail: part.detail,
    kind: partKind(part.slots),
    values: Object.fromEntries(
      part.assignments.map((a) => [slotField(a.slot), assignedValue(a)]),
    ),
  }));

  const schedule = buildSchedule(
    toScheduleWeek(week),
    scheduleParts,
    week.period.startHour,
    week.period.startMinute,
  );
  const length = meetingLength(scheduleParts);
  const running = length !== MINUTES_PER_S38;

  const preview = (
    <Section
      title="How it will print"
      description="The layout of the congregation's own schedule, with the running clock. Times move as the parts change."
    >
      <DataTable>
        <thead>
          <tr>
            <Th className="w-16">Time</Th>
            <Th>Programme</Th>
            <Th className="w-64">Names</Th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((line, index) => {
            if (line.kind === "heading") {
              return (
                <tr key={`h-${index}`} className="bg-paper">
                  <Td colSpan={3} className="pt-3 text-xs font-semibold tracking-wide text-ink">
                    {SECTION_LABELS[line.section]}
                  </Td>
                </tr>
              );
            }
            if (line.kind === "song") {
              const which = { opening: "Opening song", living: "Song", closing: "Closing song" }[line.which];
              return (
                <tr key={`s-${index}`}>
                  <Td className="text-ink-soft">{line.time}</Td>
                  <Td colSpan={2}>
                    {which}
                    {line.number ? ` ${line.number}` : ""}
                    {line.prayer && <span className="text-ink-soft"> and prayer — {line.prayer}</span>}
                  </Td>
                </tr>
              );
            }
            if (line.kind === "comments") {
              return (
                <tr key={`c-${index}`}>
                  <Td className="text-ink-soft">{line.time}</Td>
                  <Td colSpan={2}>
                    {line.which === "opening" ? "Opening Comments" : "Concluding Comments"}{" "}
                    <span className="text-ink-faint">({line.minutes} min.)</span>
                  </Td>
                </tr>
              );
            }
            return (
              <tr key={`p-${index}`}>
                <Td className="text-ink-soft">{line.time}</Td>
                <Td>
                  <span className="text-ink-faint">{line.position}. </span>
                  {line.title}
                  {line.minutes ? <span className="text-ink-faint"> ({line.minutes} min.)</span> : null}
                  {line.detail && <span className="block text-xs text-ink-soft">{line.detail}</span>}
                </Td>
                <Td className="text-ink-soft">
                  {line.names ? (
                    <>
                      {line.names.role && <span className="font-medium text-ink">{line.names.role}: </span>}
                      {line.names.people}
                    </>
                  ) : (
                    ""
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </Section>
  );

  return (
    <>
      <PageHeader
        back={{ href: `/school/periods/${week.periodId}`, label: week.period.label }}
        title={formatWeekOf(week.weekOf)}
        description={`${week.period.label} · starts at ${clockLabel(week.period.startHour, week.period.startMinute)}`}
        actions={
          <>
            <Badge tone={running ? "warn" : "good"}>
              {running ? `Runs ${length} minutes, not ${MINUTES_PER_S38}` : `Runs ${length} minutes`}
            </Badge>
            <a href={`/api/exports/midweek?week=${week.id}`} target="_blank" rel="noopener">
              <Button variant="secondary" size="sm">Print the schedule</Button>
            </a>
          </>
        }
      />

      <SchoolTabs />

      {week.cancelled && (
        <Notice tone="error">
          No meeting this week{week.cancelledReason ? ` — ${week.cancelledReason}` : ""}. The week is
          kept on the schedule so the gap shows where it belongs.
        </Notice>
      )}

      {canWrite ? (
        <>
          <Section
            title="The heading"
            description="The date, the weekly Bible reading, the chairman, the two prayers and the three songs."
          >
            <WeekHeaderForm
              chairmen={pools.chairman}
              prayers={pools.prayer}
              week={{
                id: week.id,
                weekOf: toDateInput(week.weekOf),
                bibleReading: week.bibleReading,
                chairmanId: week.chairmanId,
                openingPrayerId: week.openingPrayerId,
                closingPrayerId: week.closingPrayerId,
                openingSong: week.openingSong,
                livingSong: week.livingSong,
                closingSong: week.closingSong,
                cancelled: week.cancelled,
                cancelledReason: week.cancelledReason,
                note: week.note,
              }}
            />
          </Section>

          <Section
            title="The parts"
            description="Each line of the schedule, with everyone assigned to it. Each picker offers only the names the part may be given to."
          >
            <div className="space-y-4">
              {parts.map((part) => (
                <PartCard key={part.id} part={part} pools={pools} count={parts.length} />
              ))}
              <AddPartForm weekId={week.id} positions={parts.map((p) => p.position)} />
            </div>
          </Section>

          {preview}
        </>
      ) : (
        <>
          <Section title="The heading">
            <Panel className="p-4 text-sm text-ink-soft">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                <Heading label="Chairman" value={week.chairman && displayName(week.chairman)} />
                <Heading label="Weekly Bible reading" value={week.bibleReading} />
                <Heading label="Opening prayer" value={week.openingPrayer && displayName(week.openingPrayer)} />
                <Heading label="Closing prayer" value={week.closingPrayer && displayName(week.closingPrayer)} />
                <Heading
                  label="Songs"
                  value={[week.openingSong, week.livingSong, week.closingSong]
                    .map((n) => n ?? "—")
                    .join(" · ")}
                />
              </dl>
              {week.note && <p className="mt-3 text-ink">{week.note}</p>}
            </Panel>
          </Section>
          {preview}
        </>
      )}

      <Section
        title="Filed with this meeting"
        description="The schedule as it was printed, or a photograph of the one that went on the noticeboard."
      >
        <DocumentTable
          documents={documents}
          canWrite={canWrite}
          empty="Nothing filed against this meeting yet."
        />
        {canWrite && (
          <div className="mt-4">
            <UploadDocumentsForm weekId={week.id} />
          </div>
        )}
      </Section>

      <p className="text-xs text-ink-faint">
        Only brothers the body of elders has approved chair the meeting, conduct the Bible study or
        handle the parts that are not student assignments (S-38 par. 24); the reader is one of the{" "}
        <Link href="/school/readers" className="hover:text-pine hover:underline">
          approved readers
        </Link>
        .{" "}
        <Link href="/school/publishers" className="hover:text-pine hover:underline">
          See the publisher list
        </Link>
        .
      </p>
    </>
  );
}

function Heading({ label, value }: { label: string; value: string | null | false | undefined }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{value || "Not assigned yet"}</dd>
    </div>
  );
}
