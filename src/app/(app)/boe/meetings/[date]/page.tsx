import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate, DECISION_LABELS } from "@/lib/format";
import { PageHeader, Section, EmptyState, Panel } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { DecisionEdit } from "../../decision-edit";
import { DecisionForm } from "../../decision-form";
import { MeetingDetails } from "../../meeting-details";
import { assigneeRoll, assigneesOf, joinNames, loadDecisionExtras } from "@/lib/boe-extras";

export const dynamic = "force-dynamic";

const TONE: Record<string, "good" | "warn" | "neutral"> = {
  COMPLETED: "good", IN_PROGRESS: "warn", OPEN: "neutral", DEFERRED: "neutral",
};

/**
 * One meeting's summary, to be put right: every item recorded at it, each
 * editable, the date and kind of meeting for all of them at once, and room to
 * add an item that was missed. Items of the joint body and of this
 * congregation's own body are listed apart, as the summary prints them.
 */
export default async function MeetingPage({ params }: { params: Promise<{ date: string }> }) {
  const user = await requirePermission("boe:read");
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) notFound();
  const canWrite = can(user.role, "boe:write");

  const [items, extras, roll, dates] = await Promise.all([
    prisma.boeDecision.findMany({
      where: { meetingDate: new Date(`${date}T00:00:00.000Z`) },
      include: { assignedTo: true },
      orderBy: { createdAt: "asc" },
    }),
    loadDecisionExtras(),
    assigneeRoll(),
    prisma.boeDecision.groupBy({ by: ["meetingDate"], orderBy: { meetingDate: "desc" } }),
  ]);

  const suggestions = roll.map((r) => r.label);
  const joint = items.filter((i) => extras[i.id]?.joint);
  const own = items.filter((i) => !extras[i.id]?.joint);
  const kind = joint.length && own.length ? "MIXED" : joint.length ? "JOINT" : "BOE";

  // Newer meetings come first in the list, so "previous" is the next one down.
  const all = dates.map((d) => d.meetingDate.toISOString().slice(0, 10));
  const at = all.indexOf(date);
  const link = (d: string | undefined) => (d ? { href: `/boe/meetings/${d}`, label: formatDate(new Date(`${d}T00:00:00.000Z`)) } : null);
  const nav = at >= 0 ? { prev: link(all[at + 1]), next: link(all[at - 1]) } : undefined;

  const groups = [
    { title: "Joint body of elders", rows: joint },
    { title: "Congregation body of elders", rows: own },
  ].filter((g) => g.rows.length);

  return (
    <>
      <PageHeader
        title={`Meeting of ${formatDate(new Date(`${date}T00:00:00.000Z`))}`}
        description={`${items.length} item${items.length === 1 ? "" : "s"} recorded. Changes here show in the summary straight away.`}
        back={{ href: "/boe", label: "Items from the body of elders" }}
        nav={nav}
        actions={
          items.length > 0 && can(user.role, "export:run") ? (
            <a href={`/api/exports/boe?date=${date}`}>
              <Button variant="secondary" size="sm">Download (PDF)</Button>
            </a>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Nothing is recorded for this date"
          description="The items may have been moved to another date or deleted."
        />
      ) : (
        <>
          {canWrite && (
            <Section title="Meeting details">
              <MeetingDetails date={date} kind={kind} />
            </Section>
          )}

          {groups.map((g) => (
            <Section key={g.title} title={`${g.title} · ${g.rows.length}`}>
              <ol className="space-y-3">
                {g.rows.map((item, n) => (
                  <li key={item.id}>
                    <Panel className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {n + 1}. {item.agendaItem}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{item.decision}</p>
                        </div>
                        <Badge tone={TONE[item.status]}>{DECISION_LABELS[item.status]}</Badge>
                      </div>
                      <p className="mt-2.5 text-xs text-ink-faint">
                        {joinNames(assigneesOf(item, extras)) || "Nobody assigned"}
                        {item.targetDate ? ` · due ${formatDate(item.targetDate)}` : ""}
                        {item.completedAt ? ` · completed ${formatDate(item.completedAt)}` : ""}
                      </p>
                      {item.notes && <p className="mt-1 text-xs text-ink-soft">{item.notes}</p>}
                      {canWrite && (
                        <div className="mt-3 border-t border-rule pt-3">
                          <DecisionEdit
                            item={{ ...item, assignees: assigneesOf(item, extras), joint: extras[item.id]?.joint ?? false }}
                            suggestions={suggestions}
                          />
                        </div>
                      )}
                    </Panel>
                  </li>
                ))}
              </ol>
            </Section>
          ))}
        </>
      )}

      {canWrite && (
        <Section title="Add an item to this meeting">
          <div className="max-w-2xl">
            <DecisionForm suggestions={suggestions} meeting={{ date, joint: kind === "JOINT" }} />
          </div>
        </Section>
      )}

      <p className="text-sm">
        <Link href="/boe" className="text-pine hover:underline">← Back to all items</Link>
      </p>
    </>
  );
}
