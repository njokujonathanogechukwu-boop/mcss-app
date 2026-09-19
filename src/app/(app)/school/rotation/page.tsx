import type { Appointment } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { APPOINTMENT_LABELS, formatDate } from "@/lib/format";
import { rotationRoll } from "@/lib/school-queries";
import { SLOT_LABELS, SLOT_ORDER } from "@/lib/school";
import {
  ROLE_LABELS, assignmentFacts, consecutiveConflicts, pairingsFrom, repeatedPairings, roleFacts,
  roleRepeats, sameSlotConsecutive, statsFrom, trendsFrom,
  type PersonTrend, type WeekRole,
} from "@/lib/rotation";
import { DataTable, EmptyState, Notice, PageHeader, Section, Td, Th } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { SchoolTabs } from "../tabs";

export const dynamic = "force-dynamic";

/**
 * The rotation across every schedule on file: who has waited longest, who was
 * used two meetings running, who was kept in the same session of the meeting
 * two weeks running, and where each brother's or student's parts have fallen.
 * The overseer plans from here before he opens a week, so the list filters by
 * standing and by name and carries each person's trend beside their waiting.
 */

const STANDINGS: { value: string; label: string }[] = [
  { value: "ELDER", label: "Elders" },
  { value: "MINISTERIAL_SERVANT", label: "Ministerial servants" },
  { value: "PUBLISHER", label: "Publishers" },
  { value: "STUDENT", label: "Students of the school" },
];

const ROLE_ORDER: WeekRole[] = ["CHAIRMAN", "OPENING_PRAYER", "CLOSING_PRAYER"];

const standingOf = (person: { isStudent: boolean; appointment: Appointment | null }) =>
  person.isStudent ? "STUDENT" : person.appointment ?? "PUBLISHER";

/** Where one person's parts have fallen, as the overseer reads them. */
function servedLabel(trend: PersonTrend | undefined): string {
  if (!trend) return "";
  const bits: string[] = [];
  for (const role of ROLE_ORDER) {
    const count = trend.roles[role];
    if (count) bits.push(count === 1 ? ROLE_LABELS[role] : `${ROLE_LABELS[role]} ${count}`);
  }
  for (const slot of SLOT_ORDER) {
    const count = trend.slots[slot];
    if (count) bits.push(count === 1 ? SLOT_LABELS[slot] : `${SLOT_LABELS[slot]} ${count}`);
  }
  return bits.join(" · ");
}

