import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import {
  currentServiceYear, serviceYearMonths, serviceYearLabel, serviceYearOptions,
} from "@/lib/service-year";
import { PageHeader, Section, DataTable, Th, Td } from "@/components/shell";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>;
}) {
  await requirePermission("report:read");
  const sp = await searchParams;
  const serviceYear = Number(sp.sy) || currentServiceYear();
  const months = serviceYearMonths(serviceYear);

  const [publishers, reports] = await Promise.all([
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
      select: { id: true, pioneerStatus: true },
    }),
    prisma.serviceReport.findMany({
      where: { OR: months.map((m) => ({ year: m.year, month: m.month })) },
      select: {
        year: true, month: true, sharedInMinistry: true, bibleStudies: true,
        hours: true, pioneerStatusUsed: true, publisherId: true,
      },
    }),
  ]);

  const pioneerIds = new Set(publishers.filter((p) => p.pioneerStatus !== "NONE").map((p) => p.id));

  const rows = months.map((m) => {
    const inMonth = reports.filter((r) => r.year === m.year && r.month === m.month);
    const active = inMonth.filter((r) => r.sharedInMinistry);
    const auxiliaries = active.filter((r) => r.pioneerStatusUsed === "AUXILIARY").length;
    const regulars = active.filter(
      (r) => r.pioneerStatusUsed === "REGULAR" || r.pioneerStatusUsed === "SPECIAL",
    ).length;
    return {
      label: m.label,
      reported: inMonth.length,
      active: active.length,
      studies: active.reduce((t, r) => t + r.bibleStudies, 0),
      pioneerHours: active.reduce((t, r) => t + (r.hours ?? 0), 0),
      auxiliaries,
      regulars,
    };
  });

  return (
    <>
      <PageHeader
        title={`Field service summary · ${serviceYearLabel(serviceYear)}`}
        description="Congregation totals by month. Hours count pioneer service only, as the reporting arrangement requires."
        back={{ href: "/reports", label: "Report sheet" }}
        actions={
          <form method="get" className="flex items-center gap-2">
            <select name="sy" defaultValue={serviceYear} className="field-input py-1 text-xs" aria-label="Service year">
              {serviceYearOptions().map((y) => (
                <option key={y} value={y}>{serviceYearLabel(y)}</option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm">Show</Button>
          </form>
        }
      />

      <Section>
        <DataTable>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th align="right">Reports on file</Th>
              <Th align="right">Publishers active</Th>
              <Th align="right">Bible studies</Th>
              <Th align="right">Regular pioneers</Th>
              <Th align="right">Auxiliary pioneers</Th>
              <Th align="right">Pioneer hours</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <Td className="whitespace-nowrap">{r.label}</Td>
                <Td align="right">{r.reported || "—"}</Td>
                <Td align="right">{r.active || "—"}</Td>
                <Td align="right">{r.studies || "—"}</Td>
                <Td align="right">{r.regulars || "—"}</Td>
                <Td align="right">{r.auxiliaries || "—"}</Td>
                <Td align="right">{r.pioneerHours || "—"}</Td>
              </tr>
            ))}
            <tr className="bg-paper font-medium">
              <Td>Service year</Td>
              <Td align="right">{rows.reduce((t, r) => t + r.reported, 0)}</Td>
              <Td align="right">
                {Math.round(rows.reduce((t, r) => t + r.active, 0) / 12) || "—"}
                <span className="ml-1 text-xxs font-normal text-ink-faint">avg</span>
              </Td>
              <Td align="right">{rows.reduce((t, r) => t + r.studies, 0)}</Td>
              <Td align="right">{pioneerIds.size}</Td>
              <Td align="right">{rows.reduce((t, r) => t + r.auxiliaries, 0)}</Td>
              <Td align="right">{rows.reduce((t, r) => t + r.pioneerHours, 0)}</Td>
            </tr>
          </tbody>
        </DataTable>
      </Section>

      <p className="text-xs text-ink-faint">
        “Publishers active” counts everyone who reported sharing in the ministry that month.
        The service year row shows the monthly average.
      </p>
    </>
  );
}
