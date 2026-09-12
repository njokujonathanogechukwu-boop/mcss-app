import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { formatDate, STATUS_LABELS } from "@/lib/format";
import { nameKey } from "@/lib/import-reports";
import { PageHeader, Section, EmptyState, DataTable, Th, Td } from "@/components/shell";
import { MergeForm, type MergeCandidate } from "./merge-form";

export const dynamic = "force-dynamic";

/**
 * Without ids: every pair of records that look like the same person.
 * With ?a=&b=: the two records side by side, ready to merge.
 */
export default async function MergePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  await requirePermission("publisher:delete");
  const { a: aId, b: bId } = await searchParams;

  if (aId && bId) {
    const load = (id: string) =>
      prisma.publisher.findUnique({
        where: { id },
        include: {
          group: { select: { number: true, name: true } },
          userAccount: { select: { id: true } },
          _count: { select: { reports: true, privilegeAssignments: true } },
        },
      });
    const [a, b] = await Promise.all([load(aId), load(bId)]);
    if (!a || !b || a.id === b.id) notFound();

    const [ra, rb] = await Promise.all([
      prisma.serviceReport.findMany({ where: { publisherId: a.id }, select: { year: true, month: true } }),
      prisma.serviceReport.findMany({ where: { publisherId: b.id }, select: { year: true, month: true } }),
    ]);
    const months = new Set(ra.map((r) => `${r.year}-${r.month}`));
    const overlap = rb.filter((r) => months.has(`${r.year}-${r.month}`)).length;

    const candidate = (p: NonNullable<typeof a>): MergeCandidate => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      group: p.group ? `${p.group.number} — ${p.group.name}` : "—",
      standing: STATUS_LABELS[p.status],
      baptized: p.isBaptized ? formatDate(p.baptismDate) : "—",
      reports: p._count.reports,
      privileges: p._count.privilegeAssignments,
      hasAccount: Boolean(p.userAccount),
      created: formatDate(p.createdAt),
    });

    return (
      <>
        <PageHeader
          title="Merge two records"
          description="Pick the record to keep. Everything on the other one moves across, then it is deleted."
          back={{ href: "/publishers/merge", label: "Possible duplicates" }}
        />
        <Section>
          <MergeForm a={candidate(a)} b={candidate(b)} overlap={overlap} />
        </Section>
      </>
    );
  }

  const publishers = await prisma.publisher.findMany({
    select: { id: true, firstName: true, lastName: true, status: true, group: { select: { number: true } }, _count: { select: { reports: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  // Same name in any order, ignoring case and punctuation.
  const byKey = new Map<string, typeof publishers>();
  for (const p of publishers) {
    const k = nameKey(`${p.firstName} ${p.lastName}`);
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  const pairs: [typeof publishers[number], typeof publishers[number]][] = [];
  for (const group of byKey.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) pairs.push([group[i], group[j]]);
  }

  return (
    <>
      <PageHeader
        title="Possible duplicates"
        description="Records that share a name. Two people in the congregation can genuinely share a name, so check before merging."
        back={{ href: "/publishers", label: "Publishers" }}
      />

      {pairs.length === 0 ? (
        <EmptyState
          title="No duplicates found"
          description="No two records share a name. To merge two records with different spellings, open one of them and use “Merge with another record”."
        />
      ) : (
        <Section title={`${pairs.length} pair${pairs.length === 1 ? "" : "s"} to check`}>
          <DataTable>
            <thead>
              <tr>
                <Th>Record</Th>
                <Th>Group</Th>
                <Th>Standing</Th>
                <Th align="right">Reports</Th>
                <Th>Record</Th>
                <Th>Group</Th>
                <Th>Standing</Th>
                <Th align="right">Reports</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {pairs.map(([x, y]) => (
                <tr key={`${x.id}-${y.id}`}>
                  <Td><Link href={`/publishers/${x.id}`} className="text-ink hover:text-pine hover:underline">{x.firstName} {x.lastName}</Link></Td>
                  <Td className="text-ink-soft">{x.group?.number ?? "—"}</Td>
                  <Td className="text-ink-soft">{STATUS_LABELS[x.status]}</Td>
                  <Td align="right">{x._count.reports}</Td>
                  <Td><Link href={`/publishers/${y.id}`} className="text-ink hover:text-pine hover:underline">{y.firstName} {y.lastName}</Link></Td>
                  <Td className="text-ink-soft">{y.group?.number ?? "—"}</Td>
                  <Td className="text-ink-soft">{STATUS_LABELS[y.status]}</Td>
                  <Td align="right">{y._count.reports}</Td>
                  <Td align="right">
                    <Link href={`/publishers/merge?a=${x.id}&b=${y.id}`} className="text-xs text-pine hover:underline">Merge…</Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Section>
      )}
    </>
  );
}
