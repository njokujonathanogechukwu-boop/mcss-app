import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { displayName, formatDate, APPOINTMENT_LABELS, PIONEER_LABELS, STATUS_LABELS } from "@/lib/format";
import { PageHeader, DataTable, Th, Td, EmptyState } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { currentServiceYear } from "@/lib/service-year";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  ACTIVE: "good", IRREGULAR: "warn", INACTIVE: "bad",
  TRANSFERRED_OUT: "neutral", DECEASED: "neutral",
};

export default async function PublishersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; group?: string; status?: string; appointment?: string; pioneer?: string; sort?: string; dir?: string }>;
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
    ...(sp.pioneer ? { pioneerStatus: sp.pioneer as Prisma.EnumPioneerStatusFilter["equals"] } : {}),
  };

  // Sorting: a column name and direction from the query string; surname is
  // the tie-breaker so the order is stable.
  const dir: Prisma.SortOrder = sp.dir === "desc" ? "desc" : "asc";
  const sort = sp.sort ?? "name";
  const orderBy: Prisma.PublisherOrderByWithRelationInput[] = ({
    name: [{ lastName: dir }, { firstName: dir }],
    group: [{ group: { number: dir } }, { lastName: "asc" }],
    appointment: [{ appointment: dir }, { lastName: "asc" }],
    pioneer: [{ pioneerStatus: dir }, { lastName: "asc" }],
    baptized: [{ baptismDate: dir }, { lastName: "asc" }],
    status: [{ status: dir }, { lastName: "asc" }],
  } satisfies Record<string, Prisma.PublisherOrderByWithRelationInput[]>)[sort] ?? [{ lastName: "asc" }, { firstName: "asc" }];

  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "sort" && k !== "dir") keep.set(k, v);
  const sortHref = (col: string) =>
    `/publishers?${keep.toString()}${keep.size ? "&" : ""}sort=${col}&dir=${sort === col && dir === "asc" ? "desc" : "asc"}`;
  const arrow = (col: string) => (sort === col ? (dir === "asc" ? " ↑" : " ↓") : "");

  const [publishers, groups, total] = await Promise.all([
    prisma.publisher.findMany({
      where,
      include: { group: { select: { number: true, name: true } } },
      orderBy,
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
        description={`${total} records on file. Search by name, narrow the list, or click a column heading to sort.`}
        actions={
          <>
            {can(user.role, "export:run") && (
              <>
                <a href={`/api/exports/s21/batch?sy=${currentServiceYear()}`} target="_blank" rel="noopener">
                  <Button variant="secondary" size="sm">Every S-21</Button>
                </a>
                <a href={`/api/exports/s21/batch?sy=${currentServiceYear()}&category=pioneers`} target="_blank" rel="noopener">
                  <Button variant="secondary" size="sm">Pioneers &amp; missionaries</Button>
                </a>
                <a href={`/api/exports/s21/batch?sy=${currentServiceYear()}&category=auxiliary`} target="_blank" rel="noopener">
                  <Button variant="secondary" size="sm">Auxiliary pioneers</Button>
                </a>
                <a href={`/api/exports/s21/batch?sy=${currentServiceYear()}&category=others`} target="_blank" rel="noopener">
                  <Button variant="secondary" size="sm">Other publishers</Button>
                </a>
              </>
            )}
            {can(user.role, "publisher:delete") && (
              <Link href="/publishers/merge">
                <Button variant="secondary" size="sm">Find duplicates</Button>
              </Link>
            )}
            {canWrite && (
              <Link href="/publishers/links">
                <Button variant="secondary" size="sm">Update links</Button>
              </Link>
            )}
            {canWrite && (
              <Link href="/publishers/new">
                <Button>Add a publisher</Button>
              </Link>
            )}
          </>
        }
      />

      <form method="get" className="mb-6 grid gap-3 rounded border border-rule bg-surface p-4 sm:grid-cols-2 lg:grid-cols-7">
        {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
        {sp.dir && <input type="hidden" name="dir" value={sp.dir} />}
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
        <div>
          <label htmlFor="appointment" className="field-label">Appointment</label>
          <select id="appointment" name="appointment" defaultValue={sp.appointment ?? ""} className="field-input">
            <option value="">Any</option>
            {Object.entries(APPOINTMENT_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pioneer" className="field-label">Pioneer</label>
          <select id="pioneer" name="pioneer" defaultValue={sp.pioneer ?? ""} className="field-input">
            <option value="">Any</option>
            <option value="NONE">Not a pioneer</option>
            <option value="AUXILIARY">Auxiliary (continuous)</option>
            <option value="REGULAR">Regular pioneer</option>
            <option value="SPECIAL">Special pioneer</option>
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
              <Th><Link href={sortHref("name")} className="hover:text-pine">Publisher{arrow("name")}</Link></Th>
              <Th><Link href={sortHref("group")} className="hover:text-pine">Group{arrow("group")}</Link></Th>
              <Th><Link href={sortHref("appointment")} className="hover:text-pine">Appointment{arrow("appointment")}</Link></Th>
              <Th><Link href={sortHref("pioneer")} className="hover:text-pine">Pioneer{arrow("pioneer")}</Link></Th>
              <Th><Link href={sortHref("baptized")} className="hover:text-pine">Baptized{arrow("baptized")}</Link></Th>
              {showContact && <Th>Phone</Th>}
              <Th align="right"><Link href={sortHref("status")} className="hover:text-pine">Standing{arrow("status")}</Link></Th>
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
