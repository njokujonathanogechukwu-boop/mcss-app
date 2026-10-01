import type { S1Summary } from "@/lib/pdf/s1";

/**
 * The month's figures in the order JW Hub's Field Service form asks for them
 * (S-1), so the secretary can type them across box by box.
 */
export function HubFigures({ s, outstanding }: { s: S1Summary; outstanding: number }) {
  const box = (label: string, value: number | string | null, hint?: string) => (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="mt-0.5 font-serif text-xl text-ink">{value ?? "—"}</dd>
      {hint && <p className="text-xxs text-ink-faint">{hint}</p>}
    </div>
  );
  const group = (title: string, children: React.ReactNode) => (
    <div className="rounded border border-rule bg-paper p-3">
      <p className="mb-2 text-sm font-medium text-ink">{title}</p>
      <dl className="grid grid-cols-3 gap-3">{children}</dl>
    </div>
  );

  return (
    <section className="mb-6 rounded border border-rule bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg text-ink">For JW Hub · {s.monthLabel}</h2>
        <p className="text-xs text-ink-faint">Field Service and Meeting Attendance (S-1), in the hub&rsquo;s order.</p>
      </div>

      {outstanding > 0 && !s.closed && (
        <p className="mb-3 rounded bg-wheat-light px-3 py-2 text-xs text-[#7A5E1E]">
          {outstanding} publisher{outstanding === 1 ? " has" : "s have"} not reported yet, so these figures will
          still change.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-rule bg-paper p-3">
          <dl className="grid grid-cols-2 gap-3">
            {box("All active publishers", s.activePublishers, "Reported at least once in the last 6 months")}
            {box(
              "Average weekend meeting attendance",
              s.weekendAverage ?? null,
              s.weekendMeetings
                ? `Over ${s.weekendMeetings} weekend meeting${s.weekendMeetings === 1 ? "" : "s"}`
                : "No weekend attendance recorded yet",
            )}
          </dl>
        </div>
        {group("Publishers", <>
          {box("Number of reports", s.rows.publishers.reports)}
          {box("Bible studies", s.rows.publishers.studies)}
        </>)}
        {group("Auxiliary pioneers", <>
          {box("Number of reports", s.rows.auxiliary.reports)}
          {box("Hours", s.rows.auxiliary.hours)}
          {box("Bible studies", s.rows.auxiliary.studies)}
        </>)}
        {group("Regular pioneers", <>
          {box("Number of reports", s.rows.regular.reports)}
          {box("Hours", s.rows.regular.hours)}
          {box("Bible studies", s.rows.regular.studies)}
        </>)}
      </div>

      <p className="mt-3 text-xxs text-ink-faint">
        Only those who shared in the ministry are counted in the reports.
        {s.lateCount > 0 && ` Includes ${s.lateCount} late report${s.lateCount === 1 ? "" : "s"} from earlier months.`}{" "}
        Special pioneers report to the branch directly and are left out, as on the S-1.
      </p>
    </section>
  );
}
