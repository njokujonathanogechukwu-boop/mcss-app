import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { displayName, formatDate, TASK_LABELS, ANNOUNCEMENT_LABELS } from "@/lib/format";
import { PageHeader, Section, EmptyState, Panel } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { TaskForm } from "./task-form";
import { setTaskStatus, deleteTask, markAnnounced, deleteAnnouncement } from "./actions";

export const dynamic = "force-dynamic";

const TASK_TONE: Record<string, "good" | "warn" | "neutral"> = {
  DONE: "good", IN_PROGRESS: "warn", OPEN: "neutral",
};

export default async function TasksPage() {
  const user = await requirePermission("task:read");
  const canWriteTask = can(user.role, "task:write");
  const canWriteAnn = can(user.role, "announcement:write");
  const canApprove = can(user.role, "announcement:approve");
  const canMail = can(user.role, "mail:send");

  const [openTasks, doneTasks, people, drafts, ready, announced] = await Promise.all([
    prisma.task.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      include: { assignee: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.task.findMany({
      where: { status: "DONE" },
      include: { assignee: true },
      orderBy: { completedAt: "desc" },
      take: 10,
    }),
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.announcement.findMany({ where: { status: "DRAFT" }, orderBy: { updatedAt: "desc" } }),
    prisma.announcement.findMany({
      where: { status: "APPROVED" },
      orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.announcement.findMany({
      where: { status: "ANNOUNCED" },
      orderBy: { announcedAt: "desc" },
      take: 10,
    }),
  ]);

  const peopleOptions = people.map((p) => ({ value: p.id, label: displayName(p) }));
  const now = new Date();
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < now);

  return (
    <>
      <PageHeader
        title="Tasks & announcements"
        description="Track congregation activities and prepare announcements. Announcements you finalise here are ready to be read at the meeting."
        actions={
          canWriteAnn ? (
            <Link href="/tasks/announcements/new">
              <Button size="sm">New announcement</Button>
            </Link>
          ) : undefined
        }
      />

      {/* ------------------------------------------------------- announcements */}
      <Section
        title={`Ready to announce${ready.length ? ` · ${ready.length}` : ""}`}
        description="Finalised announcements, soonest first."
      >
        {ready.length === 0 ? (
          <EmptyState
            title="Nothing ready to announce"
            description="Compose an announcement and approve it, and it will wait here until it is read."
            action={canWriteAnn ? <Link href="/tasks/announcements/new"><Button variant="secondary">New announcement</Button></Link> : undefined}
          />
        ) : (
          <ul className="space-y-3">
            {ready.map((a) => (
              <li key={a.id}>
                <Panel className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{a.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{a.body}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {a.aiDrafted && <Badge tone="warn">AI draft</Badge>}
                      <Badge tone="good">{ANNOUNCEMENT_LABELS[a.status]}</Badge>
                    </div>
                  </div>
                  <p className="mt-2.5 text-xs text-ink-faint">
                    {a.eventDate ? `For ${formatDate(a.eventDate)}` : "No date set"}
                    {a.approvedAt ? ` · approved ${formatDate(a.approvedAt)}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                    {canApprove && (
                      <form action={markAnnounced}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pine-dark">
                          Mark announced
                        </button>
                      </form>
                    )}
                    {canMail && (
                      <Link
                        href={`/mail?announcement=${a.id}`}
                        className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
                      >
                        Email it
                      </Link>
                    )}
                    {canWriteAnn && (
                      <>
                        <Link href={`/tasks/announcements/${a.id}/edit`}>
                          <button className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine">
                            Edit
                          </button>
                        </Link>
                        <form action={deleteAnnouncement}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="rounded border border-clay/40 px-2 py-1 text-xs text-clay hover:bg-clay hover:text-white">
                            Delete
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {drafts.length > 0 && (
        <Section title={`Drafts${drafts.length ? ` · ${drafts.length}` : ""}`} description="Still being written. Open one to finish and approve it.">
          <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
            {drafts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-ink">
                  {a.title}
                  {a.eventDate ? <span className="ml-2 text-xs text-ink-faint">for {formatDate(a.eventDate)}</span> : null}
                  {a.aiDrafted ? <span className="ml-2 text-xs text-[#7A5E1E]">AI draft</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  {canWriteAnn && (
                    <>
                      <Link href={`/tasks/announcements/${a.id}/edit`} className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine">
                        Open
                      </Link>
                      <form action={deleteAnnouncement}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="rounded border border-clay/40 px-2 py-1 text-xs text-clay hover:bg-clay hover:text-white">
                          Delete
                        </button>
                      </form>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* -------------------------------------------------------------- tasks */}
      {overdue.length > 0 && (
        <div className="mb-7 rounded border border-clay/30 bg-clay-light px-4 py-3 text-sm text-clay">
          {overdue.length} task{overdue.length === 1 ? " is" : "s are"} past the due date.
        </div>
      )}

      <Section title={`Activities to do${openTasks.length ? ` · ${openTasks.length}` : ""}`}>
        {openTasks.length === 0 ? (
          <EmptyState title="Nothing on the list" description="Add an activity below and it will be tracked here until it is done." />
        ) : (
          <ul className="space-y-3">
            {openTasks.map((t) => {
              const isOverdue = t.dueDate && t.dueDate < now;
              return (
                <li key={t.id}>
                  <Panel className={`p-4 ${isOverdue ? "border-clay/30" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{t.title}</p>
                        {t.detail && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{t.detail}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        {isOverdue && <Badge tone="bad">Overdue</Badge>}
                        <Badge tone={TASK_TONE[t.status]}>{TASK_LABELS[t.status]}</Badge>
                      </div>
                    </div>
                    <p className="mt-2.5 text-xs text-ink-faint">
                      {t.assignee ? displayName(t.assignee) : "Nobody assigned"}
                      {t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}
                    </p>
                    {canWriteTask && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                        <form action={setTaskStatus}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="status" value="DONE" />
                          <button className="rounded bg-pine px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pine-dark">
                            Mark done
                          </button>
                        </form>
                        {(["OPEN", "IN_PROGRESS"] as const)
                          .filter((s) => s !== t.status)
                          .map((s) => (
                            <form key={s} action={setTaskStatus}>
                              <input type="hidden" name="id" value={t.id} />
                              <input type="hidden" name="status" value={s} />
                              <button className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine">
                                {TASK_LABELS[s]}
                              </button>
                            </form>
                          ))}
                        <form action={deleteTask}>
                          <input type="hidden" name="id" value={t.id} />
                          <button className="rounded border border-clay/40 px-2 py-1 text-xs text-clay hover:bg-clay hover:text-white">
                            Delete
                          </button>
                        </form>
                      </div>
                    )}
                  </Panel>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {canWriteTask && (
        <Section title="Add an activity">
          <div className="max-w-2xl">
            <TaskForm people={peopleOptions} />
          </div>
        </Section>
      )}

      {doneTasks.length > 0 && (
        <Section title="Done">
          <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
            {doneTasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-ink-soft">
                  {t.title}
                  <span className="ml-2 text-xs text-ink-faint">
                    {t.assignee ? `${displayName(t.assignee)} · ` : ""}
                    {formatDate(t.completedAt)}
                  </span>
                </span>
                {canWriteTask && (
                  <form action={setTaskStatus}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value="OPEN" />
                    <button className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine">
                      Reopen
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {announced.length > 0 && (
        <Section title="Recently announced">
          <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
            {announced.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-ink-soft">{a.title}</span>
                <span className="text-xs text-ink-faint">{formatDate(a.announcedAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