export default async function SchoolRotationPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");

  const params = (await props.searchParams) ?? {};
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const standing = first(params.standing) ?? "";
  const q = (first(params.q) ?? "").trim();

  const [facts, roll, roles] = await Promise.all([assignmentFacts(), rotationRoll(), roleFacts()]);

  const stats = statsFrom(facts, roll);
  const trends = trendsFrom(facts, roles);
  const conflicts = consecutiveConflicts(facts);
  const slotRepeats = sameSlotConsecutive(facts);
  const chairRepeats = roleRepeats(roles);
  const repeated = repeatedPairings(pairingsFrom(facts));

  const shown = stats.filter((person) => {
    if (standing && standingOf(person) !== standing) return false;
    if (q && !person.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const filtered = Boolean(standing || q);
  const summary = STANDINGS.map((option) => {
    const people = stats.filter((person) => standingOf(person) === option.value);
    const recent = people.reduce((total, person) => total + (trends.get(person.key)?.recent ?? 0), 0);
    return { ...option, people: people.length, recent };
  });

  const query = (next: Record<string, string>) =>
    new URLSearchParams(Object.entries(next).filter(([, value]) => value)).toString();

  return (
    <>
      <PageHeader
        title="Rotation"
        description="Who has waited longest for a part, who was used two meetings running, who was kept in the same session two weeks running, and where each one's parts have fallen — across every schedule on file."
        actions={<Badge tone="neutral">{stats.length} in the rotation</Badge>}
      />

      <SchoolTabs />

      {chairRepeats.length > 0 && (
        <Notice tone="warn">
          {chairRepeats.length} case{chairRepeats.length === 1 ? "" : "s"} of a brother kept in the same session two
          meetings running:{" "}
          {chairRepeats
            .slice(-5)
            .map((c) => `${c.name} (${ROLE_LABELS[c.role].toLowerCase()}, ${formatDate(c.first)} and ${formatDate(c.second)})`)
            .join(", ")}
          . The rotation gives a brother a different session the week after.
        </Notice>
      )}

      {slotRepeats.length > 0 && (
        <Notice tone="warn">
          {slotRepeats.length} case{slotRepeats.length === 1 ? "" : "s"} of the same part session two meetings running:{" "}
          {slotRepeats
            .slice(-5)
            .map((c) => `${c.name} (${SLOT_LABELS[c.slot].toLowerCase()}, ${formatDate(c.first)} and ${formatDate(c.second)})`)
            .join(", ")}
          .
        </Notice>
      )}

      {conflicts.length > 0 && (
        <Notice tone="warn">
          {conflicts.length} case{conflicts.length === 1 ? "" : "s"} of a part two meetings running:{" "}
          {conflicts
            .slice(-5)
            .map((c) => `${c.name} (${formatDate(c.first)} and ${formatDate(c.second)})`)
            .join(", ")}
          .
        </Notice>
      )}

      <Section
        title="The rotation by standing"
        description="How many are in the rotation of each standing, and how many parts they have taken between them in the last eight weeks."
      >
        <div className="flex flex-wrap gap-2">
          {summary.map((option) => (
            <a
              key={option.value}
              href={`/school/rotation?${query({ standing: option.value, q })}`}
              className={
                "rounded border px-3 py-2 text-sm " +
                (standing === option.value ? "border-pine bg-pine-light text-ink" : "border-rule bg-surface text-ink-soft hover:bg-paper")
              }
            >
              <span className="font-medium text-ink">{option.label}</span>
              <span className="text-ink-faint"> — {option.people} in the rotation, {option.recent} part{option.recent === 1 ? "" : "s"} in the last 8 wk</span>
            </a>
          ))}
        </div>
      </Section>

      <Section
        title="Who is waiting"
        description="Longest without a part first. A publisher under restrictions is not on this list: he is not eligible for a part while they run."
      >
        <form method="GET" action="/school/rotation" className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-ink-soft">
            Standing
            <select
              name="standing"
              defaultValue={standing}
              className="mt-1 block w-44 rounded border border-rule bg-surface px-2 py-1.5 text-sm text-ink"
            >
              <option value="">Everyone</option>
              {STANDINGS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-soft">
            Name
            <input
              name="q"
              defaultValue={q}
              placeholder="Search a name"
              className="mt-1 block w-48 rounded border border-rule bg-surface px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <Button type="submit">Filter</Button>
          {filtered && (
            <a href="/school/rotation" className="pb-1.5 text-xs text-ink-soft underline">
              Clear
            </a>
          )}
          <span className="pb-1.5 text-xs text-ink-faint">
            {shown.length} of {stats.length} shown
          </span>
        </form>

        {shown.length === 0 ? (
          <EmptyState title="Nobody matches the filter" description="Clear the filter to see the whole rotation again." />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Standing</Th>
                <Th align="right">Sessions</Th>
                <Th>Where they have served</Th>
                <Th align="right">Last 8 wk</Th>
                <Th>Last part</Th>
                <Th align="right">Waiting</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((person) => {
                const trend = trends.get(person.key);
                return (
                  <tr key={person.key} className="hover:bg-paper">
                    <Td className="font-medium">{person.name}</Td>
                    <Td className="text-ink-soft">
                      {person.isStudent
                        ? "Student"
                        : person.appointment
                          ? APPOINTMENT_LABELS[person.appointment] ?? person.appointment
                          : "Publisher"}
                    </Td>
                    <Td align="right">{person.total + (trend ? Object.values(trend.roles).reduce((a, b) => a + (b ?? 0), 0) : 0)}</Td>
                    <Td className="text-ink-soft">{servedLabel(trend) || <span className="text-ink-faint">no part yet</span>}</Td>
                    <Td align="right">{trend?.recent ?? 0}</Td>
                    <Td className="text-ink-soft">
                      {person.last ? formatDate(person.last) : <span className="text-ink-faint">never yet</span>}
                    </Td>
                    <Td align="right">
                      {person.waitingWeeks === null ? (
                        <Badge tone="warn">no part yet</Badge>
                      ) : (
                        `${person.waitingWeeks} wk`
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Section>

      <Section
        title="The same pair again"
        description="A student and an assistant put together more than once. Nothing forbids it, but the rotation is poorer for it."
      >
        {repeated.length === 0 ? (
          <EmptyState title="No pair has repeated" description="Every student and assistant pairing on file is so far unique." />
        ) : (
          <ul className="space-y-2 text-sm">
            {repeated.map((pair) => (
              <li key={`${pair.student}|${pair.assistant}`} className="rounded border border-rule bg-surface px-3 py-2">
                <span className="font-medium text-ink">{pair.student}</span>
                <span className="text-ink-soft"> with </span>
                <span className="text-ink">{pair.assistant}</span>
                <span className="text-ink-faint"> — {pair.dates.map(formatDate).join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-xs text-ink-faint">
        The rotation counts every name on every schedule on file{canWrite ? ", including the weeks filed from past schedules" : ""},
        and the chairs and prayers on each week's heading. Suggestions on each week's page come from this list,
        longest-waiting first, and never offer a brother who had a part the week before. A save refuses a name that
        would keep a brother in the same session of the meeting two weeks running, or give a talk to anyone but a brother.
      </p>
    </>
  );
}
