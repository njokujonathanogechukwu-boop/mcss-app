import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { displayName } from "@/lib/format";
import { parsePersonRef, personRef } from "@/lib/school";
import { loadFamilies, loadPools } from "@/lib/school-queries";
import { prisma } from "@/lib/prisma";
import { DataTable, EmptyState, PageHeader, Section, Td, Th } from "@/components/shell";
import { Badge } from "@/components/ui";
import { SchoolTabs } from "../tabs";
import { AddMemberForm, DeleteFamilyButton, NewFamilyForm, RemoveMemberButton } from "./family-forms";

export const dynamic = "force-dynamic";

/**
 * The families of the congregation, for the student assignments: a student is
 * assisted by one of the same gender or by a member of their own family (S-38
 * par. 12), so a brother and a sister recorded here may be paired.
 */
export default async function SchoolFamiliesPage() {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");

  const [families, pools] = await Promise.all([loadFamilies(), loadPools()]);

  // Members are named from the rolls directly, so someone who has since left
  // the roll or the school still shows rather than vanishing from the family.
  const refs = families.flatMap((f) => f.members).map(parsePersonRef).filter((r) => r !== null);
  const [publishers, students] = await Promise.all([
    prisma.publisher.findMany({
      where: { id: { in: refs.filter((r) => r.kind === "publisher").map((r) => r.id) } },
      select: { id: true, firstName: true, lastName: true, gender: true },
    }),
    prisma.schoolStudent.findMany({
      where: { id: { in: refs.filter((r) => r.kind === "student").map((r) => r.id) } },
      select: { id: true, firstName: true, lastName: true, gender: true },
    }),
  ]);
  const people = new Map<string, { name: string; gender: "MALE" | "FEMALE" }>([
    ...publishers.map((p) => [personRef("publisher", p.id), { name: displayName(p), gender: p.gender }] as const),
    ...students.map((s) => [personRef("student", s.id), { name: `${displayName(s)} (student)`, gender: s.gender }] as const),
  ]);

  const inFamily = new Set(families.flatMap((f) => f.members));
  const free = pools.ministry.filter((option) => !inFamily.has(option.value));

  return (
    <>
      <PageHeader
        title="Families"
        description="A student is assisted by one of the same gender, or by a member of their own family (S-38 par. 12). A brother and a sister recorded here in the same family may handle an Apply Yourself to the Field Ministry part together."
        actions={<Badge tone="neutral">{families.length} recorded</Badge>}
      />

      <SchoolTabs />

      <Section>
        {families.length === 0 ? (
          <EmptyState
            title="No families recorded yet"
            description="Record a family below, and its brothers and sisters can be paired on a student assignment."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Family</Th>
                <Th>Members</Th>
                {canWrite && <Th align="right"></Th>}
              </tr>
            </thead>
            <tbody>
              {families.map((family) => (
                <tr key={family.id} className="align-top hover:bg-paper">
                  <Td className="font-medium">{family.name}</Td>
                  <Td>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {family.members.map((member) => {
                        const person = people.get(member);
                        const name = person?.name ?? "No longer on the roll";
                        return (
                          <li key={member} className="whitespace-nowrap">
                            {name}
                            {person && (
                              <span className="ml-1 text-xxs text-ink-faint">
                                {person.gender === "MALE" ? "brother" : "sister"}
                              </span>
                            )}
                            {canWrite && <RemoveMemberButton familyId={family.id} member={member} name={name} />}
                          </li>
                        );
                      })}
                    </ul>
                    {canWrite && <AddMemberForm familyId={family.id} people={free} />}
                  </Td>
                  {canWrite && (
                    <Td align="right">
                      <DeleteFamilyButton familyId={family.id} name={family.name} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        {canWrite && (
          <div className="mt-4">
            <NewFamilyForm people={free} />
          </div>
        )}
      </Section>

      <p className="text-xs text-ink-faint">
        A person belongs to one family. The pickers on each schedule offer a student&apos;s family members as their
        assistant whatever their gender, and the save holds the same line.
      </p>
    </>
  );
}
