import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { APPOINTMENT_LABELS, displayName } from "@/lib/format";
import { formatWeekOf } from "@/lib/school";
import { approvedReaders, loadPools, readerUsage } from "@/lib/school-queries";
import { DataTable, EmptyState, PageHeader, Section, Td, Th } from "@/components/shell";
import { Badge } from "@/components/ui";
import { SchoolTabs } from "../tabs";
import { AddReaderForm, RemoveReaderButton } from "./reader-forms";

export const dynamic = "force-dynamic";

/**
 * The brothers the body of elders approved to read the Scriptures at the
 * meeting. The reader of the congregation Bible study is picked from this list
 * alone, so the overseer keeps it and the secretary corrects it.
 */
export default async function SchoolReadersPage() {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");

  const [readers, pools, usage] = await Promise.all([approvedReaders(), loadPools(), readerUsage()]);
  const onList = new Set(readers.map((r) => r.id));
  const brothers = pools.prayer.filter((b) => !onList.has(b.value.replace(/^p:/, "")));

  return (
    <>
      <PageHeader
        title="Approved readers"
        description="The brothers the body of elders has approved to read the Scriptures at the meeting. The reader of the congregation Bible study is picked from this list alone."
        actions={<Badge tone="neutral">{readers.length} on the list</Badge>}
      />

      <SchoolTabs />

      <Section>
        {readers.length === 0 ? (
          <EmptyState
            title="No approved readers yet"
            description="Add the brothers the body of elders has approved, and the reader's picker on every schedule will offer them."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Appointment</Th>
                <Th align="right">Times read</Th>
                <Th>Last read</Th>
                {canWrite && <Th align="right"></Th>}
              </tr>
            </thead>
            <tbody>
              {readers.map((reader) => {
                const used = usage.get(reader.id);
                return (
                  <tr key={reader.id} className="hover:bg-paper">
                    <Td className="font-medium">{displayName(reader)}</Td>
                    <Td className="text-ink-soft">
                      {reader.appointment === "ELDER" || reader.appointment === "MINISTERIAL_SERVANT"
                        ? <Badge tone="neutral">{APPOINTMENT_LABELS[reader.appointment]}</Badge>
                        : APPOINTMENT_LABELS[reader.appointment] ?? reader.appointment}
                    </Td>
                    <Td align="right">{used?.total ?? 0}</Td>
                    <Td className="text-ink-soft">
                      {used ? formatWeekOf(used.last) : <span className="text-ink-faint">not yet</span>}
                    </Td>
                    {canWrite && (
                      <Td align="right">
                        <RemoveReaderButton id={reader.id} name={displayName(reader)} />
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}

        {canWrite && (
          <div className="mt-4">
            <AddReaderForm brothers={brothers} />
          </div>
        )}
      </Section>

      <p className="text-xs text-ink-faint">
        The list is held once for the whole congregation: every schedule's reader picker offers exactly
        these brothers, and a brother taken off the list keeps the readings already printed against him.
      </p>
    </>
  );
}
