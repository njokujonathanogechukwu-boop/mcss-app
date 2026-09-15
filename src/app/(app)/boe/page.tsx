import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { displayName, formatDate, DECISION_LABELS } from "@/lib/format";
import { PageHeader, Section, EmptyState, Panel } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { DecisionForm } from "./decision-form";
import { DecisionEdit } from "./decision-edit";
import { setDecisionStatus } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<string, "good" | "warn" | "neutral"> = {
  COMPLETED: "good", IN_PROGRESS: "warn", OPEN: "neutral", DEFERRED: "neutral",
};

export default async function BoePage() {
  await requirePermission("boe:read");

  const [open, closed, elders, meetings] = await Promise.all([
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
    prisma.boeDecision.groupBy({
      by: ["meetingDate"],
      _count: { _all: true },
      orderBy: { meetingDate: "desc" },
      take: 24,
    }),
  ]);

  const overdue = open.filter((d) => d.targetDate && d.targetDate < new Date());
  const elderOptions = elders.map((e) => ({ id: e.id, label: displayName(e) }));

  return (
    <>
      <PageHeader
        title="Items from the body of elders"
        description="Decisions, who is carrying them out, and when they are due. Reproofs, removals, reinstatements and restrictions are kept apart under Publisher standing and never appear in these meeting summaries."
        actions={
          <Link href="/boe/standing">
            <Button variant="secondary" size="sm">Publisher standing</Button>
          </Link>
        }
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
                      <form action={setDecisionStatus}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="status" value="COMPLETED" />
                        <button className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pine-dark">
                          Mark complete
                        </button>
                      </form>
                      {(["IN_PROGRESS", "DEFERRED"] as const)
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
                      <DecisionEdit item={item} elders={elderOptions} />
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
          <DecisionForm elders={elderOptions} />
        </div>
      </Section>

      {meetings.length > 0 && (
        <Section title="Meeting summaries">
          <p className="mb-3 text-sm text-ink-soft">
            One page per meeting with every decision reached at it, to share with the body of elders.
          </p>
          <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
            {meetings.map((m) => (
              <li key={m.meetingDate.toISOString()} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-ink">
                  {formatDate(m.meetingDate)}
                  <span className="ml-2 text-xs text-ink-faint">
                    {m._count._all} decision{m._count._all === 1 ? "" : "s"}
                  </span>
                </span>
                <a
                  href={`/api/exports/boe?date=${m.meetingDate.toISOString().slice(0, 10)}`}
                  className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
                >
                  Download (PDF)
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {closed.length > 0 && (
        <Section title="Completed">
          <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
            {closed.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-ink-soft">{item.agendaItem}</span>
                <span className="flex items-center gap-2.5 text-xs text-ink-faint">
                  <span>
                    {item.assignedTo ? `${displayName(item.assignedTo)} · ` : ""}
                    {formatDate(item.completedAt)}
                  </span>
                  <form action={setDecisionStatus}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="status" value="OPEN" />
                    <button className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine">
                      Reopen
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
