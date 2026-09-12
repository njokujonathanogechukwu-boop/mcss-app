import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { currentServiceYear, serviceYearMonths, serviceYearLabel, serviceYearOptions } from "@/lib/service-year";
import { analyse, periodKey } from "@/lib/analysis";
import { PageHeader, Section, DataTable, Th, Td } from "@/components/shell";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const serviceYear = Number(sp.sy) || currentServiceYear();
  const months = serviceYearMonths(serviceYear);
  const from = { year: months[0].year, month: months[0].month };
  const to = { year: months[11].year, month: months[11].month };

  const a = await analyse(from, to);
  const t = a.totals;
  const query = `from=${periodKey(from)}&to=${periodKey(to)}`;

  return (
    <>
      <PageHeader
        title={`Field service summary · ${serviceYearLabel(serviceYear)}`}
        description="Congregation totals by month. Hours are shown for regular pioneers and for the months publishers served as auxiliary pioneers."
        back={{ href: "/reports", label: "Report sheet" }}
        actions={
          <>
            <form method="get" className="flex items-center gap-2">
              <select name="sy" defaultValue={serviceYear} className="field-input py-1 text-xs" aria-label="Service year">
                {serviceYearOptions().map((y) => (
                  <option key={y} value={y}>{serviceYearLabel(y)}</option>
                ))}
              </select>
              <Button type="submit" variant="secondary" size="sm">Show</Button>
            </form>
            <Link href={`/reports/analysis?${query}`}>
              <Button variant="secondary" size="sm">Open in analysis</Button>
            </Link>
            {can(user.role, "export:run") && (
              <a href={`/api/exports/analysis?${query}&format=pdf`} target="_blank" rel="noopener">
                <Button size="sm">Download PDF</Button>
              </a>
            )}
          </>
        }
      />

      <Section>
        <DataTable>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th align="right">Reports on file</Th>
              <Th align="right">Active</Th>
              <Th align="right">Publishers</Th>
              <Th align="right">Regular pioneers</Th>
              <Th align="right">RP hours</Th>
              <Th align="right">Auxiliary pioneers</Th>
              <Th align="right">Aux hours</Th>
              <Th align="right">All hours</Th>
              <Th align="right">Bible studies</Th>
            </tr>
          </thead>
          <tbody>
            {a.months.map((m) => (
              <tr key={m.label}>
                <Td className="whitespace-nowrap">{m.label}</Td>
                <Td align="right">{m.onFile || "—"}</Td>
                <Td align="right">{m.active || "—"}</Td>
                <Td align="right">{m.publishers.reports || "—"}</Td>
                <Td align="right">{m.regular.reports + m.special.reports || "—"}</Td>
                <Td align="right">{m.regular.hours + m.special.hours || "—"}</Td>
                <Td align="right">{m.auxiliary.reports || "—"}</Td>
                <Td align="right">{m.auxiliary.hours || "—"}</Td>
                <Td align="right" className="font-medium">{m.totalHours || "—"}</Td>
                <Td align="right">{m.totalStudies || "—"}</Td>
              </tr>
            ))}
            <tr className="bg-paper font-medium">
              <Td>Service year</Td>
              <Td align="right">{t.onFile}</Td>
              <Td align="right">
                {t.activeAverage || "—"}
                <span className="ml-1 text-xxs font-normal text-ink-faint">avg</span>
              </Td>
              <Td align="right">{t.publishers.reports}</Td>
              <Td align="right">{t.regular.reports + t.special.reports}</Td>
              <Td align="right">{t.regular.hours + t.special.hours}</Td>
              <Td align="right">{t.auxiliary.reports}</Td>
              <Td align="right">{t.auxiliary.hours}</Td>
              <Td align="right">{t.totalHours}</Td>
              <Td align="right">{t.totalStudies}</Td>
            </tr>
          </tbody>
        </DataTable>
      </Section>

      <p className="text-xs text-ink-faint">
        “Active” counts everyone who reported sharing in the ministry that month. Pioneer columns
        count reports, so a publisher who auxiliary pioneered in two months counts twice. The
        service year row shows the monthly average for “Active” and totals elsewhere.
      </p>
    </>
  );
}
