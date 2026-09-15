import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { displayName } from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td, EmptyState } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { GroupForm } from "./group-form";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await requirePermission("group:read");
  const canWrite = can(user.role, "group:write");

  const [groups, elders] = await Promise.all([
    prisma.serviceGroup.findMany({
      include: {
        overseer: true,
        assistant: true,
        _count: {
          select: { members: { where: { status: { in: ["ACTIVE", "IRREGULAR"] } } } },
        },
      },
      orderBy: { number: "asc" },
    }),
    prisma.publisher.findMany({
      where: { appointment: { in: ["ELDER", "MINISTERIAL_SERVANT"] }, status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, appointment: true },
    }),
  ]);

  const candidates = elders.map((e) => ({
    id: e.id,
    label: `${displayName(e)}${e.appointment === "MINISTERIAL_SERVANT" ? " (servant)" : ""}`,
  }));

  return (
    <>
      <PageHeader
        title="Service groups"
        description="Each group has an overseer, an assistant and a roster. Moves between groups are recorded on the publisher's record."
        actions={
          can(user.role, "export:run") ? (
            <a href="/api/exports/rosters" target="_blank" rel="noopener">
              <Button variant="secondary" size="sm">Download rosters (Excel)</Button>
            </a>
          ) : undefined
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create the first service group, then assign publishers to it from their records."
        />
      ) : (
        <Section>
          <DataTable>
            <thead>
              <tr>
                <Th>Group</Th>
                <Th>Overseer</Th>
                <Th>Assistant</Th>
                <Th align="right">On the roll</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-paper">
                  <Td>
                    <Link href={`/groups/${g.id}`} className="font-medium hover:text-pine hover:underline">
                      {g.number} — {g.name}
                    </Link>
                    {!g.active && <span className="ml-2"><Badge tone="quiet">Retired</Badge></span>}
                  </Td>
                  <Td className="text-ink-soft">
                    {g.overseer ? displayName(g.overseer) : <Badge tone="warn">Not assigned</Badge>}
                  </Td>
                  <Td className="text-ink-soft">
                    {g.assistant ? displayName(g.assistant) : <span className="text-ink-faint">—</span>}
                  </Td>
                  <Td align="right">{g._count.members}</Td>
                  <Td align="right">
                    <Link href={`/groups/${g.id}`} className="text-xs text-pine hover:underline">
                      Roster
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Section>
      )}

      {canWrite && (
        <Section title="Add a group">
          <div className="max-w-2xl">
            <GroupForm candidates={candidates} />
          </div>
        </Section>
      )}
    </>
  );
}
