import { requirePermission } from "@/lib/auth";
import {
  currentServiceYear, serviceYearLabel, serviceYearOptions, serviceYearSpan,
} from "@/lib/service-year";
import { s10Figures } from "@/lib/s10";
import { PageHeader, Section } from "@/components/shell";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

function whole(value: string | undefined): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function Figure({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded border border-rule bg-surface px-4 py-3">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function HandInput({ label, name, value, hint }: { label: string; name: string; value: number; hint?: string }) {
  return (
    <div className="rounded border border-rule bg-surface px-4 py-3">
      <label htmlFor={name} className="text-xs font-medium text-ink-soft">{label}</label>
      <input id={name} name={name} type="number" min={0} step={1} defaultValue={value} className="field-input mt-1 w-24" />
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export default async function S10Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("report:read");
  const sp = await searchParams;
  const sy = Number(sp.sy) || currentServiceYear();
  const f = await s10Figures(sy);

  const deaf = whole(sp.deaf);
  const blind = whole(sp.blind);
  const incarcerated = whole(sp.incarcerated);
  const territories = whole(sp.territories);
  const notWorked = whole(sp.notWorked);

  return (
    <>
      <PageHeader
        title="Congregation analysis (S-10)"
        description={`Service year ${serviceYearLabel(sy)} (${serviceYearSpan(sy)}). The figures the hub asks for, worked out from the attendance record and the report sheet.`}
        back={{ href: "/reports", label: "Report sheet" }}
      />

      <form method="get" className="mb-7 flex flex-wrap items-end gap-3 rounded border border-rule bg-surface p-4">
        <div>
          <label htmlFor="sy" className="field-label">Service year</label>
          <select id="sy" name="sy" defaultValue={String(sy)} className="field-input">
            {serviceYearOptions(6).map((y) => (
              <option key={y} value={y}>{serviceYearLabel(y)}</option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">Show</Button>
        <p className="text-xs text-ink-faint">
          The counts you keep by hand (deaf, blind, incarcerated, territories) are carried along in
          the address bar, so a filled-in analysis can be bookmarked or shared.
        </p>
      </form>

      <Section
        title="1 · Attendance and publishers"
        description="Averages are the service-year totals from the meeting attendance record, rounded to the nearest whole number — the same figures the S-88 carries."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Figure label="Weekend meeting" value={f.weekendAverage ?? "—"} hint={`${f.weekendMeetings} meetings counted`} />
          <Figure label="Midweek meeting" value={f.midweekAverage ?? "—"} hint={`${f.midweekMeetings} meetings counted`} />
        </div>

        <h3 className="mb-2 mt-6 text-base font-semibold text-ink">Congregation totals</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Figure
            label="All active publishers"
            value={f.allActive.length}
            hint={`Reported at least once between ${f.activeWindow}. Includes pioneers, unbaptized and irregular publishers, reactivated, deaf, blind, incarcerated and special full-time servants.`}
          />
          <Figure
            label="New inactive publishers"
            value={f.newInactive.length}
            hint="First went six consecutive months without a report inside this service year. Earlier drop-offs are not counted."
          />
          <Figure
            label="Reactivated publishers"
            value={f.reactivated.length}
            hint="Reported in a month of this service year after at least six months away. The same person can also appear as new inactive."
          />
          <HandInput label="Deaf publishers" name="deaf" value={deaf} hint="Count publishers who depend on sign language." />
          <HandInput label="Blind publishers" name="blind" value={blind} />
          <HandInput
            label="Incarcerated publishers"
            name="incarcerated"
            value={incarcerated}
            hint="Jail, prison, psychiatric hospital or substance-abuse facility."
          />
        </div>

        {(f.newInactive.length > 0 || f.reactivated.length > 0) && (
          <div className="mt-4 space-y-1 text-sm text-ink-soft">
            {f.newInactive.length > 0 && <p><span className="font-medium text-ink">Went inactive this year:</span> {f.newInactive.join(", ")}.</p>}
            {f.reactivated.length > 0 && <p><span className="font-medium text-ink">Came back reporting:</span> {f.reactivated.join(", ")}.</p>}
          </div>
        )}
      </Section>

      <Section
        title="2 · Territory coverage"
        description="Territories are not tracked in this system yet, so both figures are entered from the territory file."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <HandInput label="Total number of territories" name="territories" value={territories} />
          <HandInput
            label="Territories not worked"
            name="notWorked"
            value={notWorked}
            hint="Do not include territories worked in special campaigns; they are considered worked."
          />
        </div>
      </Section>

      <Section title="How each figure is worked out">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
          <li>Meeting averages: every attendance row in the service year, in person plus video conference, divided by the number of meetings and rounded — exactly the S-88 footing.</li>
          <li>All active: a publisher with a report on file (shared or did not preach) in any of the last six months of the service year. A &ldquo;no report&rdquo; row is an absence, not a report.</li>
          <li>New inactive: the first run of six consecutive months with no report on file closes inside the service year, and the publisher had reported before that run.</li>
          <li>Reactivated: a report on file in the service year preceded by at least six consecutive missing months.</li>
          <li>Deaf, blind, incarcerated and both territory figures are entered by hand and travel in the address bar.</li>
        </ul>
      </Section>
    </>
  );
}
