import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { currentServiceYear, serviceYearLabel, serviceYearOptions } from "@/lib/service-year";
import { displayName, formatDate, APPOINTMENT_LABELS, PIONEER_LABELS } from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { GroupForm } from "../group-form";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sy?: string }>;
}) {
  const user = await requirePermission("group:read");
  const { id } = await params;
  const { sy } = await searchParams;
  const serviceYear = Number(sy) || currentServiceYear();

  const group = await prisma.serviceGroup.findUnique({
    where: { id },
    include: {
      overseer: true,
      assistant: true,
      members: { orderBy: [{ lastName: "asc" }, { firstName: "asc" }] },
      transfersIn: {
        include: { publisher: true, fromGroup: true },
        orderBy: { effectiveDate: "desc" },
        take: 8,
      },
    },
  });
  if (!group) notFound();

  const elders = await prisma.publisher.findMany({
    where: { appointment: { in: ["ELDER", "MINISTERIAL_SERVANT"] }, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, appointment: true },
  });

  return (
    <>
      <PageHeader
        title={`Group ${group.number} — ${group.name}`}
        description={`${group.members.length} publishers. Overseer: ${group.overseer ? displayName(group.overseer) : "not assigned"}.`}
        back={{ href: "/groups", label: "Service groups" }}
        actions={
          can(user.role, "export:run") && (
            <>
              <a href={`/api/exports/s21/batch?sy=${serviceYear}&group=${id}`} target="_blank" rel="noopener">
                <Button variant="secondary" size="sm">S-21s for this group</Button>
              </a>
              <a href={`/api/exports/group/${id}?sy=${serviceYear}`} target="_blank" rel="noopener">
                <Button variant="secondary" size="sm">Field service analysis</Button>
              </a>
            </>
          )
        }
      />

      <Section
        title="Roster"
        actions={
          <form method="get" className="flex items-center gap-2">
            <select name="sy" defaultValue={serviceYear} className="field-input py-1 text-xs" aria-label="Service year">
              {serviceYearOptions().map((y) => (
                <option key={y} value={y}>{serviceYearLabel(y)}</option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm">Set year</Button>
          </form>
        }
      >
        {group.members.length === 0 ? (
          <p className="rounded border border-dashed border-rule-strong bg-surface px-4 py-6 text-sm text-ink-soft">
            No publishers assigned. Open a publisher's record and set their service group.
          </p>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Publisher</Th>
                <Th>Appointment</Th>
                <Th>Pioneer</Th>
                <Th>Baptized</Th>
                <Th align="right">Standing</Th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((m) => (
                <tr key={m.id} className="hover:bg-paper">
                  <Td>
                    <Link href={`/publishers/${m.id}`} className="font-medium hover:text-pine hover:underline">
                      {displayName(m)}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{APPOINTMENT_LABELS[m.appointment]}</Td>
                  <Td className="text-ink-soft">{PIONEER_LABELS[m.pioneerStatus]}</Td>
                  <Td className="text-ink-soft">{m.isBaptized ? formatDate(m.baptismDate) : "—"}</Td>
                  <Td align="right">
                    <Badge tone={m.status === "ACTIVE" ? "good" : m.status === "IRREGULAR" ? "warn" : "neutral"}>
                      {m.status.replace("_", " ").toLowerCase()}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      {group.transfersIn.length > 0 && (
        <Section title="Recently moved into this group">
          <ul className="divide-y divide-rule rounded border border-rule bg-surface">
            {group.transfersIn.map((t) => (
              <li key={t.id} className="px-4 py-2.5 text-sm">
                {displayName(t.publisher)}
                <span className="ml-2 text-xs text-ink-faint">
                  from {t.fromGroup ? `Group ${t.fromGroup.number}` : "no group"} · {formatDate(t.effectiveDate)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {can(user.role, "group:write") && (
        <Section title="Group details">
          <div className="max-w-2xl">
            <GroupForm
              group={{
                id: group.id, number: group.number, name: group.name,
                overseerId: group.overseerId, assistantId: group.assistantId, active: group.active,
              }}
              candidates={elders.map((e) => ({
                id: e.id,
                label: `${displayName(e)}${e.appointment === "MINISTERIAL_SERVANT" ? " (servant)" : ""}`,
              }))}
            />
          </div>
        </Section>
      )}
    </>
  );
}
