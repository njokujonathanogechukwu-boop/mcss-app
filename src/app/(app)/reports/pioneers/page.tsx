import { Fragment } from "react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  pioneerReview, MONTHLY_GOAL, YEARLY_GOAL, FULL_YEAR_GOAL, type MonthCell,
} from "@/lib/pioneer-review";
import {
  reportingMonth, serviceYearOf, serviceYearLabel, serviceYearSpan, serviceYearOptions, monthLabel,
} from "@/lib/service-year";
import { PageHeader, Section, EmptyState, DataTable, Th, Td } from "@/components/shell";
import { Badge, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

function cellText(c: MonthCell): string {
  switch (c.state) {
    case "ahead":
      return "·";
    case "missing":
      return "—";
    case "no-report":
      return "NR";
    case "did-not-preach":
      return "0";
    case "hours":
      return c.credit > 0 ? `${c.hours}+${c.credit}` : String(c.combined);
  }
}

function cellTitle(c: MonthCell): string {
  switch (c.state) {
    case "ahead":
      return `${c.label}: the month has not ended yet`;
    case "missing":
      return `${c.label}: no report recorded`;
    case "no-report":
      return `${c.label}: no report`;
    case "did-not-preach":
      return `${c.label}: shared in no way this month`;
    case "hours":
      return c.credit > 0
        ? `${c.label}: ${c.hours} hours in the field + ${c.credit} hour credit`
        : `${c.label}: ${c.hours} hours`;
  }
}

export default async function PioneerReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;

  const cutoff = reportingMonth();
  const fallback = serviceYearOf(cutoff.year, cutoff.month);
  const parsed = Number(sp.sy);
  const serviceYear = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;

  const { rows } = await pioneerReview(serviceYear);

  const belowPace = rows.filter((r) => r.belowPace);
  const noHours = rows.filter((r) => r.noHours);
  const belowYear = rows.filter((r) => r.meetsYear === false);
  const meetsYear = rows.filter((r) => r.meetsYear === true);
  const meetsFull = rows.filter((r) => r.meetsFullYear === true);
  const shortOfPace = rows.filter((r) => r.projected !== null && r.projected < FULL_YEAR_GOAL);
  const yearComplete = rows[0]?.yearComplete ?? false;

  return (
    <>
      <PageHeader
        title="Review of pioneers’ field service"
        description={`Regular pioneers for the ${serviceYearLabel(serviceYear)} service year (${serviceYearSpan(serviceYear)}), figured to ${monthLabel(cutoff.year, cutoff.month)}. Hour credit is included throughout.`}
        actions={
          <>
            {can(user.role, "export:run") && (
              <a href={`/api/exports/pioneer-review?sy=${serviceYear}`} target="_blank" rel="noopener">
                <Button size="sm">Download as CSV</Button>
              </a>
            )}
            <Link href="/reports">
              <Button variant="secondary" size="sm">Report sheet</Button>
            </Link>
          </>
        }
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded border border-rule bg-surface p-4">
        <div>
          <label htmlFor="sy" className="field-label">Service year</label>
          <select id="sy" name="sy" defaultValue={String(serviceYear)} className="field-input">
            {serviceYearOptions(6).map((y) => (
              <option key={y} value={y}>{serviceYearLabel(y)}</option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">Review that year</Button>
        <p className="text-xs text-ink-faint">
          Around 1 March the review covers September to February; at the service year&rsquo;s end it
          covers all twelve months.
        </p>
      </form>

      <Section
        title="What the review looks for"
        description="The benchmarks the service overseer and the Congregation Service Committee work to."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <p className="rounded border border-rule bg-surface px-4 py-3 text-sm text-ink-soft">
            <span className="font-medium text-ink">A monthly average of {MONTHLY_GOAL} hours</span>,
            field service plus hour credit. A pioneer consistently below it is someone the service
            overseer and the group overseer meet with — to understand the circumstances and offer
            assistance, not to count hours at them.
          </p>
          <p className="rounded border border-rule bg-surface px-4 py-3 text-sm text-ink-soft">
            <span className="font-medium text-ink">{YEARLY_GOAL} hours for the service year.</span> A
            regular pioneer who reaches it may continue. Below it, the Congregation Service Committee
            decides promptly and with balance whether pioneering continues, weighing how long they
            have served, their age and whether a pause would relieve undue stress.
          </p>
          <p className="rounded border border-rule bg-surface px-4 py-3 text-sm text-ink-soft">
            <span className="font-medium text-ink">{FULL_YEAR_GOAL} hours is the full pace</span> —
            {MONTHLY_GOAL} for each of the twelve months to August. While the year is still running,
            each pioneer&rsquo;s projected total is what they land on if the months left go at their
            average so far, and the figure beside it is what a month has to carry to reach
            {FULL_YEAR_GOAL}.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Badge>{rows.length} regular pioneer{rows.length === 1 ? "" : "s"}</Badge>
          {belowPace.length > 0 && <Badge tone="bad">{belowPace.length} below the {MONTHLY_GOAL}-hour average</Badge>}
          {noHours.length > 0 && <Badge tone="bad">{noHours.length} with no hours recorded</Badge>}
          {yearComplete && meetsYear.length > 0 && <Badge tone="good">{meetsYear.length} reached {YEARLY_GOAL} hours</Badge>}
          {yearComplete && meetsFull.length > 0 && <Badge tone="good">{meetsFull.length} reached the full {FULL_YEAR_GOAL} hours</Badge>}
          {yearComplete && belowYear.length > 0 && <Badge tone="bad">{belowYear.length} below {YEARLY_GOAL} — for the service committee</Badge>}
          {!yearComplete && rows.length > 0 && <Badge>{rows[0].endedMonths} of 12 months ended</Badge>}
          {!yearComplete && shortOfPace.length > 0 && (
            <Badge tone="warn">{shortOfPace.length} projected below {FULL_YEAR_GOAL} at their current pace</Badge>
          )}
        </div>
      </Section>

      {rows.length === 0 ? (
        <EmptyState
          title="No regular pioneers on the roll"
          description="When a publisher is marked a regular pioneer on their record, their service year is reviewed here."
        />
      ) : (
        <Section title="Pioneer by pioneer">
          <DataTable>
            <thead>
              <tr>
                <Th>Pioneer</Th>
                <Th align="right">Months counted</Th>
                <Th align="right">Field hours</Th>
                <Th align="right">Credit</Th>
                <Th align="right">Combined</Th>
                <Th align="right">Monthly average</Th>
                <Th align="right">Projected total</Th>
                <Th align="right">A month to {FULL_YEAR_GOAL}</Th>
                <Th>Standing</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <Td>
                      <Link href={`/publishers/${r.id}`} className="font-medium text-ink hover:underline">
                        {r.name}
                      </Link>
                      {r.group && <span className="block text-xxs text-ink-faint">{r.group}</span>}
                    </Td>
                    <Td align="right" className="text-ink-soft">
                      {r.countedMonths || "—"}
                    </Td>
                    <Td align="right" className="text-ink-soft">{r.fieldHours}</Td>
                    <Td align="right" className="text-ink-soft">{r.creditHours}</Td>
                    <Td align="right" className="font-medium text-ink">{r.combined}</Td>
                    <Td align="right" className={r.belowPace ? "font-medium text-clay" : "text-ink-soft"}>
                      {r.average === null ? "—" : r.average.toFixed(1)}
                    </Td>
                    <Td
                      align="right"
                      className={
                        r.projected !== null && r.projected < YEARLY_GOAL
                          ? "font-medium text-clay"
                          : "text-ink-soft"
                      }
                      title={
                        r.projected === null
                          ? undefined
                          : `${r.combined} hours so far plus ${r.average?.toFixed(1)} a month for the ${r.remainingMonths} month${r.remainingMonths === 1 ? "" : "s"} left`
                      }
                    >
                      {r.projected === null ? "—" : r.projected}
                    </Td>
                    <Td align="right" className="text-ink-soft">
                      {r.neededForFull === null ? "—" : r.neededForFull === 0 ? "reached" : r.neededForFull}
                    </Td>
                    <Td>
                      {r.noHours ? (
                        <Badge tone="bad">No hours recorded yet</Badge>
                      ) : r.yearComplete ? (
                        r.meetsYear ? (
                          <Badge tone="good">Reached {YEARLY_GOAL} hours</Badge>
                        ) : (
                          <Badge tone="bad">Below {YEARLY_GOAL} — for the service committee</Badge>
                        )
                      ) : r.belowPace ? (
                        <Badge tone="bad">Below the {MONTHLY_GOAL}-hour average</Badge>
                      ) : r.projected !== null && r.projected < YEARLY_GOAL ? (
                        <Badge tone="warn">Projected below {YEARLY_GOAL}</Badge>
                      ) : (
                        <Badge tone="good">On pace</Badge>
                      )}
                      <span className="mt-1 block text-xxs text-ink-soft">
                        {r.yearComplete
                          ? r.meetsYear
                            ? `May continue as a regular pioneer${r.meetsFullYear ? `, having reached the full ${FULL_YEAR_GOAL} hours` : ""}.`
                            : "The committee weighs their circumstances, age and time in full-time service."
                          : r.noHours
                            ? "Meet with the pioneer to understand the circumstances and offer assistance."
                            : [
                                `Projected ${r.projected} hours by August at the current pace.`,
                                r.neededForFull === 0
                                  ? `The full ${FULL_YEAR_GOAL} hours is already reached.`
                                  : `Needs about ${r.neededForFull} hours a month over the ${r.remainingMonths} month${r.remainingMonths === 1 ? "" : "s"} left to reach ${FULL_YEAR_GOAL}${
                                      r.neededPerMonth && r.neededPerMonth > 0
                                        ? `, or ${r.neededPerMonth} to reach the ${YEARLY_GOAL}-hour floor`
                                        : ""
                                    }.`,
                              ].join(" ")}
                      </span>
                    </Td>
                  </tr>
                  <tr className="border-t-0">
                    <Td colSpan={9}>
                      <div className="flex flex-wrap gap-1">
                        {r.months.map((c) => (
                          <span
                            key={c.label}
                            title={cellTitle(c)}
                            className={
                              "rounded border px-1.5 py-0.5 text-xxs " +
                              (c.state === "ahead"
                                ? "border-rule text-ink-faint"
                                : c.state === "missing" || c.state === "no-report"
                                  ? "border-clay/40 bg-clay-light text-clay"
                                  : c.combined >= MONTHLY_GOAL
                                    ? "border-rule bg-paper text-ink-soft"
                                    : "border-rule bg-paper text-clay")
                            }
                          >
                            {c.short} {cellText(c)}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-xxs text-ink-faint">
                        Hours per month, hour credit shown as field hours + credit. — no report
                        recorded · NR reported no report · 0 shared in no way · · month not ended.
                      </p>
                    </Td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </DataTable>
        </Section>
      )}

      <Section title="How the figures are worked">
        <p className="max-w-[80ch] text-xs leading-relaxed text-ink-soft">
          The average runs from the month each pioneer first reported hours or credit in this service
          year to {monthLabel(cutoff.year, cutoff.month)}, so months before they took up pioneer
          service are not held against them; gaps and months with no report inside that stretch count
          as zero. The projected total is what they reach by August if every month left goes at that
          average, and &ldquo;a month to {FULL_YEAR_GOAL}&rdquo; is what each of those months has to
          carry to land on the full {FULL_YEAR_GOAL} hours. Special pioneers are not reviewed here —
          their hour requirement follows their assignment. The review states the figures; the meeting
          with the pioneer and any decision about continuing belong to the service overseer and the
          Congregation Service Committee.
        </p>
      </Section>
    </>
  );
}
