import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatDate, DECISION_LABELS } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/shell";
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

/** How many meetings of each body show before the rest are folded away. */
const RECENT_MEETINGS = 6;

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Folds sit inside folds, so each arrow turns with its own fold only.
const TURN = {
  fold: "group-open/fold:rotate-90",
  row: "group-open/row:rotate-90",
  older: "group-open/older:rotate-90",
} as const;

function Chevron({ of }: { of: keyof typeof TURN }) {
  return (
    <span aria-hidden className={`inline-block text-ink-faint transition-transform ${TURN[of]}`}>
      ▸
    </span>
  );
}

/** A section of the page that opens and closes, its count beside the title. */
function Fold({
  title, count, open = false, children,
}: {
  title: string; count?: number; open?: boolean; children: ReactNode;
}) {
  return (
    <details open={open} className="group/fold mb-6 rounded border border-rule bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <Chevron of="fold" />
        <h2 className="font-serif text-base text-ink">{title}</h2>
        {count !== undefined && <span className="text-xs text-ink-faint">{count}</span>}
      </summary>
      <div className="border-t border-rule px-4 py-4">{children}</div>
    </details>
  );
}

function GroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-soft">
      {title} · {count}
    </h3>
  );
}

type Row = {
  id: string;
  agendaItem: string;
  decision: string;
  notes: string | null;
  status: string;
  meetingDate: Date;
  targetDate: Date | null;
  completedAt: Date | null;
  assignedTo: { firstName: string; lastName: string } | null;
};

const COLS = "sm:grid sm:grid-cols-[1rem_minmax(0,2.4fr)_6.5rem_minmax(0,1.5fr)_6.5rem_6.5rem] sm:items-center sm:gap-3";

/**
 * Items as a table: one line each with the item, its meeting, who carries it,
 * the date that matters and its status. A line opens to show what was decided
 * and the buttons for it.
 */
