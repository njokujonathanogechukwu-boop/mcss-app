import { groupByToken, groupTitle, outstandingForGroup } from "@/lib/group-reports";
import { monthLabel, reportingMonth } from "@/lib/service-year";
import { GroupReportList } from "./group-report-list";

export const dynamic = "force-dynamic";

/**
 * A field service group's own page, behind the link the secretary emails to the
 * overseer. No account and no password: the token in the address is the whole
 * authority, and the page can only record a month that has nothing on file yet.
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

  const fallback = reportingMonth();
  const [yStr, mStr] = (sp.period ?? `${fallback.year}-${fallback.month}`).split("-");
  const year = Number(yStr) || fallback.year;
  const month = Number(mStr) || fallback.month;

  const rows = group ? await outstandingForGroup(group.id, year, month) : [];

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto grid max-w-2xl gap-6">
        <header className="grid gap-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Maitama Congregation
          </p>
          <h1 className="font-serif text-2xl text-ink">
            Send your group&rsquo;s field service reports
          </h1>
          {group && (
            <p className="text-sm text-ink-soft">
              {groupTitle(group)} &middot; {monthLabel(year, month)}
            </p>
          )}
        </header>

        {!group ? (
          <div className="rounded border border-clay/40 bg-clay-light px-6 py-8 text-center">
            <p className="font-serif text-lg text-clay">This link is not valid</p>
            <p className="mt-1 text-sm text-ink-soft">
              The link may have been replaced. Please contact the secretary for a new one.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-pine/40 bg-pine-light px-6 py-8 text-center">
            <p className="font-serif text-lg text-pine-dark">
              Nothing is outstanding for {monthLabel(year, month)}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Every publisher in {groupTitle(group)} is already recorded for that month. If one of
              these reports is wrong, please tell the secretary.
            </p>
          </div>
        ) : (
          <>
            <p className="rounded border border-rule bg-surface px-4 py-3 text-sm text-ink-soft">
              Only the publishers below still have nothing recorded for {monthLabel(year, month)}.
              Open one, choose what their month was, and press send — each is recorded straight away.
              A report the secretary has already entered is not listed and cannot be changed here.
            </p>

            <GroupReportList
              rows={rows}
              token={token}
              year={year}
              month={month}
              monthLabel={monthLabel(year, month)}
            />

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
