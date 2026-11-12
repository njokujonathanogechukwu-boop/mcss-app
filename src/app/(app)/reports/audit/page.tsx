import Link from "next/link";
import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { RowFixes } from "./row-fixes";
import { collectingMonth } from "@/lib/report-periods";
import { currentServiceYear, monthLabel, serviceYearMonths } from "@/lib/service-year";
import { auditMonth, BUCKET_LABEL, type AuditCell, type AuditRow, type Bucket, type Flag } from "@/lib/report-audit";
import { PageHeader } from "@/components/shell";
import { Badge, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

const CAT: Record<string, string> = { NONE: "P", AUXILIARY: "AP", REGULAR: "RP", SPECIAL: "SP" };

/** One month of a publisher's history, as short as it can be read. */
function Cell({ c, against }: { c: AuditCell; against?: string }) {
  if (!c) return <span className="text-ink-faint">—</span>;
  if (c.outcome === "NO_REPORT") return <span className="text-ink-faint">No report</span>;
  if (c.outcome === "DID_NOT_PREACH") return <span className="text-ink-faint">Did not share</span>;
  const changed = against !== undefined && against !== c.status;
  return (
    <span className="whitespace-nowrap">
      <span className={changed ? "font-medium text-clay" : "text-ink-faint"}>{CAT[c.status]}</span>
      {c.hours != null && c.status !== "NONE" && <span className="text-ink"> {c.hours}h</span>}
      <span className="text-ink-soft"> · {c.studies}</span>
    </span>
  );
}

function Flags({ flags, reviewed }: { flags: Flag[]; reviewed: boolean }) {
  if (!flags.length) return <span className="text-ink-faint">—</span>;
  return (
    <ul className={`space-y-0.5 ${reviewed ? "opacity-60" : ""}`}>
      {flags.map((f, i) => (
        <li key={i} className={f.level === "warn" && !reviewed ? "text-clay" : "text-ink-soft"}>
          {f.level === "warn" ? "⚠ " : "· "}
          {f.text}
        </li>
      ))}
    </ul>
  );
}

function Fold({
  title, meta, open = false, tone, children,
}: {
  title: string; meta?: string; open?: boolean; tone?: "warn"; children: ReactNode;
}) {
  return (
    <details open={open} className="group/fold mb-5 rounded border border-rule bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block text-ink-faint transition-transform group-open/fold:rotate-90">▸</span>
        <h2 className="font-serif text-base text-ink">{title}</h2>
        {meta && <span className={`text-xs ${tone === "warn" ? "text-clay" : "text-ink-faint"}`}>{meta}</span>}
      </summary>
      <div className="border-t border-rule">{children}</div>
    </details>
  );
}

const th = "border-b border-rule-strong bg-paper px-3 py-2 text-xs font-medium text-ink-soft";
const td = "border-b border-rule px-3 py-2 align-top";

/** A table of publishers, this month's report first and the months before beside it. */
function AuditTable({
  rows, history, hours, subtotal, fix,
}: {
  rows: AuditRow[];
  history: { label: string }[];
  hours: boolean;
  subtotal?: boolean;
  /** Who may put things right, and the month being audited. */
  fix: { year: number; month: number; canReports: boolean; canPublishers: boolean };
}) {
  const sum = (pick: (r: AuditRow) => number) => rows.reduce((t, r) => t + pick(r), 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${th} text-left`}>Name</th>
            <th className={`${th} text-left`}>Group</th>
            {hours && <th className={`${th} text-right`}>Hours</th>}
            {hours && <th className={`${th} text-right`}>Credit</th>}
            <th className={`${th} text-right`}>Studies</th>
            {history.map((h) => (
              <th key={h.label} className={`${th} text-left font-normal text-ink-faint`}>{h.label}</th>
            ))}
            <th className={`${th} min-w-[220px] text-left`}>Check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const warn = !r.reviewed && r.flags.some((f) => f.level === "warn");
            return (
              <tr key={r.publisherId} className={warn ? "bg-clay-light/30" : undefined}>
                <td className={td}>
                  <Link href={`/publishers/${r.publisherId}`} className="text-ink hover:text-pine hover:underline">
                    {r.name}
                  </Link>
                  {r.notCounted && r.report && <p className="text-xs text-ink-faint">{r.notCounted}</p>}
                  {r.remarks && <p className="text-xs italic text-ink-faint">{r.remarks}</p>}
                </td>
                <td className={`${td} text-ink-soft`}>{r.group ?? "—"}</td>
                {hours && <td className={`${td} text-right font-medium`}>{r.report?.hours ?? "—"}</td>}
                {hours && <td className={`${td} text-right text-ink-soft`}>{r.report?.credit || "—"}</td>}
                <td className={`${td} text-right font-medium`}>
                  {r.report && r.report.outcome === "SHARED" ? r.report.studies : "—"}
                </td>
                {r.history.map((c, i) => (
                  <td key={i} className={`${td} text-xs`}>
                    <Cell c={c} against={r.report?.outcome === "SHARED" ? r.report.status : undefined} />
                  </td>
                ))}
                <td className={`${td} text-xs`}>
                  <Flags flags={r.flags} reviewed={r.reviewed} />
                  {r.reviewed && <p className="mt-0.5 text-xxs text-pine">Reviewed</p>}
                  {(fix.canReports || fix.canPublishers) && (
                    <RowFixes
                      publisherId={r.publisherId} name={r.name} year={fix.year} month={fix.month}
                      filed={r.filed} expected={r.expected} reviewed={r.reviewed}
                      hasFlags={r.flags.some((f) => f.level === "warn")}
                      gone={["TRANSFERRED_OUT", "DECEASED"].includes(r.publisherStatus)}
                      canReports={fix.canReports} canPublishers={fix.canPublishers}
                    />
                  )}
                </td>
              </tr>
            );
          })}
          {subtotal && rows.length > 0 && (
            <tr className="bg-paper font-medium">
              <td className={td}>{rows.length} report{rows.length === 1 ? "" : "s"}</td>
              <td className={td} />
              {hours && <td className={`${td} text-right`}>{sum((r) => r.report?.hours ?? 0)}</td>}
              {hours && <td className={`${td} text-right text-ink-soft`}>{sum((r) => r.report?.credit ?? 0) || "—"}</td>}
              <td className={`${td} text-right`}>{sum((r) => r.report?.studies ?? 0)}</td>
              <td className={td} colSpan={history.length + 1} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; back?: string; show?: string; group?: string }>;
}) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;

  const fallback = await collectingMonth();
  const [yStr, mStr] = (sp.period ?? `${fallback.year}-${fallback.month}`).split("-");
  const year = Number(yStr) || fallback.year;
  const month = Number(mStr) || fallback.month;
  const back = [3, 6, 12].includes(Number(sp.back)) ? Number(sp.back) : 6;
  const flaggedOnly = sp.show === "flagged";
  const groupFilter = sp.group ? Number(sp.group) : null;

  const a = await auditMonth(year, month, back);
  const fix = {
    year, month,
    canReports: can(user.role, "report:write"),
    canPublishers: can(user.role, "publisher:write"),
  };

  const visible = a.rows.filter(
    (r) => (!flaggedOnly || (!r.reviewed && r.flags.some((f) => f.level === "warn"))) && (groupFilter === null || r.group === groupFilter),
  );
  const groups = [...new Set(a.rows.map((r) => r.group).filter((g): g is number => g !== null))].sort((x, y) => x - y);
  const by = (b: Bucket) => visible.filter((r) => r.counted === b);
  const notCounted = visible.filter((r) => r.counted === null);
  const special = by("SPECIAL");
  const warnings = a.rows.filter((r) => !r.reviewed && r.flags.some((f) => f.level === "warn")).length;
  const mismatches = a.check.filter(
    (c) => c.audit.reports !== c.s1.reports || c.audit.studies !== c.s1.studies || (c.hoursCount && c.audit.hours !== c.s1.hours),
  );
  const filtered = flaggedOnly || groupFilter !== null;

  const periodOptions = [
    ...serviceYearMonths(currentServiceYear()),
    ...serviceYearMonths(currentServiceYear() - 1),
  ];

  const section = (b: Bucket, open: boolean) => {
    const rows = by(b);
    const check = a.check.find((c) => c.bucket === b);
    const hours = b !== "PUBLISHER";
    return (
      <Fold
        key={b}
        title={BUCKET_LABEL[b]}
        open={open}
        meta={`${rows.length} report${rows.length === 1 ? "" : "s"}${hours ? ` · ${rows.reduce((t, r) => t + (r.report?.hours ?? 0), 0)} hours` : ""} · ${rows.reduce((t, r) => t + (r.report?.studies ?? 0), 0)} studies${check && !filtered && a.late.some((l) => l.counted === b) ? " · late reports listed below" : ""}`}
      >
        {rows.length ? (
          <AuditTable fix={fix} rows={rows} history={a.history} hours={hours} subtotal />
        ) : (
          <p className="px-4 py-4 text-sm text-ink-faint">None{filtered ? " match the filter" : ""}.</p>
        )}
      </Fold>
    );
  };

  return (
    <>
      <PageHeader
        title={`Audit the report · ${a.label}`}
        description="Every report behind the congregation's S-1, publisher by publisher, beside the months before, so anything unusual can be put right before the month is submitted."
        back={{ href: `/reports?period=${year}-${month}`, label: "Report sheet" }}
      />

      <form method="get" className="mb-6 grid gap-3 rounded border border-rule bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="period" className="field-label">Month to audit</label>
          <select id="period" name="period" defaultValue={`${year}-${month}`} className="field-input">
            {periodOptions.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="back" className="field-label">Compare with</label>
          <select id="back" name="back" defaultValue={String(back)} className="field-input">
            <option value="3">The 3 months before</option>
            <option value="6">The 6 months before</option>
            <option value="12">The 12 months before</option>
          </select>
        </div>
        <div>
          <label htmlFor="group" className="field-label">Group</label>
          <select id="group" name="group" defaultValue={groupFilter === null ? "" : String(groupFilter)} className="field-input">
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>Group {g}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="show" className="field-label">Show</label>
          <select id="show" name="show" defaultValue={flaggedOnly ? "flagged" : "all"} className="field-input">
            <option value="all">Everyone</option>
            <option value="flagged">Only those with something to check</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full">Show</Button>
        </div>
      </form>

      {/* The S-1 against the breakdown. */}
      <section className="mb-6 rounded border border-rule bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg text-ink">S-1 against the breakdown</h2>
          <span className="flex items-center gap-2">
            {a.closed && <Badge tone="neutral">Submitted</Badge>}
            {mismatches.length === 0 ? (
              <Badge tone="good">Every line adds up</Badge>
            ) : (
              <Badge tone="bad">{mismatches.length} line{mismatches.length === 1 ? "" : "s"} do not add up</Badge>
            )}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={`${th} text-left`}>S-1 line</th>
                <th className={`${th} text-right`}>Reports</th>
                <th className={`${th} text-right`}>Hours</th>
                <th className={`${th} text-right`}>Bible studies</th>
                <th className={`${th} text-left`}>Check</th>
              </tr>
            </thead>
            <tbody>
              {a.check.map((c) => {
                const ok = c.audit.reports === c.s1.reports && c.audit.studies === c.s1.studies && (!c.hoursCount || c.audit.hours === c.s1.hours);
                return (
                  <tr key={c.bucket}>
                    <td className={td}>{c.label}</td>
                    <td className={`${td} text-right font-medium`}>{c.s1.reports}</td>
                    <td className={`${td} text-right font-medium`}>{c.hoursCount ? c.s1.hours : <span className="text-ink-faint">—</span>}</td>
                    <td className={`${td} text-right font-medium`}>{c.s1.studies}</td>
                    <td className={`${td} text-xs`}>
                      {ok ? (
                        <span className="text-pine">✓ matches the names below</span>
                      ) : (
                        <span className="text-clay">
                          Names below add up to {c.audit.reports} reports
                          {c.hoursCount ? `, ${c.audit.hours} hours` : ""}, {c.audit.studies} studies
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-paper font-medium">
                <td className={td}>Total</td>
                <td className={`${td} text-right`}>{a.s1.totals.reports}</td>
                <td className={`${td} text-right`}>{a.s1.totals.hours}</td>
                <td className={`${td} text-right`}>{a.s1.totals.studies}</td>
                <td className={td} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Each line counts only the reports filed under it: the Publishers line&rsquo;s Bible studies come from
          publishers&rsquo; reports alone, and pioneers&rsquo; studies stay on their own lines. Only the Total adds
          them together. A pioneer whose report was filed as a publisher&rsquo;s is marked ⚠ below.
        </p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-soft">All active publishers</dt>
            <dd className="font-serif text-xl text-ink">{a.s1.activePublishers}</dd>
            <p className="text-xs text-ink-faint">
              Reported at least once in the last 6 months.
              {a.activeByNoShare > 0 &&
                ` ${a.activeByNoShare} of them only through "did not share" reports, with no month of sharing.`}
            </p>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Late reports in this figure</dt>
            <dd className="font-serif text-xl text-ink">{a.s1.lateCount}</dd>
            <p className="text-xs text-ink-faint">From earlier months that had already been submitted.</p>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">To look at</dt>
            <dd className={`font-serif text-xl ${warnings ? "text-clay" : "text-ink"}`}>{warnings}</dd>
            <p className="text-xs text-ink-faint">Publishers with a ⚠ below. Rows shaded red.</p>
          </div>
        </dl>
      </section>

      <p className="mb-4 text-xs text-ink-faint">
        Earlier months read as category, hours and Bible studies: <span className="text-ink-soft">RP 52h · 3</span> is a
        regular pioneer with 52 hours and 3 studies; <span className="text-ink-soft">P · 1</span> a publisher with one
        study. A category in red differs from this month&rsquo;s. Click a name to open the publisher and correct a
        report.
      </p>

      {section("REGULAR", true)}
      {section("AUXILIARY", true)}
      {section("PUBLISHER", true)}

      {a.late.length > 0 && groupFilter === null && (
        <Fold
          title="Late reports added to this month"
          meta={`${a.late.filter((l) => l.counted).length} counted`}
          open
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Name</th>
                  <th className={`${th} text-left`}>For the month of</th>
                  <th className={`${th} text-left`}>Counted as</th>
                  <th className={`${th} text-right`}>Hours</th>
                  <th className={`${th} text-right`}>Studies</th>
                </tr>
              </thead>
              <tbody>
                {a.late.map((l) => (
                  <tr key={l.key}>
                    <td className={td}>
                      <Link href={`/publishers/${l.publisherId}`} className="text-ink hover:text-pine hover:underline">{l.name}</Link>
                      {l.group && <span className="ml-1 text-xs text-ink-faint">{l.group}</span>}
                    </td>
                    <td className={`${td} text-ink-soft`}>{monthLabel(l.year, l.month)}</td>
                    <td className={td}>{l.counted ? BUCKET_LABEL[l.counted] : <span className="text-ink-faint">Not counted (did not share)</span>}</td>
                    <td className={`${td} text-right`}>{l.counted && l.counted !== "PUBLISHER" ? l.hours ?? "—" : "—"}</td>
                    <td className={`${td} text-right`}>{l.counted ? l.bibleStudies : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Fold>
      )}

      {special.length > 0 && (
        <Fold title="Special pioneers" meta="left off the S-1; they report to the branch">
          <AuditTable fix={fix} rows={special} history={a.history} hours />
        </Fold>
      )}

      <Fold
        title="Not counted this month"
        meta={`${notCounted.length} · not yet recorded, did not share, no report, or came in after submission`}
        tone={notCounted.some((r) => !r.reviewed && r.flags.some((f) => f.level === "warn")) ? "warn" : undefined}
      >
        {notCounted.length ? (
          <AuditTable fix={fix} rows={notCounted} history={a.history} hours />
        ) : (
          <p className="px-4 py-4 text-sm text-ink-faint">Everyone is counted.</p>
        )}
      </Fold>

      {a.inactiveLeftOut > 0 && (
        <p className="text-xs text-ink-faint">
          {a.inactiveLeftOut} inactive publisher{a.inactiveLeftOut === 1 ? " has" : "s have"} no report in these
          months and {a.inactiveLeftOut === 1 ? "is" : "are"} left out of the list.
        </p>
      )}
    </>
  );
}
