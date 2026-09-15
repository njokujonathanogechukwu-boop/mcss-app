import Link from "next/link";
import type { PublisherStatus, StandingRecord } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  displayName, formatDate, toDateInput, STATUS_LABELS, STANDING_LABELS, STATUS_TONE, STANDING_TONE,
} from "@/lib/format";
import { PageHeader, Section, EmptyState } from "@/components/shell";
import { Badge } from "@/components/ui";
import { envelopeIndication } from "@/lib/standing-case";
import { CaseFile, EnvelopeIndication, type CaseDocument } from "./case-file";
import {
  StandingForm, AddRestrictionForm, LiftForm, CorrectForm, DeleteRecordButton,
} from "./standing-forms";

export const dynamic = "force-dynamic";

type Person = { id: string; firstName: string; lastName: string; status: PublisherStatus };
type Entry = StandingRecord & { publisher: Person; documents: CaseDocument[] };
type Parent = Entry & { restrictions: Entry[] };

/** One restriction, whether it hangs off an entry or stands on its own. */
function RestrictionRow({ r, canWrite, today }: { r: Entry; canWrite: boolean; today: string }) {
  return (
    <li className="mt-2 border-l-2 border-rule-strong pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STANDING_TONE.RESTRICTION}>{STANDING_LABELS.RESTRICTION}</Badge>
        <span className="text-xs text-ink-soft">placed {formatDate(r.eventDate)}</span>
        <span className={`text-xs ${r.liftedDate ? "text-pine-dark" : "text-clay"}`}>
          {r.liftedDate ? `lifted ${formatDate(r.liftedDate)}` : "still running"}
        </span>
        {canWrite && (
          <span className="ml-auto">
            <DeleteRecordButton id={r.id} />
          </span>
        )}
      </div>
      {r.notes && <p className="mt-1 text-xs text-ink">{r.notes}</p>}
      {canWrite && !r.liftedDate && <LiftForm id={r.id} today={today} />}
      <CaseFile recordId={r.id} documents={r.documents} canWrite={canWrite} />
      {canWrite && (
        <CorrectForm
          id={r.id}
          publisherId={r.publisherId}
          kind={r.kind}
          eventDate={toDateInput(r.eventDate)}
          announcedDate={toDateInput(r.announcedDate)}
          notes={r.notes ?? ""}
        />
      )}
    </li>
  );
}

