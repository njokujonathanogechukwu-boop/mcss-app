import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { GENDER_LABELS, displayName, formatDate, toDateInput } from "@/lib/format";
import { SECTION_LABELS, SLOT_LABELS, formatWeekOf } from "@/lib/school";
import { loadStudent, rollForSchool } from "@/lib/school-queries";
import type { NameOption } from "@/components/name-picker";
import { DataTable, EmptyState, PageHeader, Panel, Section, Td, Th } from "@/components/shell";
import { Badge } from "@/components/ui";
import { SchoolTabs } from "../../tabs";
import { LinkPublisherForm, StudentActiveForm, StudentForm } from "../../student-forms";

export const dynamic = "force-dynamic";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");
  const { id } = await params;

  const student = await loadStudent(id);
  if (!student) notFound();

  const roll = await rollForSchool();
  const people: NameOption[] = roll.map((p) => ({ value: p.id, label: displayName(p) }));

  return (
    <>
      <PageHeader
        back={{ href: "/school/students", label: "Students of the school" }}
        title={displayName(student)}
        description={`Enrolled ${formatDate(student.enrolledAt)}${student.conductor ? ` · Bible study conducted by ${displayName(student.conductor)}` : ""}`}
        actions={
          <>
            {student.active ? <Badge tone="good">On the roll</Badge> : <Badge tone="quiet">Off the roll</Badge>}
            {student.publisher && <Badge tone="neutral">Now a publisher</Badge>}
          </>
        }
      />

      <SchoolTabs />

      <Section title="Every part they have handled" description="Newest first. A student is not given the same kind of part week after week without reason, and this is where that shows.">
        {student.assignments.length === 0 ? (
          <EmptyState
            title="No assignments yet"
            description="Parts given to this student on a midweek schedule are listed here."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Meeting</Th>
                <Th>Schedule</Th>
                <Th>Part</Th>
                <Th>Handled as</Th>
              </tr>
            </thead>
            <tbody>
              {student.assignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-paper">
                  <Td>
                    <Link
                      href={`/school/weeks/${assignment.part.week.id}`}
                      className="font-medium hover:text-pine hover:underline"
                    >
                      {formatWeekOf(assignment.part.week.weekOf)}
                    </Link>
                  </Td>
                  <Td className="text-ink-soft">{assignment.part.week.period.label}</Td>
                  <Td>
                    {assignment.part.position}. {assignment.part.title}
                    <span className="block text-xs text-ink-faint">
                      {SECTION_LABELS[assignment.part.section]}
                    </span>
                  </Td>
                  <Td className="text-ink-soft">{SLOT_LABELS[assignment.slot]}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>

      <Section title="Details">
        <Panel className="max-w-2xl p-4 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Detail label="Brother or sister" value={GENDER_LABELS[student.gender] ?? student.gender} />
            <Detail label="Date of birth" value={student.dateOfBirth ? formatDate(student.dateOfBirth) : null} />
            <Detail label="Phone" value={student.phone} />
            <Detail label="Guardian" value={student.guardianName} />
            <Detail label="Guardian's phone" value={student.guardianPhone} />
            <Detail label="Conductor" value={student.conductor ? displayName(student.conductor) : null} />
          </dl>
          {student.notes && <p className="mt-3 border-t border-rule pt-3 text-ink-soft">{student.notes}</p>}
        </Panel>
      </Section>

      {canWrite && (
        <>
          <Section title="Edit" description="Changes are recorded in the audit trail against your account.">
            <Panel className="max-w-3xl p-5">
              <StudentForm
                conductors={people}
                student={{
                  id: student.id,
                  firstName: student.firstName,
                  lastName: student.lastName,
                  gender: student.gender,
                  dateOfBirth: toDateInput(student.dateOfBirth),
                  phone: student.phone ?? "",
                  guardianName: student.guardianName ?? "",
                  guardianPhone: student.guardianPhone ?? "",
                  conductorId: student.conductorId ?? "",
                  enrolledAt: toDateInput(student.enrolledAt),
                  notes: student.notes ?? "",
                }}
              />
            </Panel>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="If they become a publisher">
              <LinkPublisherForm
                id={student.id}
                publishers={people}
                current={student.publisherId ?? ""}
              />
            </Section>

            <Section title="Leaving the school">
              <Panel className="p-4">
                <p className="mb-3 text-sm text-ink-soft">
                  Taking a student off the roll keeps their record and every schedule they handled.
                  Nothing is deleted, so an old schedule still prints with their name on it.
                </p>
                <StudentActiveForm
                  id={student.id}
                  name={displayName(student)}
                  active={student.active}
                />
              </Panel>
            </Section>
          </div>
        </>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{value || "—"}</dd>
    </div>
  );
}
