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
  assignedValue, assignmentOptions, chairmanOptions, loadWeek, rollForSchool,
  schoolDocuments, toSchedulePart, toScheduleWeek,
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

  const roll = await rollForSchool();
  const [chairmen, people, documents] = await Promise.all([
    chairmanOptions(roll),
    assignmentOptions(),
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
    dualHall: part.dualHall,
    values: Object.fromEntries(
      part.assignments.map((a) => [slotField(a.slot, a.hall), assignedValue(a)]),
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
      description="The S-140 layout, with the running clock. Times move as the parts change."
    >
      <DataTable>
        <thead>
          <tr>
            <Th className="w-16">Time</Th>
            <Th>Programme</Th>
            <Th>Auxiliary classroom</Th>
            <Th>Main hall</Th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((line, index) => {
            if (line.kind === "heading") {
              return (
                <tr key={`h-${index}`} className="bg-paper">
                  <Td colSpan={4} className="pt-3 text-xs font-semibold tracking-wide text-ink">
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
                  <Td colSpan={3}>
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
                  <Td colSpan={3}>
                    {line.which === "opening" ? "Opening Comments" : "Concluding Comments"}{" "}
                    <span className="text-ink-faint">({line.minutes} min.)</span>
                  </Td>
                </tr>
              );
            }
            const auxiliary = line.names.find((n) => n.hall === "AUXILIARY");
            const main = line.names.find((n) => n.hall === "MAIN");
            return (
              <tr key={`p-${index}`}>
                <Td className="text-ink-soft">{line.time}</Td>
                <Td>
                  <span className="text-ink-faint">{line.position}. </span>
                  {line.title}
                  {line.minutes ? <span className="text-ink-faint"> ({line.minutes} min.)</span> : null}
                  {line.detail && <span className="block text-xs text-ink-soft">{line.detail}</span>}
                </Td>
                <Td className="text-ink-soft">{auxiliary?.label ?? ""}</Td>
                <Td className="text-ink-soft">{main?.label ?? ""}</Td>
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
            description="The date, the weekly Bible reading, the chairman and the auxiliary classroom counselor, the two prayers and the three songs."
          >
            <WeekHeaderForm
              people={chairmen}
              week={{
                id: week.id,
                weekOf: toDateInput(week.weekOf),
                bibleReading: week.bibleReading,
                chairmanId: week.chairmanId,
                counselorId: week.counselorId,
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
            description="Each line of the schedule, with everyone assigned to it. Tick the auxiliary classroom box where a part is handled twice; a circuit overseer's week has no auxiliary class."
          >
            <div className="space-y-4">
              {parts.map((part) => (
                <PartCard key={part.id} part={part} people={people} count={parts.length} />
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
                <Heading label="Auxiliary classroom counselor" value={week.counselor && displayName(week.counselor)} />
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
        Students move to the auxiliary classroom after Spiritual Gems and come back for the last part
        (S-38 par. 27). Only brothers the body of elders has approved chair the meeting or handle the
        parts that are not student assignments (S-38 par. 24).{" "}
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
