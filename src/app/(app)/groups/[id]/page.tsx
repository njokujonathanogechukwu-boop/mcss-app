import Link from "next/link";
import { notFound } from "next/navigation";
import type { PublisherStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { neighbours } from "@/lib/neighbours";
import { currentServiceYear, serviceYearLabel, serviceYearOptions } from "@/lib/service-year";
import { groupReportLink } from "@/lib/group-reports";
import {
  displayName, formatDate, APPOINTMENT_LABELS, PIONEER_LABELS, STATUS_LABELS, STATUS_TONE,
} from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { GroupForm } from "../group-form";
import { GroupReportLink } from "../group-report-link";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sy?: string; tab?: string }>;
}) {
  const user = await requirePermission("group:read");
  const { id } = await params;
  const { sy, tab } = await searchParams;
  const serviceYear = Number(sy) || currentServiceYear();
  const activeTab = tab === "moved" ? "moved" : "roster";

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

  const [elders, allGroups] = await Promise.all([
    prisma.publisher.findMany({
      where: { appointment: { in: ["ELDER", "MINISTERIAL_SERVANT"] }, status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, appointment: true },
    }),
    // The groups list's own order, by number.
    prisma.serviceGroup.findMany({
      select: { id: true, number: true, name: true },
      orderBy: [{ number: "asc" }, { id: "asc" }],
    }),
  ]);
  // The service year and the open tab travel with the arrows.
  const keep = new URLSearchParams();
  if (sy) keep.set("sy", sy);
  if (tab) keep.set("tab", tab);
  const query = keep.size ? `?${keep.toString()}` : "";
  const nav = neighbours(allGroups, group.id, (g) => ({ href: `/groups/${g.id}${query}`, label: `Group ${g.number} — ${g.name}` }));

  // The roll is what the Excel roster prints, so the two must agree.
  const onRoll = (status: PublisherStatus) => status === "ACTIVE" || status === "IRREGULAR";
  // A removal is elders-only, and this page is readable by servants and viewers,
  // so a disfellowshipped or disassociated publisher is left off it entirely
  // rather than shown without a reason.
  const seesRemovals = can(user.role, "standing:read");
  const roster = group.members.filter((m) => onRoll(m.status));
  const movedOut = group.members.filter(
    (m) =>
      !onRoll(m.status) &&
      (seesRemovals || (m.status !== "DISFELLOWSHIPPED" && m.status !== "DISASSOCIATED")),
  );

  // The link is worth as much as the group's records to whoever holds it, so
  // it is only shown to someone who may change the group itself.
  const reportLink = can(user.role, "group:write") ? await groupReportLink(group.id) : null;

  return (
    <>
      <PageHeader
        title={`Group ${group.number} — ${group.name}`}
        description={`${roster.length} publisher${roster.length === 1 ? "" : "s"} on the roll${
          movedOut.length ? ` · ${movedOut.length} moved out` : ""
        }. Overseer: ${group.overseer ? displayName(group.overseer) : "not assigned"}.`}
        back={{ href: "/groups", label: "Service groups" }}
        nav={nav}
        actions={
          can(user.role, "export:run") && (
            <>
              <a href={`/api/exports/s21/batch?sy=${serviceYear}&group=${id}`}>
                <Button variant="secondary" size="sm">S-21s for this group</Button>
              </a>
              <a href={`/api/exports/group/${id}?sy=${serviceYear}`} target="_blank" rel="noopener">
                <Button variant="secondary" size="sm">Field service analysis</Button>
              </a>
            </>
          )
        }
      />

      <div role="tablist" aria-label="Group lists" className="mb-6 flex gap-1 border-b border-rule">
        {[
          ["roster", `Roster · ${roster.length}`, `/groups/${id}?sy=${serviceYear}`],
          ["moved", `Moved out · ${movedOut.length}`, `/groups/${id}?sy=${serviceYear}&tab=moved`],
        ].map(([key, label, href]) => (
          <Link
            key={key}
            role="tab"
            href={href}
            aria-selected={activeTab === key}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              activeTab === key
                ? "border-pine font-medium text-pine-dark"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {activeTab === "roster" ? (
        <Section
          title="Roster"
          description="Publishers on the roll in this group — the same list the Excel roster prints."
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
          {roster.length === 0 ? (
            <p className="rounded border border-dashed border-rule-strong bg-surface px-4 py-6 text-sm text-ink-soft">
              No publishers on the roll in this group. Open a publisher&rsquo;s record and set their
              service group.
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
                {roster.map((m) => (
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
                      <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{STATUS_LABELS[m.status] ?? m.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Section>
      ) : (
        <Section
          title="Moved out"
          description="Still attached to this group but no longer on the roll, so they are not counted, not on the roster and not expected to report. Open a record and set the status back to Active if they return."
        >
          {movedOut.length === 0 ? (
            <p className="rounded border border-dashed border-rule-strong bg-surface px-4 py-6 text-sm text-ink-soft">
              Nobody has moved out of this group.
            </p>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Publisher</Th>
                  <Th>Appointment</Th>
                  <Th>Pioneer</Th>
                  <Th align="right">Record status</Th>
                </tr>
              </thead>
              <tbody>
                {movedOut.map((m) => (
                  <tr key={m.id} className="hover:bg-paper">
                    <Td>
                      <Link href={`/publishers/${m.id}`} className="font-medium hover:text-pine hover:underline">
                        {displayName(m)}
                      </Link>
                    </Td>
                    <Td className="text-ink-soft">{APPOINTMENT_LABELS[m.appointment]}</Td>
                    <Td className="text-ink-soft">{PIONEER_LABELS[m.pioneerStatus]}</Td>
                    <Td align="right">
                      <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{STATUS_LABELS[m.status] ?? m.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Section>
      )}

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

      {reportLink && (
        <Section
          title="Reports for this group"
          description="The field service overseer's own page, where he reads back over his group's months and sends the reports still missing for the month being collected."
        >
          <div className="max-w-2xl">
            <GroupReportLink groupId={group.id} link={reportLink} />
          </div>
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
