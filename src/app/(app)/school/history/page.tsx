import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { assignmentFacts, pairingsFrom } from "@/lib/rotation";
import { DataTable, EmptyState, PageHeader, Section, Td, Th } from "@/components/shell";
import { Badge } from "@/components/ui";
import { SchoolTabs } from "../tabs";
import { PastScheduleForm } from "./history-forms";

export const dynamic = "force-dynamic";

const SHOWN_PAIRINGS = 200;

/**
 * The schedules the congregation ran before the app, and the pairings they
 * hold: who assisted whom is the question the overseer asks when he puts a
 * student with an assistant, and only the filed history answers it.
 */
export default async function SchoolHistoryPage() {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");

  const facts = await assignmentFacts();
  const pairings = pairingsFrom(facts);

  return (
    <>
      <PageHeader
        title="History"
        description="The schedules from before the app, filed so the rotation and the pairings know what already happened."
        actions={<Badge tone="neutral">{facts.length} names on file</Badge>}
      />

      <SchoolTabs />

      {canWrite && (
        <Section>
          <PastScheduleForm />
        </Section>
      )}

      <Section
        title="Who assisted whom"
        description="Every student assignment handled with an assistant, newest first. A pair that keeps recurring is worth breaking."
      >
        {pairings.length === 0 ? (
          <EmptyState
            title="No pairings on file"
            description="Once student assignments with an assistant are assigned — or past schedules are filed — the pairs show here."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Meeting</Th>
                <Th>Part</Th>
                <Th>Student</Th>
                <Th>Assisted by</Th>
              </tr>
            </thead>
            <tbody>
              {pairings.slice(0, SHOWN_PAIRINGS).map((pairing) => (
                <tr key={pairing.partId} className="hover:bg-paper">
                  <Td className="text-ink-soft">{formatDate(pairing.date)}</Td>
                  <Td className="text-ink">{pairing.partTitle}</Td>
                  <Td>{pairing.student}</Td>
                  <Td className="text-ink-soft">{pairing.assistant}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {pairings.length > SHOWN_PAIRINGS && (
          <p className="mt-2 text-xs text-ink-faint">
            Showing the {SHOWN_PAIRINGS} most recent of {pairings.length} pairings.
          </p>
        )}
      </Section>
    </>
  );
}
