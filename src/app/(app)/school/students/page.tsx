import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { GENDER_LABELS, displayName, formatDate } from "@/lib/format";
import { loadStudents, rollForSchool } from "@/lib/school-queries";
import { DataTable, EmptyState, PageHeader, Panel, Section, Td, Th } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import type { NameOption } from "@/components/name-picker";
import { SchoolTabs } from "../tabs";
import { StudentForm } from "../student-forms";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");

  const [students, roll] = await Promise.all([loadStudents(), rollForSchool()]);
  const conductors: NameOption[] = roll.map((p) => ({ value: p.id, label: displayName(p) }));
  const onRoll = students.filter((s) => s.active);
  const offRoll = students.filter((s) => !s.active);

  return (
    <>
      <PageHeader
        title="Students of the school"
        description="Those enrolled in the Life and Ministry Meeting School who are not publishing yet. Enrollment is settled with the conductor of their Bible study, or a believing parent, present (S-38 par. 1)."
        actions={
          <Link href="/school/publishers">
            <Button variant="secondary" size="sm">Publisher list</Button>
          </Link>
        }
      />

      <SchoolTabs />

      {canWrite && (
        <Section title="Enrol a student" description="Only what the overseer needs to plan their parts: a name, whether they are a brother or sister, and who conducts their study.">
          <Panel className="max-w-3xl p-5">
            <StudentForm conductors={conductors} />
          </Panel>
        </Section>
      )}

      <Section title={`On the roll — ${onRoll.length}`}>
        {onRoll.length === 0 ? (
          <EmptyState
            title="No students yet"
            description="Enrol the first one above. A student stays on this roll until they are baptised and start publishing, when the secretary's list takes over."
          />
        ) : (
          <StudentTable students={onRoll} />
        )}
      </Section>

      {offRoll.length > 0 && (
        <Section
          title={`Off the roll — ${offRoll.length}`}
          description="Kept because the schedules they handled are part of the school's history."
        >
          <StudentTable students={offRoll} />
        </Section>
      )}
    </>
  );
}

type StudentRow = Awaited<ReturnType<typeof loadStudents>>[number];

function StudentTable({ students }: { students: StudentRow[] }) {
  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Name</Th>
          <Th>Brother or sister</Th>
          <Th>Bible study conductor</Th>
          <Th>Enrolled</Th>
          <Th align="right">Parts handled</Th>
          <Th align="right"></Th>
        </tr>
      </thead>
      <tbody>
        {students.map((student) => (
          <tr key={student.id} className="hover:bg-paper">
            <Td>
              <Link
                href={`/school/students/${student.id}`}
                className="font-medium hover:text-pine hover:underline"
              >
                {displayName(student)}
              </Link>
              {student.publisher && (
                <span className="ml-2"><Badge tone="good">now a publisher</Badge></span>
              )}
              {student.dateOfBirth && (
                <span className="block text-xs text-ink-faint">born {formatDate(student.dateOfBirth)}</span>
              )}
            </Td>
            <Td className="text-ink-soft">{GENDER_LABELS[student.gender] ?? student.gender}</Td>
            <Td className="text-ink-soft">
              {student.conductor ? displayName(student.conductor) : "—"}
            </Td>
            <Td className="text-ink-soft">{formatDate(student.enrolledAt)}</Td>
            <Td align="right">{student._count.assignments}</Td>
            <Td align="right">
              <Link href={`/school/students/${student.id}`}>
                <Button variant="ghost" size="sm">Open</Button>
              </Link>
            </Td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
