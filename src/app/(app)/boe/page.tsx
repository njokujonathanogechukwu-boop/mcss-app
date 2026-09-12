import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { displayName, formatDate, DECISION_LABELS } from "@/lib/format";
import { PageHeader, Section, EmptyState, Panel } from "@/components/shell";
import { Badge } from "@/components/ui";
import { DecisionForm } from "./decision-form";
import { setDecisionStatus } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, "good" | "warn" | "neutral"> = {
  COMPLETED: "good", IN_PROGRESS: "warn", OPEN: "neutral", DEFERRED: "neutral",
};

export default async function BoePage() {
  await requirePermission("boe:read");

  const [open, closed, elders] = await Promise.all([
    prisma.boeDecision.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "DEFERRED"] } },
      include: { assignedTo: true },
      orderBy: [{ targetDate: "asc" }, { meetingDate: "desc" }],
    }),
    prisma.boeDecision.findMany({
      where: { status: "COMPLETED" },
      include: { assignedTo: true },
      orderBy: { completedAt: "desc" },
      take: 15,
    }),
    prisma.publisher.findMany({
      where: { appointment: "ELDER", status: "ACTIVE" },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const overdue = open.filter((d) => d.targetDate && d.targetDate < new Date());

  return (
    <>
      <PageHeader
        title="Items from the body of elders"
        description="Decisions, who is carrying them out, and when they are due. Confidential judicial matters do not belong here."
      />

      {overdue.length > 0 && (
        <div className="mb-7 rounded border border-clay/30 bg-clay-light px-4 py-3 text-sm text-clay">
          {overdue.length} item{overdue.length === 1 ? " is" : "s are"} past the target date.
        </div>
      )}

      <Section title={`Outstanding${open.length ? ` · ${open.length}` : ""}`}>
        {open.length === 0 ? (
          <EmptyState title="Nothing outstanding" description="Items recorded below will be tracked here until they are done." />
        ) : (
          <ul className="space-y-3">
            {open.map((item) => {
              const isOverdue = item.targetDate && item.targetDate < new Date();
              return (
                <li key={item.id}>
                  <Panel className={`p-4 ${isOverdue ? "border-clay/30" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{item.agendaItem}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{item.decision}</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {isOverdue && <Badge tone="bad">Overdue</Badge>}
                        <Badge tone={TONE[item.status]}>{DECISION_LABELS[item.status]}</Badge>
                      </div>
                    </div>

                    <p className="mt-2.5 text-xs text-ink-faint">
                      Decided {formatDate(item.meetingDate)} ·{" "}
                      {item.assignedTo ? displayName(item.assignedTo) : "Nobody assigned"}
                      {item.targetDate ? ` · due ${formatDate(item.targetDate)}` : ""}
                    </p>
                    {item.notes && <p className="mt-1 text-xs text-ink-soft">{item.notes}</p>}

                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                      <span className="text-xs text-ink-faint">Move to</span>
                      {(["IN_PROGRESS", "COMPLETED", "DEFERRED"] as const)
                        .filter((s) => s !== item.status)
                        .map((s) => (
                          <form key={s} action={setDecisionStatus}>
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="status" value={s} />
                            <button className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine">
                              {DECISION_LABELS[s]}
                            </button>
                          </form>
                        ))}
                    </div>
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Record an item">
        <div className="max-w-2xl">
          <DecisionForm elders={elders.map((e) => ({ id: e.id, label: displayName(e) }))} />
        </div>
      </Section>

      {closed.length > 0 && (
        <Section title="Completed">
          <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
            {closed.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-ink-soft">{item.agendaItem}</span>
                <span className="text-xs text-ink-faint">
                  {item.assignedTo ? `${displayName(item.assignedTo)} · ` : ""}
                  {formatDate(item.completedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
