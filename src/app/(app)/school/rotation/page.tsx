import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { APPOINTMENT_LABELS, formatDate } from "@/lib/format";
import { rotationRoll } from "@/lib/school-queries";
import {
  assignmentFacts, consecutiveConflicts, pairingsFrom, repeatedPairings, statsFrom,
} from "@/lib/rotation";
import { DataTable, EmptyState, Notice, PageHeader, Section, Td, Th } from "@/components/shell";
import { Badge } from "@/components/ui";
import { SchoolTabs } from "../tabs";

export const dynamic = "force-dynamic";

/**
 * The rotation across every schedule on file: who has waited longest, who was
 * used two meetings running, and which student and assistant keep being put
 * together. The overseer plans from here before he opens a week.
 */
export default async function SchoolRotationPage() {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");

  const [facts, roll] = await Promise.all([assignmentFacts(), rotationRoll()]);

  const stats = statsFrom(facts, roll);
  const conflicts = consecutiveConflicts(facts);
  const repeated = repeatedPairings(pairingsFrom(facts));

  return (
    <>
      <PageHeader
        title="Rotation"
        description="Who has waited longest for a part, who was used two meetings running, and which pairs keep recurring — across every schedule on file."
        actions={<Badge tone="neutral">{stats.length} in the rotation</Badge>}
      />

      <SchoolTabs />

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
        title="Who is waiting"
        description="Longest without a part first. A publisher under restrictions is not on this list: he is not eligible for a part while they run."
      >
        <DataTable>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Standing</Th>
              <Th align="right">Parts</Th>
              <Th>Last part</Th>
              <Th align="right">Waiting</Th>
            </tr>
          </thead>
          <tbody>
            {stats.map((person) => (
              <tr key={person.key} className="hover:bg-paper">
                <Td className="font-medium">{person.name}</Td>
                <Td className="text-ink-soft">
                  {person.isStudent
                    ? "Student"
                    : person.appointment
                      ? APPOINTMENT_LABELS[person.appointment] ?? person.appointment
                      : "Publisher"}
                </Td>
                <Td align="right">{person.total}</Td>
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
            ))}
          </tbody>
        </DataTable>
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
        The rotation counts every name on every schedule on file{canWrite ? ", including the weeks filed from past schedules" : ""}.
        Suggestions on each week's page come from this list, longest-waiting first, and never offer a brother who
        had a part the week before.
      </p>
    </>
  );
}