export default async function StandingPage() {
  const user = await requirePermission("standing:read");
  const today = toDateInput(new Date());
  const canWrite = can(user.role, "standing:write");

  const [records, publishers] = await Promise.all([
    prisma.standingRecord.findMany({
      // Restrictions recorded under an entry are read with that entry, not as
      // loose events of their own.
      where: { parentId: null },
      include: {
        publisher: { select: { id: true, firstName: true, lastName: true, status: true } },
        documents: {
          select: { id: true, fileName: true, size: true, createdAt: true },
          orderBy: [{ createdAt: "desc" }, { fileName: "asc" }],
        },
        restrictions: {
          include: {
            publisher: { select: { id: true, firstName: true, lastName: true, status: true } },
            documents: {
              select: { id: true, fileName: true, size: true, createdAt: true },
              orderBy: [{ createdAt: "desc" }, { fileName: "asc" }],
            },
          },
          orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
        },
      },
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.publisher.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const running = records
    .flatMap((r) => [r, ...r.restrictions])
    .filter((r) => r.kind === "RESTRICTION" && !r.liftedDate)
    .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());

  const byPublisher = new Map<string, Parent[]>();
  for (const r of records) {
    const list = byPublisher.get(r.publisherId);
    if (list) list.push(r);
    else byPublisher.set(r.publisherId, [r]);
  }
  // Records arrive newest first, so each group is already ordered and the groups
  // themselves come out in order of their most recent entry.
  const groups = [...byPublisher.values()].map((list) => ({ publisher: list[0].publisher, list }));

  return (
    <>
      <PageHeader
        back={{ href: "/boe", label: "Items from the body of elders" }}
        title="Publisher standing"
        description="Reproofs, removals, reinstatements and restrictions, with the dates they were given and announced. Confidential: visible to elders only and never part of the meeting summary. A removal takes the publisher off the roll until a reinstatement is recorded. Each entry keeps its own case file — the S-77 record, the wording the envelope must state, and the letters or forms you upload — and the whole case can be downloaded as one folder."
      />

      {running.length > 0 && (
        <Section
          title={`Restrictions still running · ${running.length}`}
          description="Fill in the date the elders lifted them and the entry closes off."
        >
          <ul className="space-y-3">
            {running.map((r) => (
              <li key={r.id}>
                <div className="rounded border border-clay/30 bg-surface px-4 py-3">
                  <p className="text-sm font-medium text-ink">
                    <Link href={`/publishers/${r.publisherId}`} className="hover:text-pine hover:underline">
                      {displayName(r.publisher)}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    Placed {formatDate(r.eventDate)}
                    {r.announcedDate ? ` · announced ${formatDate(r.announcedDate)}` : ""}
                  </p>
                  {r.notes && <p className="mt-1 text-xs text-ink">{r.notes}</p>}
                  {canWrite && <LiftForm id={r.id} today={today} />}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {canWrite && (
        <Section
          title="Record what the committee decided"
          description="One entry per event. The publisher's record status follows automatically. Restrictions can be added under an entry once it is on file."
        >
          <div className="max-w-2xl">
            <StandingForm
              today={today}
              people={publishers.map((p) => ({ value: p.id, label: displayName(p) }))}
            />
          </div>
        </Section>
      )}

      <Section
        title={`Everyone with an entry · ${groups.length}`}
        description="Most recent first, newest entry at the top of each name. Open “What the envelope must state” for the wording that goes on the envelope, and “Case file” on any entry for its S-77 record, folder export and documents."
      >
        {groups.length === 0 ? (
          <EmptyState
            title="Nothing recorded"
            description="Reproofs, removals, reinstatements and restrictions will be listed here against each publisher."
          />
        ) : (
          <ul className="space-y-3">
            {groups.map(({ publisher, list }) => (
              <li key={publisher.id}>
                <div className="rounded border border-rule bg-surface px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/publishers/${publisher.id}`}
                      className="text-sm font-medium text-ink hover:text-pine hover:underline"
                    >
                      {displayName(publisher)}
                    </Link>
                    <Badge tone={STATUS_TONE[publisher.status] ?? "neutral"}>
                      {STATUS_LABELS[publisher.status] ?? publisher.status}
                    </Badge>
                  </div>

                  <EnvelopeIndication
                    lines={envelopeIndication(
                      displayName(publisher),
                      list.flatMap((r) => [r, ...r.restrictions]),
                    )}
                  />

                  <ul className="mt-2 divide-y divide-rule border-t border-rule">
                    {list.map((r) => (
                      <li key={r.id} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={STANDING_TONE[r.kind] ?? "neutral"}>{STANDING_LABELS[r.kind] ?? r.kind}</Badge>
                          <span className="text-xs text-ink-soft">{formatDate(r.eventDate)}</span>
                          {r.kind !== "RESTRICTION" && (
                            <span className="text-xs text-ink-faint">
                              {r.announcedDate ? `announced ${formatDate(r.announcedDate)}` : "not announced"}
                            </span>
                          )}
                          {r.kind === "RESTRICTION" && (
                            <span className={`text-xs ${r.liftedDate ? "text-pine-dark" : "text-clay"}`}>
                              {r.liftedDate ? `lifted ${formatDate(r.liftedDate)}` : "still running"}
                            </span>
                          )}
                          {r.restrictions.length > 0 && (
                            <span className="text-xs text-ink-faint">
                              {r.restrictions.length} restriction{r.restrictions.length === 1 ? "" : "s"}
                              {r.restrictions.some((x) => !x.liftedDate) ? " · running" : " · all lifted"}
                            </span>
                          )}
                          {canWrite && (
                            <span className="ml-auto">
                              <DeleteRecordButton id={r.id} restrictions={r.restrictions.length} />
                            </span>
                          )}
                        </div>
                        {r.notes && <p className="mt-1 text-xs text-ink-soft">{r.notes}</p>}

                        {/* A restriction recorded before entries could carry one. */}
                        {r.kind === "RESTRICTION" && canWrite && !r.liftedDate && (
                          <LiftForm id={r.id} today={today} />
                        )}

                        {r.restrictions.length > 0 && (
                          <ul className="mt-1">
                            {r.restrictions.map((x) => (
                              <RestrictionRow key={x.id} r={x} canWrite={canWrite} today={today} />
                            ))}
                          </ul>
                        )}

                        <CaseFile recordId={r.id} documents={r.documents} canWrite={canWrite} />

                        {canWrite && r.kind !== "RESTRICTION" && (
                          <AddRestrictionForm parentId={r.id} today={today} />
                        )}
                        {canWrite && (
                          <CorrectForm
                            id={r.id}
                            publisherId={r.publisherId}
                            kind={r.kind}
                            eventDate={toDateInput(r.eventDate)}
                            announcedDate={toDateInput(r.announcedDate)}
                            notes={r.notes ?? ""}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
