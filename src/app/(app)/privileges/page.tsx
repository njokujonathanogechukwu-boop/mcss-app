import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate, displayName } from "@/lib/format";
import { PageHeader, Section, EmptyState } from "@/components/shell";
import { Button, Badge } from "@/components/ui";
import { AssignForm, NewPrivilegeForm, CATEGORY_LABELS } from "./forms";
import { endAssignment, retirePrivilege } from "./actions";

export const dynamic = "force-dynamic";

export default async function PrivilegesPage() {
  const user = await requirePermission("privilege:read");
  const canWrite = can(user.role, "privilege:write");

  const [privileges, publishers] = await Promise.all([
    prisma.privilege.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: {
        holders: {
          where: { endDate: null },
          include: { publisher: { select: { id: true, firstName: true, lastName: true, status: true } } },
          orderBy: [{ publisher: { lastName: "asc" } }],
        },
      },
    }),
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const categories = (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[])
    .map((c) => ({ key: c, label: CATEGORY_LABELS[c], items: privileges.filter((p) => p.category === c) }))
    .filter((c) => c.items.length > 0);

  const holderCount = new Set(privileges.flatMap((p) => p.holders.map((h) => h.publisherId))).size;

  return (
    <>
      <PageHeader
        title="Privileges and assignments"
        description="Who holds which congregation assignment and meeting duty. Ending an assignment keeps it on the person’s history."
        actions={
          can(user.role, "export:run") && (
            <a href="/api/exports/privileges" target="_blank" rel="noopener">
              <Button size="sm">Download as PDF</Button>
            </a>
          )
        }
      />

      {privileges.length === 0 ? (
        <EmptyState
          title="No privileges set up yet"
          description="Add the assignments your congregation uses below, then assign brothers to them."
        />
      ) : (
        <>
          <p className="mb-6 text-sm text-ink-soft">
            {privileges.length} privilege{privileges.length === 1 ? "" : "s"} · {holderCount} publisher{holderCount === 1 ? "" : "s"} with at least one.
          </p>
          {categories.map((cat) => (
            <Section key={cat.key} title={cat.label}>
              <ul className="divide-y divide-rule rounded border border-rule bg-surface">
                {cat.items.map((p) => (
                  <li key={p.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{p.name}</p>
                        {p.description && <p className="text-xs text-ink-soft">{p.description}</p>}
                      </div>
                      {canWrite && (
                        <form action={retirePrivilege}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="shrink-0 text-xs text-ink-faint hover:text-clay" title="Remove this privilege from the list">Retire</button>
                        </form>
                      )}
                    </div>
                    {p.holders.length === 0 ? (
                      <p className="mt-1.5 text-xs text-ink-faint">Nobody assigned.</p>
                    ) : (
                      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                        {p.holders.map((h) => (
                          <li key={h.id} className="flex items-center gap-2 text-sm">
                            <Link href={`/publishers/${h.publisher.id}`} className="text-ink hover:text-pine hover:underline">
                              {displayName(h.publisher)}
                            </Link>
                            {h.startDate && <span className="text-xxs text-ink-faint">since {formatDate(h.startDate)}</span>}
                            {h.publisher.status !== "ACTIVE" && <Badge tone="warn">{h.publisher.status.toLowerCase()}</Badge>}
                            {canWrite && (
                              <form action={endAssignment}>
                                <input type="hidden" name="id" value={h.id} />
                                <button className="text-xxs text-ink-faint hover:text-clay" aria-label={`End ${p.name} for ${displayName(h.publisher)}`}>end</button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </>
      )}

      {canWrite && (
        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Assign a privilege">
            {privileges.length === 0 ? (
              <p className="text-sm text-ink-soft">Add a privilege first.</p>
            ) : (
              <AssignForm
                privileges={privileges.map((p) => ({ id: p.id, name: p.name }))}
                publishers={publishers.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}` }))}
              />
            )}
          </Section>
          <Section title="Add a privilege to the list">
            <NewPrivilegeForm />
          </Section>
        </div>
      )}
    </>
  );
}
