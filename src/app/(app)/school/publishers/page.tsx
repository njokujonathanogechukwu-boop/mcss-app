import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  APPOINTMENT_LABELS, GENDER_LABELS, PIONEER_LABELS, displayName,
} from "@/lib/format";
import { formatWeekOf, personRef } from "@/lib/school";
import { approvedReaderIds, assignmentUsage, rollForSchool } from "@/lib/school-queries";
import { DataTable, EmptyState, PageHeader, Section, Td, Th } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { SchoolTabs } from "../tabs";

export const dynamic = "force-dynamic";

/**
 * The publisher list the overseer plans the meeting from. Names, groups and
 * appointments only: no phone numbers, no addresses, no reports and none of the
 * elders' items. The secretary's list at /publishers keeps all of that.
 */
export default async function SchoolPublishersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string; brothers?: string }>;
}) {
  await requirePermission("school:read");
  const sp = await searchParams;

  const [roll, groups, usage, readers] = await Promise.all([
    rollForSchool({ q: sp.q, groupId: sp.group }),
    prisma.serviceGroup.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true },
    }),
    assignmentUsage(),
    approvedReaderIds(),
  ]);

  // Chairmen and the parts that are not student assignments go to brothers the
  // body of elders approved (S-38 par. 24), so the list can be cut down to them.
  const shown = sp.brothers === "1" ? roll.filter((p) => p.gender === "MALE") : roll;

  const keep = new URLSearchParams();
  if (sp.q) keep.set("q", sp.q);
  if (sp.group) keep.set("group", sp.group);
  if (sp.brothers === "1") keep.set("brothers", "1");

  return (
    <>
      <PageHeader
        title="Publishers"
        description="Everyone the overseer may assign a part to, and whether they have been used lately. Contact details and field service reports stay with the secretary."
        actions={<Badge tone="neutral">{shown.length} shown</Badge>}
      />

      <SchoolTabs />

      <Section>
        <form method="get" action="/school/publishers" className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="q" className="field-label">Search by name</label>
            <input
              id="q" name="q" type="search" defaultValue={sp.q ?? ""}
              placeholder="Jonathan" className="field-input"
            />
          </div>
          <div className="min-w-[11rem]">
            <label htmlFor="group" className="field-label">Group</label>
            <select id="group" name="group" defaultValue={sp.group ?? ""} className="field-input">
              <option value="">Every group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.number} — {g.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
            <input
              type="checkbox" name="brothers" value="1" defaultChecked={sp.brothers === "1"}
              className="h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
            />
            Brothers only
          </label>
          <Button type="submit" variant="secondary" size="sm">Filter</Button>
          {keep.size > 0 && (
            <a href="/school/publishers" className="pb-2 text-sm text-ink-soft hover:text-pine hover:underline">
              Clear
            </a>
          )}
        </form>

        {shown.length === 0 ? (
          <EmptyState
            title="No publishers match"
            description="Try a different name, or clear the filters to see the whole roll."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Group</Th>
                <Th>Brother or sister</Th>
                <Th>Appointment</Th>
                <Th>Pioneering</Th>
                <Th>Privileges</Th>
                <Th align="right">Parts</Th>
                <Th>Last given one</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const used = usage.get(personRef("publisher", p.id));
                return (
                  <tr key={p.id} className="hover:bg-paper">
                    <Td className="font-medium">
                      {displayName(p)}
                      {readers.has(p.id) && (
                        <span className="ml-2 inline-block align-middle">
                          <Badge tone="good">Approved reader</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-ink-soft">
                      {p.group ? `${p.group.number} — ${p.group.name}` : "—"}
                    </Td>
                    <Td className="text-ink-soft">{GENDER_LABELS[p.gender] ?? p.gender}</Td>
                    <Td className="text-ink-soft">
                      {p.appointment === "ELDER" || p.appointment === "MINISTERIAL_SERVANT"
                        ? <Badge tone="neutral">{APPOINTMENT_LABELS[p.appointment]}</Badge>
                        : APPOINTMENT_LABELS[p.appointment] ?? p.appointment}
                    </Td>
                    <Td className="text-ink-soft">
                      {p.pioneerStatus === "NONE" ? "—" : PIONEER_LABELS[p.pioneerStatus] ?? p.pioneerStatus}
                    </Td>
                    <Td className="text-xs text-ink-soft">
                      {p.privileges.length > 0 ? p.privileges.join(", ") : "—"}
                    </Td>
                    <Td align="right">{used?.total ?? 0}</Td>
                    <Td className="text-ink-soft">
                      {used ? formatWeekOf(used.last) : <span className="text-ink-faint">never</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </Section>
    </>
  );
}
