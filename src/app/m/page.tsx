import Link from "next/link";
import { ClipboardList, ClipboardCheck, ArrowRight, Monitor } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { reportingMonth, monthLabel } from "@/lib/service-year";

export const dynamic = "force-dynamic";

export default async function MobileHome() {
  const user = await requirePermission("report:read");
  const rm = reportingMonth();
  const canReport = can(user.role, "report:write");
  const canRecords = can(user.role, "publisher:read");

  const [activeCount, reportedCount] = await Promise.all([
    prisma.publisher.count({ where: { status: { in: ["ACTIVE", "IRREGULAR"] } } }),
    prisma.serviceReport.count({ where: { year: rm.year, month: rm.month } }),
  ]);
  const outstanding = Math.max(0, activeCount - reportedCount);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-xl text-ink">Good to see you, {user.name.split(" ")[0]}.</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Collecting reports for <span className="font-medium text-ink">{monthLabel(rm.year, rm.month)}</span>.
        </p>
      </div>

      <div className="rounded-lg border border-rule bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <p className="font-serif text-3xl text-ink">{outstanding}</p>
          <p className="text-xs text-ink-soft">of {activeCount} still to report</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
          <div
            className="h-full rounded-full bg-pine transition-all"
            style={{ width: `${activeCount ? Math.round((reportedCount / activeCount) * 100) : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {canReport && (
          <Link
            href="/m/report"
            className="flex items-center gap-4 rounded-lg border border-rule bg-surface p-4 transition-colors hover:border-pine"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pine-light text-pine">
              <ClipboardList size={22} aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block font-medium text-ink">Submit a report</span>
              <span className="block text-xs text-ink-soft">Field service for one publisher at a time</span>
            </span>
            <ArrowRight size={18} className="text-ink-faint" aria-hidden />
          </Link>
        )}

        {canRecords && (
          <Link
            href="/m/records"
            className="flex items-center gap-4 rounded-lg border border-rule bg-surface p-4 transition-colors hover:border-pine"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pine-light text-pine">
              <ClipboardCheck size={22} aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block font-medium text-ink">Update records</span>
              <span className="block text-xs text-ink-soft">Fix missing bio-data, contact and groups</span>
            </span>
            <ArrowRight size={18} className="text-ink-faint" aria-hidden />
          </Link>
        )}
      </div>

      <Link
        href="/dashboard"
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-rule py-3 text-xs text-ink-soft hover:text-ink"
      >
        <Monitor size={15} aria-hidden />
        Switch to the full desktop system
      </Link>
    </div>
  );
}
