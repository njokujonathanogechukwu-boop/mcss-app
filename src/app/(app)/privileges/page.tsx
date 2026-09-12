import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { PageHeader, Section, EmptyState, DataTable, Th, Td } from "@/components/shell";
import { Button } from "@/components/ui";
import { AssignForm, NewPrivilegeForm, ROLE_LABELS } from "./forms";
import { endAssignment, retirePrivilege } from "./actions";
import type { PrivilegeRole } from "@prisma/client";

export const dynamic = "force-dynamic";

const ROLES: PrivilegeRole[] = ["OVERSEER", "ASSISTANT", "SERVANT", "ASSIGNEE"];

/** Short form of a name for the table, as the assignment sheet writes it: "J. Njoku". */
function shortName(p: { firstName: string; lastName: string }) {
  const initial = p.firstName.trim().charAt(0).toUpperCase();
  return initial ? `${initial}. ${p.lastName}` : p.lastName;
}

export default async function PrivilegesPage() {
  const user = await requirePermission("privilege:read");
  const canWrite = can(user.role, "privilege:write");

  const [departments, publishers] = await Promise.all([
    prisma.privilege.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        holders: {
          where: { endDate: null },
          include: { publisher: { select: { id: true, firstName: true, lastName: true, status: true } } },
          orderBy: [{ startDate: "asc" }, { publisher: { lastName: "asc" } }],
        },
      },
    }),
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const people = new Set(departments.flatMap((d) => d.holders.map((h) => h.publisherId))).size;

  return (
    <>
      <PageHeader
        title="Ministerial assignments"
        description="Each department with its overseer, assistant, servants and assignees. Ending an assignment keeps it on the person’s history."
        actions={
          can(user.role, "export:run") && (
            <a href="/api/exports/privileges" target="_blank" rel="noopener">
              <Button size="sm">Download as PDF</Button>
            </a>
          )
        }
      />

      {departments.length === 0 ? (
        <EmptyState title="No departments set up yet" description="Add the departments your congregation uses below, then assign brothers to them." />
      ) : (
        <Section
          title="Departments"
          description={`${departments.length} departments · ${people} brother${people === 1 ? "" : "s"} with at least one assignment. Hover a name to see since when.`}
        >
          <DataTable>
            <thead>
              <tr>
                <Th>Department</Th>
                {ROLES.map((r) => <Th key={r}>{r === "SERVANT" ? "Servants" : r === "ASSIGNEE" ? "Assignees" : ROLE_LABELS[r]}</Th>)}
                {canWrite && <Th align="right"></Th>}
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id} className="align-top">
                  <Td>
                    <span className="font-medium text-ink">{d.name}</span>
                    {d.description && <span className="block text-xxs text-ink-faint">{d.description}</span>}
                  </Td>
                  {ROLES.map((role) => {
                    const holders = d.holders.filter((h) => h.role === role);
                    return (
                      <Td key={role} className="text-sm">
                        {holders.length === 0 ? (
                          <span className="text-ink-faint">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {holders.map((h) => (
                              <li key={h.id} className="flex items-center gap-1.5">
                                <Link
                                  href={`/publishers/${h.publisher.id}`}
                                  title={`${h.publisher.firstName} ${h.publisher.lastName}${h.startDate ? ` · since ${formatDate(h.startDate)}` : ""}${h.notes ? ` · ${h.notes}` : ""}`}
                                  className={`hover:text-pine hover:underline ${h.publisher.status === "ACTIVE" ? "text-ink" : "text-ink-faint line-through"}`}
                                >
                                  {shortName(h.publisher)}
                                </Link>
                                {canWrite && (
                                  <form action={endAssignment}>
                                    <input type="hidden" name="id" value={h.id} />
                                    <button className="text-xxs text-ink-faint hover:text-clay" aria-label={`End ${d.name} for ${h.publisher.firstName} ${h.publisher.lastName}`} title="End this assignment">×</button>
                                  </form>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </Td>
                    );
                  })}
                  {canWrite && (
                    <Td align="right">
                      <form action={retirePrivilege}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-xxs text-ink-faint hover:text-clay" title="Remove this department from the list">Retire</button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Section>
      )}

      {canWrite && (
        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Assign a brother">
            {departments.length === 0 ? (
              <p className="text-sm text-ink-soft">Add a department first.</p>
            ) : (
              <AssignForm
                departments={departments.map((d) => ({ id: d.id, name: d.name }))}
                publishers={publishers.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}` }))}
              />
            )}
          </Section>
          <Section title="Add a department">
            <NewPrivilegeForm />
          </Section>
        </div>
      )}
    </>
  );
}
