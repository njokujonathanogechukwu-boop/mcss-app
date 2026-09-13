import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td } from "@/components/shell";
import { Badge } from "@/components/ui";
import { CopyLinkButton } from "./copy-link";

export const dynamic = "force-dynamic";

export default async function PublisherLinksPage() {
  await requirePermission("publisher:write");

  const publishers = await prisma.publisher.findMany({
    where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      selfToken: true,
      group: { select: { number: true, name: true } },
    },
    orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Personal update links"
        description="Copy a link and send it to that publisher by WhatsApp or SMS. Each link opens only that person's own record and lets them correct their bio-data and emergency contact — nothing else."
        back={{ href: "/publishers", label: "Back to publishers" }}
      />

      <Section>
        <p className="mb-4 rounded border border-rule bg-surface px-4 py-3 text-sm text-ink-soft">
          Treat each link like a key: anyone holding it can edit that publisher&rsquo;s details, so
          send it to the publisher only. A link is created the first time you copy it and stays the
          same afterwards, so a publisher can keep using the one you sent.
        </p>
        <DataTable>
          <thead>
            <tr>
              <Th>Publisher</Th>
              <Th>Group</Th>
              <Th>Link</Th>
              <Th align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {publishers.map((p) => (
              <tr key={p.id} className="hover:bg-paper">
                <Td className="font-medium">{displayName(p)}</Td>
                <Td className="text-ink-soft">
                  {p.group ? `${p.group.number} — ${p.group.name}` : <span className="text-ink-faint">No group</span>}
                </Td>
                <Td>
                  {p.selfToken ? (
                    <Badge tone="good">Link created</Badge>
                  ) : (
                    <Badge tone="quiet">Not created yet</Badge>
                  )}
                </Td>
                <Td align="right">
                  <CopyLinkButton publisherId={p.id} />
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Section>
    </>
  );
}
