import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { schoolDocuments } from "@/lib/school-queries";
import { PageHeader, Section } from "@/components/shell";
import { SchoolTabs } from "../tabs";
import { DocumentTable } from "../document-list";
import { UploadDocumentsForm, type ScopeOption } from "../document-forms";

export const dynamic = "force-dynamic";

/**
 * The schedules printed before this app existed — Word files, PDFs and
 * photographs of the noticeboard — kept with the ones the app prints, so a
 * student's history reaches back further than the database does.
 */
export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission("school:read");
  const canWrite = can(user.role, "school:write");
  const { period } = await searchParams;

  const [periods, documents] = await Promise.all([
    prisma.midweekPeriod.findMany({
      orderBy: [{ startYear: "desc" }, { startMonth: "desc" }],
      select: { id: true, label: true, _count: { select: { documents: true } } },
    }),
    schoolDocuments(period ? { periodId: period } : undefined),
  ]);

  const options: ScopeOption[] = periods.map((p) => ({ value: `period:${p.id}`, label: p.label }));

  return (
    <>
      <PageHeader
        title="Archive"
        description="Every document filed with the school: the schedules the app printed, and the ones from before it."
      />

      <SchoolTabs />

      {canWrite && (
        <Section title="Upload" description="Word, PDF and photographs, up to 10 MB each. Several at once is fine.">
          <UploadDocumentsForm options={options} />
        </Section>
      )}

      <Section
        title="Filed"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/school/archive"
              className={`rounded px-2 py-1 text-xs ${!period ? "bg-pine-light font-medium text-pine-dark" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
            >
              All
            </Link>
            {periods.map((p) => (
              <Link
                key={p.id}
                href={`/school/archive?period=${p.id}`}
                className={`rounded px-2 py-1 text-xs ${period === p.id ? "bg-pine-light font-medium text-pine-dark" : "text-ink-soft hover:bg-paper hover:text-ink"}`}
              >
                {p.label} ({p._count.documents})
              </Link>
            ))}
          </div>
        }
      >
        <DocumentTable
          documents={documents}
          canWrite={canWrite}
          empty={period ? "Nothing is filed under this schedule yet." : undefined}
        />
      </Section>
    </>
  );
}
