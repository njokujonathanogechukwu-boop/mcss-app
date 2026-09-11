import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { displayName, formatDate, APPOINTMENT_LABELS, PIONEER_LABELS, STATUS_LABELS } from "@/lib/format";
import { PageHeader, DataTable, Th, Td, EmptyState } from "@/components/shell";
import { Badge, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  ACTIVE: "good", IRREGULAR: "warn", INACTIVE: "bad",
  TRANSFERRED_OUT: "neutral", DECEASED: "neutral",
};

export default async function PublishersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string; status?: string; appointment?: string }>;
}) {
  const user = await requirePermission("publisher:read");
  const sp = await searchParams;

  const where: Prisma.PublisherWhereInput = {
    ...(sp.q
      ? {
          OR: [
            { firstName: { contains: sp.q, mode: "insensitive" } },
            { lastName: { contains: sp.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(sp.group ? { groupId: sp.group } : {}),
    ...(sp.status ? { status: sp.status as Prisma.EnumPublisherStatusFilter["equals"] } : {}),
    ...(sp.appointment
      ? { appointment: sp.appointment as Prisma.EnumAppointmentFilter["equals"] }
      : {}),
  };

  const [publishers, groups, total] = await Promise.all([
    prisma.publisher.findMany({
      where,
      include: { group: { select: { number: true, name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
    }),
    prisma.serviceGroup.findMany({ where: { active: true }, orderBy: { number: "asc" } }),
    prisma.publisher.count(),
  ]);

  const showContact = can(user.role, "publisher:readContact");
  const canWrite = can(user.role, "publisher:write");

  return (
    <>
      <PageHeader
        title="Publishers"
        description={`${total} records on file. Search by name or narrow the list by group, standing or appointment.`}
        actions={
          canWrite && (
            <Link href="/publishers/new">
              <Button>Add a publisher</Button>
            </Link>
          )
        }
      />

      <form method="get" className="mb-6 grid gap-3 rounded border border-rule bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="field-label">Name</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Search" className="field-input" />
        </div>
        <div>
          <label htmlFor="group" className="field-label">Group</label>
          <select id="group" name="group" defaultValue={sp.group ?? ""} className="field-input">
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.number} — {g.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="field-label">Standing</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="field-input">
            <option value="">Any</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="secondary" className="w-full">Apply</Button>
          <Link href="/publishers" className="shrink-0">
            <Button type="button" variant="ghost">Clear</Button>
          </Link>
        </div>
      </form>

      {publishers.length === 0 ? (
        <EmptyState
          title="No records match"
          description="Widen the filters, or import your existing roster to get started."
          action={
            canWrite ? (
              <Link href="/import"><Button variant="secondary">Import records</Button></Link>
            ) : undefined
          }
        />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Publisher</Th>
              <Th>Group</Th>
              <Th>Appointment</Th>
              <Th>Pioneer</Th>
              <Th>Baptized</Th>
              {showContact && <Th>Phone</Th>}
              <Th align="right">Standing</Th>
            </tr>
          </thead>
          <tbody>
            {publishers.map((p) => (
              <tr key={p.id} className="hover:bg-paper">
                <Td>
                  <Link href={`/publishers/${p.id}`} className="font-medium text-ink hover:text-pine hover:underline">
                    {displayName(p)}
                  </Link>
                </Td>
                <Td className="text-ink-soft">
                  {p.group ? `${p.group.number} — ${p.group.name}` : <span className="text-ink-faint">—</span>}
                </Td>
                <Td className="text-ink-soft">{APPOINTMENT_LABELS[p.appointment]}</Td>
                <Td className="text-ink-soft">{PIONEER_LABELS[p.pioneerStatus]}</Td>
                <Td className="text-ink-soft">{p.isBaptized ? formatDate(p.baptismDate) : "—"}</Td>
                {showContact && <Td className="text-ink-soft">{p.phone ?? "—"}</Td>}
                <Td align="right">
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {publishers.length === 300 && (
        <p className="mt-3 text-xs text-ink-faint">
          Showing the first 300 matches. Narrow the search to see the rest.
        </p>
      )}
    </>
  );
}