function ItemTable({
  rows, done, names, actions,
}: {
  rows: Row[];
  done: boolean;
  names: (row: Row) => string;
  actions: (row: Row) => ReactNode;
}) {
  const now = new Date();
  return (
    <div className="overflow-hidden rounded border border-rule text-sm">
      <div className={`hidden bg-paper px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint ${COLS}`}>
        <span />
        <span>Item</span>
        <span>Meeting</span>
        <span>Assigned to</span>
        <span>{done ? "Completed" : "Due"}</span>
        <span>Status</span>
      </div>
      <ul className="divide-y divide-rule">
        {rows.map((row) => {
          const overdue = !done && row.targetDate && row.targetDate < now;
          const when = done ? row.completedAt : row.targetDate;
          return (
            <li key={row.id}>
              <details className="group/row">
                <summary
                  className={`cursor-pointer list-none px-3 py-2.5 hover:bg-paper/70 [&::-webkit-details-marker]:hidden ${COLS} ${
                    overdue ? "bg-clay-light/40" : ""
                  }`}
                >
                  <span className="hidden sm:inline"><Chevron of="row" /></span>
                  <span className="block truncate font-medium text-ink">{row.agendaItem}</span>
                  <span className="text-xs text-ink-soft">{formatDate(row.meetingDate)}</span>
                  <span className="block truncate text-xs text-ink-soft">{names(row) || "Nobody assigned"}</span>
                  <span className={`text-xs ${overdue ? "font-medium text-clay" : "text-ink-soft"}`}>
                    {when ? formatDate(when) : "—"}
                  </span>
                  <span className="mt-1 flex gap-1 sm:mt-0">
                    {overdue && <Badge tone="bad">Overdue</Badge>}
                    {!overdue && <Badge tone={TONE[row.status]}>{DECISION_LABELS[row.status]}</Badge>}
                  </span>
                </summary>
                <div className="border-t border-rule bg-paper/50 px-4 py-3 sm:pl-10">
                  <p className="whitespace-pre-wrap text-sm text-ink-soft">{row.decision}</p>
                  {row.notes && <p className="mt-1 text-xs text-ink-faint">Notes: {row.notes}</p>}
                  <p className="mt-1 text-xs text-ink-faint">
                    <Link href={`/boe/meetings/${iso(row.meetingDate)}`} className="hover:text-pine hover:underline">
                      Open the meeting of {formatDate(row.meetingDate)}
                    </Link>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">{actions(row)}</div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const smallButton =
  "rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine";

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
  const names = (row: Row) => joinNames(assigneesOf(row, extras));
  const edit = (row: Row) => (
    <DecisionEdit
      item={{ ...row, assignees: assigneesOf(row, extras), joint: isJoint(row.id) }}
      suggestions={suggestions}
    />
  );

  // Each meeting date, counted apart for the joint body and the congregation's own.
  const meetings = BODIES.map((body) => {
    const counts = new Map<string, number>();
    for (const d of dated) {
      if (isJoint(d.id) !== body.joint) continue;
      const key = iso(d.meetingDate);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { ...body, dates: [...counts.entries()] };
  }).filter((b) => b.dates.length);
  const meetingCount = new Set(dated.map((d) => iso(d.meetingDate))).size;

  const openGroups = BODIES.map((b) => ({ ...b, rows: open.filter((i) => isJoint(i.id) === b.joint) })).filter((g) => g.rows.length);
  const closedGroups = BODIES.map((b) => ({ ...b, rows: closed.filter((i) => isJoint(i.id) === b.joint) })).filter((g) => g.rows.length);

  const meetingRows = (dates: [string, number][]) => (
    <ul className="divide-y divide-rule">
      {dates.map(([date, count]) => (
        <li key={date} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <Link href={`/boe/meetings/${date}`} className="text-ink hover:text-pine hover:underline">
            {formatDate(new Date(`${date}T00:00:00.000Z`))}
            <span className="ml-2 text-xs text-ink-faint">
              {count} decision{count === 1 ? "" : "s"}
            </span>
          </Link>
          <span className="flex items-center gap-2">
            <Link href={`/boe/meetings/${date}`} className={smallButton}>Open / edit</Link>
            {canExport && (
              <a href={`/api/exports/boe?date=${date}`} className={smallButton}>PDF</a>
            )}
          </span>
        </li>
      ))}
    </ul>
  );

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
        <div className="mb-6 rounded border border-clay/30 bg-clay-light px-4 py-3 text-sm text-clay">
          {overdue.length} item{overdue.length === 1 ? " is" : "s are"} past the target date.
        </div>
      )}

      <Fold title="Outstanding" count={open.length} open>
        {open.length === 0 ? (
          <EmptyState title="Nothing outstanding" description="Items recorded will be tracked here until they are done." />
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-ink-faint">Click a line to see what was decided and to update it.</p>
            {openGroups.map((g) => (
              <div key={g.title}>
                <GroupHeading title={g.title} count={g.rows.length} />
                <ItemTable
                  rows={g.rows}
                  done={false}
                  names={names}
                  actions={(row) => (
                    <>
                      <form action={setDecisionStatus}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="status" value="COMPLETED" />
                        <button className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pine-dark">
                          Mark complete
                        </button>
                      </form>
                      {(["IN_PROGRESS", "DEFERRED"] as const)
                        .filter((s) => s !== row.status)
                        .map((s) => (
                          <form key={s} action={setDecisionStatus}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="status" value={s} />
                            <button className={smallButton}>{DECISION_LABELS[s]}</button>
                          </form>
                        ))}
                      {edit(row)}
                    </>
                  )}
                />
              </div>
            ))}
          </div>
        )}
      </Fold>

      <Fold title="Record an item">
        <div className="max-w-2xl">
          <DecisionForm suggestions={suggestions} />
        </div>
      </Fold>

      {meetings.length > 0 && (
        <Fold title="Meeting summaries" count={meetingCount}>
          <p className="mb-4 text-xs text-ink-faint">
            One page per meeting with every decision reached at it. Open a meeting to edit its items,
            change its date, or add an item that was missed.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            {meetings.map((body) => (
              <div key={body.title}>
                <GroupHeading title={body.title} count={body.dates.length} />
                <div className="overflow-hidden rounded border border-rule text-sm">
                  {meetingRows(body.dates.slice(0, RECENT_MEETINGS))}
                  {body.dates.length > RECENT_MEETINGS && (
                    <details className="group/older border-t border-rule">
                      <summary className="flex cursor-pointer list-none items-center gap-2 bg-paper px-3 py-2 text-xs text-ink-soft hover:text-pine [&::-webkit-details-marker]:hidden">
                        <Chevron of="older" /> {body.dates.length - RECENT_MEETINGS} older meeting
                        {body.dates.length - RECENT_MEETINGS === 1 ? "" : "s"}
                      </summary>
                      <div className="border-t border-rule">{meetingRows(body.dates.slice(RECENT_MEETINGS))}</div>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Fold>
      )}

      {closed.length > 0 && (
        <Fold title="Completed" count={closed.length}>
          <div className="space-y-5">
            <p className="text-xs text-ink-faint">The 50 most recently completed. Click a line to edit, reopen or delete it.</p>
            {closedGroups.map((g) => (
              <div key={g.title}>
                <GroupHeading title={g.title} count={g.rows.length} />
                <ItemTable
                  rows={g.rows}
                  done
                  names={names}
                  actions={(row) => (
                    <>
                      <form action={setDecisionStatus}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="status" value="OPEN" />
                        <button className={smallButton}>Reopen</button>
                      </form>
                      {edit(row)}
                    </>
                  )}
                />
              </div>
            ))}
          </div>
        </Fold>
      )}
    </>
  );
}
