import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { reportingMonth, monthLabel } from "@/lib/service-year";
import { MobileReportList, type ReportRow } from "./mobile-report-list";

export const dynamic = "force-dynamic";

export default async function MobileReportPage() {
  await requirePermission("report:write");
  const rm = reportingMonth();

  const publishers = await prisma.publisher.findMany({
    where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      pioneerStatus: true,
      group: { select: { number: true, name: true } },
      reports: {
        where: { year: rm.year, month: rm.month },
        select: { outcome: true, bibleStudies: true, hours: true, pioneerStatusUsed: true, remarks: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const rows: ReportRow[] = publishers.map((p) => {
    const r = p.reports[0];
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      group: p.group ? `${p.group.number} — ${p.group.name}` : null,
      isPioneer: p.pioneerStatus !== "NONE",
      outcome: r ? r.outcome : null,
      studies: r ? r.bibleStudies : null,
      hours: r ? r.hours : null,
      aux: r ? r.pioneerStatusUsed === "AUXILIARY" : false,
      remarks: r ? r.remarks : null,
    };
  });

  return <MobileReportList rows={rows} month={rm} monthLabel={monthLabel(rm.year, rm.month)} />;
}
