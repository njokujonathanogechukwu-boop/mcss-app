import Link from "next/link";
import { PIONEER_LABELS, REPORT_OUTCOME_LABELS, formatDate } from "@/lib/format";
import { monthLabel } from "@/lib/service-year";
import type { LateReportDetail } from "@/lib/report-periods";
import { setLateReportsCleared } from "./actions";
import { ConfirmSubmit } from "./confirm-submit";

/**
 * The late reports behind the count in the month's status line, opened on
 * demand: whose each is, the month it is for, what it says and when it was
 * entered. Only those who shared in the ministry add to the S-1 figures; the
 * rest are listed so the count can be checked.
 */
export function LateReports({
  reports, summary, cleared = [], canClear = false,
}: {
  reports: LateReportDetail[];
  /** The line the list opens from. */
  summary: string;
  /** Late reports cleared and so not rolling in, shown so they can be put back. */
  cleared?: LateReportDetail[];
  /** Whether this list may clear reports: only while they are waiting to roll in. */
  canClear?: boolean;
}) {
  if (reports.length === 0 && cleared.length === 0) return null;
  const adding = reports.filter((r) => r.outcome === "SHARED").length;

  return (
    <details className="group mt-3 rounded border border-rule bg-paper">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-pine-dark hover:underline">
        {summary}
      </summary>
      {reports.length > 0 && (
      <div className="overflow-x-auto border-t border-rule">
        <table className="w-full text-xs">
          <thead className="bg-surface text-left text-ink-soft">
            <tr>
              <th className="px-3 py-1.5 font-medium">Publisher</th>
              <th className="px-3 py-1.5 font-medium">Report for</th>
              <th className="px-3 py-1.5 font-medium">What was reported</th>
              <th className="px-3 py-1.5 font-medium">Remarks</th>
              <th className="px-3 py-1.5 font-medium">Entered</th>
              {canClear && <th className="px-3 py-1.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {reports.map((r) => {
              const shared = r.outcome === "SHARED";
              const what = shared
                ? [
                    "Shared",
                    `${r.bibleStudies} Bible stud${r.bibleStudies === 1 ? "y" : "ies"}`,
                    r.hours !== null ? `${r.hours} hours` : null,
                    r.pioneerStatusUsed !== "NONE" ? PIONEER_LABELS[r.pioneerStatusUsed]?.toLowerCase() : null,
                  ].filter(Boolean).join(" · ")
                : REPORT_OUTCOME_LABELS[r.outcome as keyof typeof REPORT_OUTCOME_LABELS] ?? r.outcome;
              return (
                <tr key={r.key}>
                  <td className="px-3 py-1.5">
                    <Link href={`/publishers/${r.publisherId}`} className="text-ink hover:underline">{r.name}</Link>
                    {r.group && <span className="block text-xxs text-ink-faint">{r.group}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-ink-soft">
                    <Link href={`/reports?period=${r.year}-${r.month}`} className="hover:underline">
                      {monthLabel(r.year, r.month)}
                    </Link>
                  </td>
                  <td className={`px-3 py-1.5 ${shared ? "text-ink" : "text-ink-faint"}`}>{what}</td>
                  <td className="px-3 py-1.5 text-ink-soft">{r.remarks ?? ""}</td>
                  <td className="px-3 py-1.5 text-ink-faint">{formatDate(r.receivedAt)}</td>
                  {canClear && (
                    <td className="px-3 py-1.5 text-right">
                      <form action={setLateReportsCleared}>
                        <input type="hidden" name="key" value={r.key} />
                        <input type="hidden" name="cleared" value="true" />
                        <button
                          type="submit"
                          title="Dealt with another way: it will not roll into the next month you close"
                          className="rounded border border-rule-strong px-2 py-0.5 text-xxs text-ink-soft hover:border-pine hover:text-pine"
                        >
                          Clear
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      {reports.length > 0 && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-3 py-2">
        <p className="text-xxs text-ink-faint">
          {adding} of {reports.length} shared in the ministry and add to the S-1 figures; the others are
          counted as reports received but carry no figures. Click a month to open that month&rsquo;s sheet.
          {canClear && " Clear a report you have dealt with another way, and it will not roll in."}
        </p>
        {canClear && reports.length > 1 && (
          <form action={setLateReportsCleared}>
            <input type="hidden" name="all" value="true" />
            <input type="hidden" name="cleared" value="true" />
            <ConfirmSubmit
              message={`Mark all ${reports.length} late reports as cleared? They will not roll into the next month you close. Each can be put back.`}
              className="rounded border border-rule-strong bg-surface px-2.5 py-1 text-xs text-ink hover:border-pine hover:text-pine"
            >
              Mark all as cleared
            </ConfirmSubmit>
          </form>
        )}
      </div>
      )}

      {cleared.length > 0 && (
        <div className="border-t border-rule px-3 py-2">
          <p className="mb-1 text-xxs font-medium text-ink-soft">
            Cleared · {cleared.length} — not rolling into the next month you close
          </p>
          <ul className="space-y-1">
            {cleared.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
                <span>
                  {r.name} · {monthLabel(r.year, r.month)} ·{" "}
                  {r.outcome === "SHARED"
                    ? `${r.bibleStudies} Bible stud${r.bibleStudies === 1 ? "y" : "ies"}${r.hours !== null ? `, ${r.hours} hours` : ""}`
                    : REPORT_OUTCOME_LABELS[r.outcome as keyof typeof REPORT_OUTCOME_LABELS] ?? r.outcome}
                </span>
                {canClear && (
                  <form action={setLateReportsCleared}>
                    <input type="hidden" name="key" value={r.key} />
                    <input type="hidden" name="cleared" value="false" />
                    <button type="submit" className="text-xxs text-pine hover:underline">Restore</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
