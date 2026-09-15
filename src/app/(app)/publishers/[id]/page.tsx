import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  currentServiceYear, serviceYearMonths, serviceYearLabel, serviceYearOptions,
} from "@/lib/service-year";
import {
  displayName, formatDate, APPOINTMENT_LABELS, PIONEER_LABELS, STATUS_LABELS, reportsHours,
  STANDING_LABELS, STANDING_TONE,
} from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td, Notice, Panel } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { NamePicker } from "@/components/name-picker";
import { TransferForm } from "./transfer-form";
import { deletePublisher } from "../actions";

export const dynamic = "force-dynamic";

export default async function PublisherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sy?: string; saved?: string; merged?: string }>;
}) {
  const user = await requirePermission("publisher:read");
  const { id } = await params;
  const sp = await searchParams;

  const serviceYear = Number(sp.sy) || currentServiceYear();
  const months = serviceYearMonths(serviceYear);

  const publisher = await prisma.publisher.findUnique({
    where: { id },
    include: {
      group: true,
      transfers: {
        include: { fromGroup: true, toGroup: true },
        orderBy: { effectiveDate: "desc" },
        take: 10,
      },
      privilegeAssignments: {
        where: { endDate: null },
        include: { privilege: { select: { name: true } } },
        orderBy: { privilege: { sortOrder: "asc" } },
      },
    },
  });
  if (!publisher) notFound();
  const held = [
    ...publisher.privilegeAssignments.map((a) => `${a.privilege.name} · ${a.role.charAt(0)}${a.role.slice(1).toLowerCase()}`),
    ...publisher.privileges,
  ];

  const others = can(user.role, "publisher:delete")
    ? await prisma.publisher.findMany({
        where: { id: { not: id } },
        select: { id: true, firstName: true, lastName: true, group: { select: { number: true } } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      })
    : [];
  const standing = can(user.role, "standing:read")
    ? await prisma.standingRecord.findMany({
        where: { publisherId: id },
        orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      })
    : [];
  const [reports, groups] = await Promise.all([
    prisma.serviceReport.findMany({
      where: { publisherId: id, OR: months.map((m) => ({ year: m.year, month: m.month })) },
    }),
    prisma.serviceGroup.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true },
    }),
  ]);

  const byKey = new Map(reports.map((r) => [`${r.year}-${r.month}`, r]));
  const showContact = can(user.role, "publisher:readContact");
  const canWrite = can(user.role, "publisher:write");
  const tracksHours = reportsHours(publisher.pioneerStatus);

  const totals = reports.reduce(
    (acc, r) => ({
      studies: acc.studies + r.bibleStudies,
      hours: acc.hours + (r.hours ?? 0),
      active: acc.active + (r.outcome === "SHARED" ? 1 : 0),
    }),
    { studies: 0, hours: 0, active: 0 },
  );

  return (
    <>
      <PageHeader
        title={displayName(publisher)}
        description={[
          APPOINTMENT_LABELS[publisher.appointment],
          publisher.pioneerStatus !== "NONE" ? PIONEER_LABELS[publisher.pioneerStatus] : null,
          publisher.group ? `Group ${publisher.group.number} — ${publisher.group.name}` : "No service group",
        ].filter(Boolean).join("  ·  ")}
        back={{ href: "/publishers", label: "Publishers" }}
        actions={
          <>
            {can(user.role, "export:run") && (
              <a href={`/api/exports/s21/${id}?sy=${serviceYear}`} target="_blank" rel="noopener">
                <Button variant="secondary" size="sm">Download S-21</Button>
              </a>
            )}
            {canWrite && (
              <Link href={`/publishers/${id}/edit`}>
                <Button size="sm">Edit record</Button>
              </Link>
            )}
          </>
        }
      />

      {sp.saved && <Notice tone="success">The record has been saved.</Notice>}
      {sp.merged && <Notice tone="success">The two records have been merged into this one.</Notice>}

      <div className="mb-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Standing" value={STATUS_LABELS[publisher.status]} />
        <Fact label="Baptized" value={publisher.isBaptized ? formatDate(publisher.baptismDate) : "Not baptized"} />
        <Fact label="Date of birth" value={formatDate(publisher.dateOfBirth)} />
        <Fact label="Hope" value={publisher.isAnointed ? "Anointed" : "Other sheep"} />
        <Fact
          label="With the congregation"
          value={
            publisher.sinceDate
              ? `${formatDate(publisher.sinceDate)} · ${
                  publisher.sinceKind === "MOVED_IN"
                    ? "moved in"
                    : publisher.sinceKind === "STARTED_PUBLISHING"
                      ? "started publishing"
                      : "on the roll"
                }`
              : "Not recorded"
          }
        />
      </div>

      {held.length > 0 && (
        <Section
          title="Privileges and assignments"
          actions={<Link href="/privileges" className="text-xs text-pine hover:underline">Manage</Link>}
        >
          <div className="flex flex-wrap gap-1.5">
            {held.map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
          </div>
        </Section>
      )}

      {standing.length > 0 && (
        <Section
          title="Standing"
          description="Confidential — elders only."
          actions={<Link href="/boe/standing" className="text-xs text-pine hover:underline">Manage</Link>}
        >
          <ul className="divide-y divide-rule rounded border border-rule bg-surface">
            {standing.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <Badge tone={STANDING_TONE[r.kind] ?? "neutral"}>
                  {STANDING_LABELS[r.kind] ?? r.kind}
                </Badge>
                <span className="text-xs text-ink-soft">{formatDate(r.eventDate)}</span>
                {r.announcedDate && (
                  <span className="text-xs text-ink-faint">announced {formatDate(r.announcedDate)}</span>
                )}
                {r.kind === "RESTRICTION" && (
                  <span className={`text-xs ${r.liftedDate ? "text-pine-dark" : "text-clay"}`}>
                    {r.liftedDate ? `lifted ${formatDate(r.liftedDate)}` : "still running"}
                  </span>
                )}
                {r.notes && <span className="text-xs text-ink-soft">{r.notes}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        title={`Field service record · ${serviceYearLabel(serviceYear)}`}
        description={
          tracksHours
            ? "Hours are recorded because this publisher serves as a pioneer."
            : "Publishers record participation and Bible studies. Hours appear for months served as an auxiliary pioneer."
        }
        actions={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="sy" className="sr-only">Service year</label>
            <select id="sy" name="sy" defaultValue={serviceYear} className="field-input py-1 text-xs">
              {serviceYearOptions().map((y) => (
                <option key={y} value={y}>{serviceYearLabel(y)}</option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm">Show</Button>
          </form>
        }
      >
        <DataTable>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th>Shared in the ministry</Th>
              <Th align="right">Bible studies</Th>
              <Th>Auxiliary pioneer</Th>
              <Th align="right">Hours</Th>
              <Th>Remarks</Th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const r = byKey.get(`${m.year}-${m.month}`);
              return (
                <tr key={m.label} className={r ? "" : "bg-paper/60"}>
                  <Td className="whitespace-nowrap">{m.label}</Td>
                  <Td>
                    {!r ? (
                      <span className="text-xs text-ink-faint">No report on file</span>
                    ) : r.outcome === "SHARED" ? (
                      <Badge tone="good">Yes</Badge>
                    ) : r.outcome === "DID_NOT_PREACH" ? (
                      <Badge tone="warn">Did not preach</Badge>
                    ) : (
                      <Badge tone="bad">No report</Badge>
                    )}
                  </Td>
                  <Td align="right">{r ? r.bibleStudies : "—"}</Td>
                  <Td>{r?.pioneerStatusUsed === "AUXILIARY" ? <Badge>Auxiliary</Badge> : ""}</Td>
                  <Td align="right">{r?.hours ?? <span className="text-ink-faint">—</span>}</Td>
                  <Td className="text-xs text-ink-soft">{r?.remarks ?? ""}</Td>
                </tr>
              );
            })}
            <tr className="bg-paper font-medium">
              <Td>Service year totals</Td>
              <Td className="text-xs text-ink-soft">{totals.active} months active</Td>
              <Td align="right">{totals.studies}</Td>
              <Td />
              <Td align="right">{totals.hours || "—"}</Td>
              <Td />
            </tr>
          </tbody>
        </DataTable>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        {showContact && (
          <Section title="Contact">
            <Panel className="divide-y divide-rule">
              <Row label="Phone" value={publisher.phone} />
              <Row label="Email" value={publisher.email} />
              <Row label="Address" value={publisher.address} />
              <Row label="In an emergency" value={
                publisher.emergencyContactName
                  ? `${publisher.emergencyContactName}${publisher.emergencyContactPhone ? ` · ${publisher.emergencyContactPhone}` : ""}`
                  : null
              } />
            </Panel>
            {publisher.notes && (
              <p className="mt-3 whitespace-pre-wrap rounded border border-rule bg-surface p-3 text-sm text-ink-soft">
                {publisher.notes}
              </p>
            )}
          </Section>
        )}

        <Section title="Group history">
          {publisher.transfers.length === 0 ? (
            <p className="rounded border border-dashed border-rule-strong bg-surface px-4 py-5 text-sm text-ink-soft">
              No transfers recorded.
            </p>
          ) : (
            <ul className="divide-y divide-rule rounded border border-rule bg-surface">
              {publisher.transfers.map((t) => (
                <li key={t.id} className="px-4 py-2.5 text-sm">
                  <span className="text-ink">
                    {t.fromGroup ? `Group ${t.fromGroup.number}` : "Unassigned"} →{" "}
                    {t.toGroup ? `Group ${t.toGroup.number}` : "Unassigned"}
                  </span>
                  <span className="ml-2 text-xs text-ink-faint">{formatDate(t.effectiveDate)}</span>
                  {t.reason && <p className="text-xs text-ink-soft">{t.reason}</p>}
                </li>
              ))}
            </ul>
          )}

          {canWrite && groups.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 font-serif text-sm">Move to another group</h3>
              <TransferForm publisherId={id} groups={groups} currentGroupId={publisher.groupId} />
            </div>
          )}
        </Section>
      </div>

      {can(user.role, "publisher:delete") && (
        <section className="mt-6 rounded border border-rule bg-surface p-4">
          <h2 className="font-serif text-sm text-ink">Merge with another record</h2>
          <p className="mt-1 max-w-[62ch] text-xs text-ink-soft">
            If this person has a second record under a different spelling, choose it here. You
            will see both side by side before anything changes.
          </p>
          <form method="get" action="/publishers/merge" className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="a" value={id} />
            <NamePicker
              id="merge-b"
              name="b"
              ariaLabel="Other record"
              placeholder="Type a name…"
              className="max-w-xs"
              options={others.map((o) => ({
                value: o.id,
                label: `${o.lastName}, ${o.firstName}${o.group ? ` (Group ${o.group.number})` : ""}`,
              }))}
            />
            <Button type="submit" variant="secondary" size="sm">Compare</Button>
          </form>
        </section>
      )}

      {can(user.role, "publisher:delete") && (
        <section className="mt-6 rounded border border-clay/25 bg-clay-light/40 p-4">
          <h2 className="font-serif text-sm text-clay">Remove this record</h2>
          <p className="mt-1 max-w-[62ch] text-xs text-ink-soft">
            Deleting removes the publisher and every field service report attached to them. For
            someone who has moved away, set their standing to “Transferred out” instead so the
            history stays intact.
          </p>
          <form action={deletePublisher} className="mt-3">
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="danger" size="sm">Delete permanently</Button>
          </form>
        </section>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-rule bg-surface px-4 py-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-4 px-4 py-2.5 text-sm">
      <span className="w-32 shrink-0 text-xs text-ink-faint">{label}</span>
      <span className="text-ink">{value || <span className="text-ink-faint">—</span>}</span>
    </div>
  );
}
