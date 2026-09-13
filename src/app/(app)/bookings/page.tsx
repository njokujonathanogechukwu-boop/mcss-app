import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { formatTimeRange, formatDate, displayName, BOOKING_LABELS, DECISION_LABELS } from "@/lib/format";
import Link from "next/link";
import { PageHeader, Section, EmptyState, Panel } from "@/components/shell";
import { Badge } from "@/components/ui";
import { BookingForm } from "./booking-form";
import { DecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  APPROVED: "good", PENDING: "warn", DECLINED: "bad", CANCELLED: "neutral",
};

const DECISION_TONE: Record<string, "good" | "warn" | "neutral"> = {
  COMPLETED: "good", IN_PROGRESS: "warn", OPEN: "neutral", DEFERRED: "neutral",
};

export default async function BookingsPage() {
  const user = await requirePermission("booking:read");
  const canDecide = can(user.role, "booking:decide");

  const [pending, upcoming, past, resources] = await Promise.all([
    prisma.hallBooking.findMany({
      where: { status: "PENDING" },
      include: { resource: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.hallBooking.findMany({
      where: { status: "APPROVED", endTime: { gte: new Date() } },
      include: { resource: true },
      orderBy: { startTime: "asc" },
    }),
    prisma.hallBooking.findMany({
      where: { OR: [{ endTime: { lt: new Date() } }, { status: { in: ["DECLINED", "CANCELLED"] } }] },
      include: { resource: true },
      orderBy: { startTime: "desc" },
      take: 12,
    }),
    prisma.hallResource.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  // Only the elders see their own items, so for everyone else the section is absent.
  const boeItems = can(user.role, "boe:read")
    ? await prisma.boeDecision.findMany({
        where: { status: { in: ["OPEN", "IN_PROGRESS", "DEFERRED"] }, targetDate: { not: null } },
        include: { assignedTo: true },
        orderBy: { targetDate: "asc" },
        take: 12,
      })
    : null;

  return (
    <>
      <PageHeader
        title="Kingdom Hall calendar"
        description="Requests are checked against approved bookings for the same part of the hall. Two events can share a time only if they use different rooms."
      />

      {resources.length === 0 && (
        <EmptyState
          title="No rooms set up"
          description="Run the seed script or add hall resources before taking bookings."
        />
      )}

      <Section title={`Waiting for a decision${pending.length ? ` · ${pending.length}` : ""}`}>
        {pending.length === 0 ? (
          <EmptyState title="Nothing pending" description="New requests will appear here for the elders to review." />
        ) : (
          <ul className="space-y-3">
            {pending.map((b) => (
              <li key={b.id}>
                <Panel className="p-4">
                  <BookingBody booking={b} />
                  {canDecide && <DecisionForm id={b.id} />}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Approved and upcoming">
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing booked" description="Approved bookings appear here in date order." />
        ) : (
          <ul className="divide-y divide-rule rounded border border-rule bg-surface">
            {upcoming.map((b) => (
              <li key={b.id} className="px-4 py-3">
                <BookingBody booking={b} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {boeItems !== null && (
        <Section title={`Body of elders items${boeItems.length ? ` · ${boeItems.length}` : ""}`}>
          {boeItems.length === 0 ? (
            <EmptyState
              title="Nothing due"
              description="Decisions from the body of elders that carry a deadline appear here in date order."
            />
          ) : (
            <ul className="divide-y divide-rule rounded border border-rule bg-surface">
              {boeItems.map((item) => {
                const late = item.targetDate !== null && item.targetDate < new Date();
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{item.agendaItem}</p>
                      <p className="text-xs text-ink-faint">
                        <span className={late ? "font-medium text-clay" : ""}>
                          Due {formatDate(item.targetDate)}
                        </span>
                        {item.assignedTo ? ` · ${displayName(item.assignedTo)}` : " · nobody assigned"}
                      </p>
                    </div>
                    <Badge tone={late ? "bad" : DECISION_TONE[item.status]}>{DECISION_LABELS[item.status]}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-faint">
            Recorded and completed on the{" "}
            <Link href="/boe" className="text-pine underline-offset-2 hover:underline">
              Elders’ items page
            </Link>
            .
          </p>
        </Section>
      )}

      <Section title="Request the hall">
        <div className="max-w-2xl">
          <BookingForm resources={resources} />
        </div>
      </Section>

      {past.length > 0 && (
        <Section title="Earlier requests">
          <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
            {past.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-ink-soft">
                  {formatDate(b.startTime)} · {b.eventType} · {b.resource.name}
                </span>
                <Badge tone={TONE[b.status]}>{BOOKING_LABELS[b.status]}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function BookingBody({
  booking,
}: {
  booking: {
    eventType: string;
    requestingBody: string;
    contactName: string;
    contactPhone: string | null;
    startTime: Date;
    endTime: Date;
    status: string;
    setupRequirements: string | null;
    decisionNote: string | null;
    resource: { name: string };
  };
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{booking.eventType}</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            {formatTimeRange(booking.startTime, booking.endTime)}
          </p>
          <p className="text-xs text-ink-faint">
            {booking.resource.name} · {booking.requestingBody} · {booking.contactName}
            {booking.contactPhone ? ` · ${booking.contactPhone}` : ""}
          </p>
        </div>
        <Badge tone={TONE[booking.status]}>{BOOKING_LABELS[booking.status]}</Badge>
      </div>
      {booking.setupRequirements && (
        <p className="mt-2 rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink-soft">
          Setting up: {booking.setupRequirements}
        </p>
      )}
      {booking.decisionNote && (
        <p className="mt-1.5 text-xs text-ink-faint">Note: {booking.decisionNote}</p>
      )}
    </div>
  );
}
