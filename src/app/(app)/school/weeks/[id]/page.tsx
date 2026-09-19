import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { displayName, toDateInput } from "@/lib/format";
import {
  MINUTES_PER_S38, PART_KINDS, SECTION_LABELS, SLOT_LABELS, buildSchedule, clockLabel,
  formatWeekOf, meetingLength, partKind, personRef, poolFor, slotField, weekBanner,
} from "@/lib/school";
import {
  assignedValue, loadPools, loadWeek, rotationRoll, schoolDocuments, toSchedulePart, toScheduleWeek,
} from "@/lib/school-queries";
import {
  ROLE_LABELS, assignmentFacts, pairingsFrom, roleFacts, rolesAround, statsFrom, suggestFrom,
  weekConsecutive, weekRepeatedPairings, weekSameSlot, type WeekRole,
} from "@/lib/rotation";
import { DataTable, Notice, PageHeader, Panel, Section, Td, Th } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import type { NameOption } from "@/components/name-picker";
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

  const [pools, documents, facts, roll, roles] = await Promise.all([
    loadPools(),
    schoolDocuments({ weekId: week.id }),
    assignmentFacts(),
    rotationRoll(),
    roleFacts(),
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

  const stats = statsFrom(facts, roll);
  const consecutive = weekConsecutive(facts, week.weekOf);
  const repeated = weekRepeatedPairings(pairingsFrom(facts), week.weekOf);
  const sameSlot = weekSameSlot(facts, week.weekOf);
  const headingRoles: { key: string; name: string; role: WeekRole }[] = ([
    ["CHAIRMAN", week.chairmanId, week.chairman],
    ["OPENING_PRAYER", week.openingPrayerId, week.openingPrayer],
    ["CLOSING_PRAYER", week.closingPrayerId, week.closingPrayer],
  ] as const)
    .filter(
      (entry): entry is readonly [WeekRole, string, { firstName: string; lastName: string }] =>
        Boolean(entry[1] && entry[2]),
    )
    .map(([role, id, person]) => ({ key: personRef("publisher", id), name: displayName(person), role }));
  const nearbyRoles = rolesAround(roles, week.weekOf);
  const roleClashes = headingRoles.flatMap((entry) =>
    nearbyRoles
      .filter((near) => near.role === entry.role && near.key === entry.key)
      .map((near) => ({ ...entry, other: near.weekOf })),
  );
  const taken = new Set(parts.flatMap((part) => Object.values(part.values)));
  const suggestions = canWrite
    ? parts
        .flatMap((part) =>
          [...PART_KINDS[part.kind].slots]
            .filter((slot) => !part.values[slotField(slot)])
            .map((slot) => ({
              label: `Part ${part.position} · ${SLOT_LABELS[slot]}`,
              options: suggestFrom(facts, stats, week.weekOf, poolFor(pools, part.kind, slot), taken),
            })),
        )
        .filter((suggestion) => suggestion.options.length > 0)
    : [];

  // A name already on the heading stays pickable even when the pool would not
  // offer it — a brother who chaired before he was appointed an elder, say —
  // so saving the heading cannot silently drop whoever is printed there.
  const incumbent = (id: string | null, person: { firstName: string; lastName: string } | null): NameOption[] =>
    id && person ? [{ value: personRef("publisher", id), label: displayName(person) }] : [];
  const keep = (options: NameOption[], extra: NameOption[]) => [
    ...extra.filter((option) => !options.some((o) => o.value === option.value)),
    ...options,
  ];
  const chairmen = keep(pools.chairman, incumbent(week.chairmanId, week.chairman));
  const prayers = keep(pools.prayer, [
    ...incumbent(week.openingPrayerId, week.openingPrayer),
    ...incumbent(week.closingPrayerId, week.closingPrayer),
  ]);

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
              chairmen={chairmen}
              prayers={prayers}
              week={{
                id: week.id,
                weekOf: toDateInput(week.weekOf),
                bibleReading: week.bibleReading,
                // The pickers speak in "p:<id>" refs, the way the part pickers do.
                chairmanId: week.chairmanId ? personRef("publisher", week.chairmanId) : "",
                openingPrayerId: week.openingPrayerId ? personRef("publisher", week.openingPrayerId) : "",
                closingPrayerId: week.closingPrayerId ? personRef("publisher", week.closingPrayerId) : "",
                openingSong: week.openingSong,
                livingSong: week.livingSong,
                closingSong: week.closingSong,
                cancelled: week.cancelled,
                cancelledReason: week.cancelledReason,
                note: weekBanner(week.note),
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

          <Section
            title="The rotation"
            description="What the history says about this week: who would be handling two meetings in a row, which pair has been together before, and who has waited longest for each part still without a name."
          >
            {(consecutive.length > 0 || repeated.length > 0 || sameSlot.length > 0 || roleClashes.length > 0) && (
              <Notice tone="warn">
                {[
                  ...sameSlot.map(
                    (s) => `${s.name} handles ${SLOT_LABELS[s.slot].toLowerCase()} again, having handled it the week of ${formatWeekOf(s.other)}.`,
                  ),
                  ...roleClashes.map(
                    (r) => `${r.name} is ${ROLE_LABELS[r.role].toLowerCase()} again, having been ${ROLE_LABELS[r.role].toLowerCase()} the week of ${formatWeekOf(r.other)}.`,
                  ),
                  ...consecutive.map((c) => `${c.name} also has a part the week of ${formatWeekOf(c.other)}.`),
                  ...repeated.map(
                    (r) => `${r.student} and ${r.assistant} were put together before, the week of ${formatWeekOf(r.earlier)}.`,
                  ),
                ].join(" ")}
              </Notice>
            )}
            {suggestions.length === 0 ? (
              <p className="text-sm text-ink-soft">
                Every part has a name, and nobody in this meeting had a part the week before or after.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.label} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-ink">{suggestion.label}</span>
                    <span className="text-ink-faint">longest waiting:</span>
                    <span className="text-ink-soft">
                      {suggestion.options.map((option) => option.label).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-ink-faint">
              Suggestions never offer a person who had a part the week before, and publishers under restrictions
              are not on the list at all. The full rotation is on the{" "}
              <Link href="/school/rotation" className="hover:text-pine hover:underline">rotation page</Link>.
            </p>
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
