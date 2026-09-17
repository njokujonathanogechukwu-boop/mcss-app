import {
  groupByToken,
  groupMonthRows,
  groupTitle,
  reviewMonths,
} from "@/lib/group-reports";
import { isClosed } from "@/lib/report-periods";
import { monthLabel, reportingMonth } from "@/lib/service-year";
import { GroupReportList } from "./group-report-list";
import { MonthPicker } from "./month-picker";

export const dynamic = "force-dynamic";

/**
 * A field service group's own page, behind the link the secretary emails to the
 * overseer. No account and no password: the token in the address is the whole
 * authority. He reads back over his group's months, and can send a report only
 * for the month being collected now, and only for a publisher the secretary has
 * not already entered.
 */
export default async function GroupReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const group = await groupByToken(token);

  const months = reviewMonths();
  const current = months[0];
  const wanted = months.find((m) => `${m.year}-${m.month}` === sp.period);
  const { year, month } = wanted ?? current;

  const rows = group ? await groupMonthRows(group.id, year, month) : [];
  // Only the month being collected, and only until the secretary has sent it to
  // the branch, can still be written from here.
  const isCollecting = year === current.year && month === current.month;
  const editing = group !== null && isCollecting && !(await isClosed(year, month));

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto grid max-w-2xl gap-6">
        <header className="grid gap-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Maitama Congregation
          </p>
          <h1 className="font-serif text-2xl text-ink">
            Your group&rsquo;s field service reports
          </h1>
          {group && <p className="text-sm text-ink-soft">{groupTitle(group)}</p>}
        </header>

        {!group ? (
          <div className="rounded border border-clay/40 bg-clay-light px-6 py-8 text-center">
            <p className="font-serif text-lg text-clay">This link is not valid</p>
            <p className="mt-1 text-sm text-ink-soft">
              The link may have been replaced. Please contact the secretary for a new one.
            </p>
          </div>
        ) : (
          <>
            <MonthPicker
              token={token}
              months={months}
              year={year}
              month={month}
              currentLabel={current.label}
            />

            {rows.length === 0 ? (
              <div className="rounded border border-rule bg-surface px-6 py-8 text-center">
                <p className="font-serif text-lg text-ink">
                  Nobody to show for {monthLabel(year, month)}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  No publisher in {groupTitle(group)} was on the roll for that month.
                </p>
              </div>
            ) : (
              <GroupReportList
                rows={rows}
                token={token}
                year={year}
                month={month}
                monthLabel={monthLabel(year, month)}
                editing={editing}
              />
            )}

            <p className="text-center text-xs text-ink-faint">
              The congregation&rsquo;s report goes to the branch office by the 20th of the month.
              Anything sent after that is added to the following month&rsquo;s report.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
