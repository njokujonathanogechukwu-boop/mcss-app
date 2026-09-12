import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { MONTH_NAMES } from "@/lib/service-year";
import { analyse, defaultWindow, parsePeriod, periodKey, periodLabel, type Period } from "@/lib/analysis";
import { PageHeader, Section, DataTable, Th, Td, EmptyState } from "@/components/shell";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Month options for the pickers: five years back to the current month. */
function monthOptions(): Period[] {
  const now = new Date();
  const out: Period[] = [];
  for (let i = 0; i < 72; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; group?: string }>;
}) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const fallback = defaultWindow();
  let from = parsePeriod(sp.from) ?? fallback.from;
  let to = parsePeriod(sp.to) ?? fallback.to;
  if (from.year > to.year || (from.year === to.year && from.month > to.month)) [from, to] = [to, from];
  const groupId = sp.group || null;

  const [a, groups] = await Promise.all([
    analyse(from, to, groupId),
    prisma.serviceGroup.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
  ]);
  const t = a.totals;
  const query = `from=${periodKey(from)}&to=${periodKey(to)}${groupId ? `&group=${groupId}` : ""}`;
  const single = from.year === to.year && from.month === to.month;
  const title = single ? periodLabel(from) : `${periodLabel(from)} to ${periodLabel(to)}`;
  const groupName = groupId ? groups.find((g) => g.id === groupId) : null;
  const options = monthOptions();

  const cat = (label: string, c: { reports: number; hours: number; studies: number }, hours = true) => (
    <tr key={label}>
      <Td>{label}</Td>
      <Td align="right">{c.reports || "—"}</Td>
      <Td align="right">{hours ? c.hours || "—" : <span className="text-ink-faint">—</span>}</Td>
      <Td align="right">{c.studies || "—"}</Td>
    </tr>
  );

  return (
    <>
      <PageHeader
        title="Field service analysis"
        description="Pick any run of months and, if you like, one group. Totals follow the compiled report: regular pioneers, auxiliary pioneers, publishers, late reports."
        back={{ href: "/reports", label: "Report sheet" }}
        actions={
          can(user.role, "export:run") && (
            <>
              <a href={`/api/exports/analysis?${query}&format=csv`}>
                <Button variant="secondary" size="sm">Download CSV</Button>
              </a>
              <a href={`/api/exports/analysis?${query}&format=pdf`} target="_blank" rel="noopener">
                <Button size="sm">Download PDF</Button>
              </a>
            </>
          )
        }
      />

      <form method="get" className="mb-7 grid gap-3 rounded border border-rule bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="from" className="field-label">From</label>
          <select id="from" name="from" defaultValue={periodKey(from)} className="field-input">
            {options.map((p) => (
              <option key={periodKey(p)} value={periodKey(p)}>{MONTH_NAMES[p.month - 1]} {p.year}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="to" className="field-label">To</label>
          <select id="to" name="to" defaultValue={periodKey(to)} className="field-input">
            {options.map((p) => (
              <option key={periodKey(p)} value={periodKey(p)}>{MONTH_NAMES[p.month - 1]} {p.year}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="group" className="field-label">Group</label>
          <select id="group" name="group" defaultValue={groupId ?? ""} className="field-input">
            <option value="">Whole congregation</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.number} — {g.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" variant="secondary" className="w-full">Show</Button>
          <Link href="/reports/analysis" className="shrink-0"><Button type="button" variant="ghost">Reset</Button></Link>
        </div>
      </form>

      {t.onFile === 0 ? (
        <EmptyState title="No reports in that window" description="Widen the months, or check the report sheet for that period." />
      ) : (
        <>
          <Section
            title={`Compiled summary · ${title}${groupName ? ` · Group ${groupName.number}` : ""}`}
            description={`${t.onFile} reports on file across ${a.months.length} month${a.months.length === 1 ? "" : "s"} · ${t.activePublishers} publishers on the roster${single ? "" : ` · ${t.activeAverage} active per month on average`}.`}
          >
            <DataTable>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th align="right">Reports</Th>
                  <Th align="right">Hours</Th>
                  <Th align="right">Bible studies</Th>
                </tr>
              </thead>
              <tbody>
                {cat("Regular pioneers (RP)", t.regular)}
                {t.special.reports > 0 && cat("Special pioneers / field missionaries", t.special)}
                {cat("Auxiliary pioneers (AUX)", t.auxiliary)}
                {cat("Publishers (P)", t.publishers, false)}
                <tr>
                  <Td className="text-ink-soft">Late reports received in the window</Td>
                  <Td align="right" className="text-ink-soft">{t.lateReceived || "—"}</Td>
                  <Td align="right" className="text-ink-faint">—</Td>
                  <Td align="right" className="text-ink-faint">—</Td>
                </tr>
                <tr className="bg-paper font-medium">
                  <Td>Total</Td>
                  <Td align="right">{t.regular.reports + t.special.reports + t.auxiliary.reports + t.publishers.reports}</Td>
                  <Td align="right">{t.totalHours}</Td>
                  <Td align="right">{t.totalStudies}</Td>
                </tr>
              </tbody>
            </DataTable>
            <p className="mt-2 text-xs text-ink-faint">
              Reports count report-months: someone who reported in three of the months counts three
              times. Late reports are reports entered during the window for an earlier month; they
              are already inside the category totals for their own month.
            </p>
          </Section>

          {!single && (
            <Section title="By month">
              <DataTable>
                <thead>
                  <tr>
                    <Th>Month</Th>
                    <Th align="right">On file</Th>
                    <Th align="right">Active</Th>
                    <Th align="right">RP</Th>
                    <Th align="right">RP hrs</Th>
                    <Th align="right">AUX</Th>
                    <Th align="right">AUX hrs</Th>
                    <Th align="right">P</Th>
                    <Th align="right">Hours</Th>
                    <Th align="right">Studies</Th>
                    <Th align="right">Late</Th>
                  </tr>
                </thead>
                <tbody>
                  {a.months.map((m) => (
                    <tr key={m.label}>
                      <Td className="whitespace-nowrap">{m.label}</Td>
                      <Td align="right">{m.onFile || "—"}</Td>
                      <Td align="right">{m.active || "—"}</Td>
                      <Td align="right">{m.regular.reports + m.special.reports || "—"}</Td>
                      <Td align="right">{m.regular.hours + m.special.hours || "—"}</Td>
                      <Td align="right">{m.auxiliary.reports || "—"}</Td>
                      <Td align="right">{m.auxiliary.hours || "—"}</Td>
                      <Td align="right">{m.publishers.reports || "—"}</Td>
                      <Td align="right" className="font-medium">{m.totalHours || "—"}</Td>
                      <Td align="right">{m.totalStudies || "—"}</Td>
                      <Td align="right" className="text-ink-soft">{m.lateReceived || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Section>
          )}

          {!groupId && (
            <Section title="By group">
              <DataTable>
                <thead>
                  <tr>
                    <Th>Group</Th>
                    <Th align="right">Members</Th>
                    <Th align="right">RP</Th>
                    <Th align="right">RP hrs</Th>
                    <Th align="right">AUX</Th>
                    <Th align="right">AUX hrs</Th>
                    <Th align="right">P</Th>
                    <Th align="right">Hours</Th>
                    <Th align="right">Studies</Th>
                    <Th align="right"></Th>
                  </tr>
                </thead>
                <tbody>
                  {a.groups.map((g) => (
                    <tr key={g.id ?? "none"}>
                      <Td>{g.number ? `${g.number} — ${g.name}` : g.name}</Td>
                      <Td align="right">{g.members}</Td>
                      <Td align="right">{g.regular.reports + g.special.reports || "—"}</Td>
                      <Td align="right">{g.regular.hours + g.special.hours || "—"}</Td>
                      <Td align="right">{g.auxiliary.reports || "—"}</Td>
                      <Td align="right">{g.auxiliary.hours || "—"}</Td>
                      <Td align="right">{g.publishers.reports || "—"}</Td>
                      <Td align="right" className="font-medium">{g.totalHours || "—"}</Td>
                      <Td align="right">{g.totalStudies || "—"}</Td>
                      <Td align="right">
                        {g.id && (
                          <Link href={`/reports/analysis?from=${periodKey(from)}&to=${periodKey(to)}&group=${g.id}`} className="text-xs text-pine hover:underline">
                            Publishers
                          </Link>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Section>
          )}

          {(groupId || single) && (
            <Section
              title={groupName ? `Publishers in Group ${groupName.number}` : "By publisher"}
              description={single ? "Hours shows YES-style participation as a count of months; the figure is the hours reported where hours apply." : undefined}
            >
              <DataTable>
                <thead>
                  <tr>
                    <Th>Publisher</Th>
                    <Th>Group</Th>
                    <Th>Standing</Th>
                    <Th align="right">On file</Th>
                    <Th align="right">Active</Th>
                    <Th align="right">AUX months</Th>
                    <Th align="right">Hours</Th>
                    <Th align="right">Studies</Th>
                  </tr>
                </thead>
                <tbody>
                  {a.publishers.map((p) => (
                    <tr key={p.id}>
                      <Td><Link href={`/publishers/${p.id}`} className="text-ink hover:text-pine hover:underline">{p.name}</Link></Td>
                      <Td className="text-ink-soft">{p.group}</Td>
                      <Td className="text-ink-soft">{p.standing}</Td>
                      <Td align="right">{p.monthsOnFile}</Td>
                      <Td align="right">{p.monthsActive}</Td>
                      <Td align="right">{p.auxMonths || "—"}</Td>
                      <Td align="right">{p.hours || (p.monthsActive ? "YES" : "—")}</Td>
                      <Td align="right">{p.studies || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Section>
          )}
        </>
      )}
    </>
  );
}
