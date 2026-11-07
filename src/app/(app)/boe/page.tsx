import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate, DECISION_LABELS } from "@/lib/format";
import { PageHeader, Section, EmptyState, Panel } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { DecisionForm } from "./decision-form";
import { DecisionEdit } from "./decision-edit";
import { setDecisionStatus } from "./actions";
import { assigneeRoll, assigneesOf, joinNames, loadDecisionExtras } from "@/lib/boe-extras";

export const dynamic = "force-dynamic";

const TONE: Record<string, "good" | "warn" | "neutral"> = {
  COMPLETED: "good", IN_PROGRESS: "warn", OPEN: "neutral", DEFERRED: "neutral",
};

/** The two bodies an item can come from, in the order they are listed. */
const BODIES = [
  { joint: true, title: "Joint body of elders" },
  { joint: false, title: "Congregation body of elders" },
] as const;

function GroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="mb-2 mt-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
      {title} · {count}
    </h3>
  );
}

export default async function BoePage() {
  const user = await requirePermission("boe:read");
  const canExport = can(user.role, "export:run");

  const [open, closed, roll, dated, extras] = await Promise.all([
    prisma.boeDecision.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "DEFERRED"] } },
      include: { assignedTo: true },
      orderBy: [{ targetDate: "asc" }, { meetingDate: "desc" }],
    }),
    prisma.boeDecision.findMany({
      where: { status: "COMPLETED" },
      include: { assignedTo: true },
      orderBy: { completedAt: "desc" },
      take: 50,
    }),
    assigneeRoll(),
    prisma.boeDecision.findMany({ select: { id: true, meetingDate: true }, orderBy: { meetingDate: "desc" } }),
    loadDecisionExtras(),
  ]);

  const overdue = open.filter((d) => d.targetDate && d.targetDate < new Date());
  const suggestions = roll.map((r) => r.label);
  const isJoint = (id: string) => extras[id]?.joint ?? false;
  const names = (item: { id: string; assignedTo: { firstName: string; lastName: string } | null }) =>
    joinNames(assigneesOf(item, extras));

  // Each meeting date, counted apart for the joint body and the congregation's own.
  const meetings = BODIES.map((body) => {
    const counts = new Map<string, number>();
    for (const d of dated) {
      if (isJoint(d.id) !== body.joint) continue;
      const key = d.meetingDate.toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { ...body, dates: [...counts.entries()].slice(0, 24) };
  }).filter((b) => b.dates.length);

  const openGroups = BODIES.map((b) => ({ ...b, rows: open.filter((i) => isJoint(i.id) === b.joint) })).filter((g) => g.rows.length);
  const closedGroups = BODIES.map((b) => ({ ...b, rows: closed.filter((i) => isJoint(i.id) === b.joint) })).filter((g) => g.rows.length);

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
          <div className="space-y-6">
            {openGroups.map((g) => (
              <div key={g.title}>
                <GroupHeading title={g.title} count={g.rows.length} />
                <ul className="space-y-3">
                  {g.rows.map((item) => {
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
                            Decided{" "}
                            <Link
                              href={`/boe/meetings/${item.meetingDate.toISOString().slice(0, 10)}`}
                              className="hover:text-pine hover:underline"
                            >
                              {formatDate(item.meetingDate)}
                            </Link>{" "}
                            · {names(item) || "Nobody assigned"}
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
                            <DecisionEdit
                              item={{ ...item, assignees: assigneesOf(item, extras), joint: isJoint(item.id) }}
                              suggestions={suggestions}
                            />
                          </div>
                        </Panel>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Record an item">
        <div className="max-w-2xl">
          <DecisionForm suggestions={suggestions} />
        </div>
      </Section>

      {meetings.length > 0 && (
        <Section title="Meeting summaries">
          <p className="mb-3 text-sm text-ink-soft">
            One page per meeting with every decision reached at it, to share with the body of elders.
            Open a meeting to edit its items, change its date, or add an item that was missed.
          </p>
          <div className="space-y-6">
            {meetings.map((body) => (
              <div key={body.title}>
                <GroupHeading title={body.title} count={body.dates.length} />
                <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
                  {body.dates.map(([date, count]) => (
                    <li key={date} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <Link href={`/boe/meetings/${date}`} className="text-ink hover:text-pine hover:underline">
                        {formatDate(new Date(`${date}T00:00:00.000Z`))}
                        <span className="ml-2 text-xs text-ink-faint">
                          {count} decision{count === 1 ? "" : "s"}
                        </span>
                      </Link>
                      <span className="flex items-center gap-2">
                        <Link
                          href={`/boe/meetings/${date}`}
                          className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
                        >
                          Open / edit
                        </Link>
                        {canExport && (
                          <a
                            href={`/api/exports/boe?date=${date}`}
                            className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
                          >
                            Download (PDF)
                          </a>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      {closed.length > 0 && (
        <Section title="Completed">
          <div className="space-y-6">
            {closedGroups.map((g) => (
              <div key={g.title}>
                <GroupHeading title={g.title} count={g.rows.length} />
                <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
                  {g.rows.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-ink-soft">{item.agendaItem}</span>
                        {item.decision && (
                          <span className="mt-0.5 block whitespace-pre-wrap text-xs text-ink-faint">{item.decision}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-2.5 text-xs text-ink-faint">
                        <span>
                          {names(item) ? `${names(item)} · ` : ""}
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
                      <DecisionEdit
                        item={{ ...item, assignees: assigneesOf(item, extras), joint: isJoint(item.id) }}
                        suggestions={suggestions}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
