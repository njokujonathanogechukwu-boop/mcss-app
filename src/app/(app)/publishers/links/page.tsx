import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { ensureSelfTokens, requestOrigin } from "@/lib/self-service";
import { PageHeader, Section, DataTable, Th } from "@/components/shell";
import { Button } from "@/components/ui";
import { PublisherLinkRow } from "./copy-link";
import { EmailLinksButton } from "./email-links";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function PublisherLinksPage() {
  await requirePermission("publisher:write");

  const publishers = await prisma.publisher.findMany({
    where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      group: { select: { number: true, name: true } },
    },
    orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
  });

  const origin = await requestOrigin();

  // Tokens are created here, not on first copy, so every link can be shown and
  // exported straight away. It is idempotent, and a token grants nothing until
  // the link is actually sent to someone.
  const tokens = await ensureSelfTokens(publishers.map((p) => p.id));
  const rows: { id: string; name: string; group: string; url: string }[] = [];
  for (const p of publishers) {
    const token = tokens.get(p.id);
    if (!token || !origin) continue;
    rows.push({
      id: p.id,
      name: displayName(p),
      group: p.group ? `${p.group.number} — ${p.group.name}` : "No group",
      url: `${origin}/my/${token}`,
    });
  }

  return (
    <>
      <PageHeader
        title="Personal update links"
        description="Copy a link and send it to that publisher by WhatsApp or SMS. Each link opens only that person's own record and lets them correct their bio-data and emergency contact — nothing else."
        back={{ href: "/publishers", label: "Back to publishers" }}
        actions={
          <>
            <a href="/api/exports/self-links?format=pdf" target="_blank" rel="noopener">
              <Button variant="secondary" size="sm">Print QR sheet</Button>
            </a>
            <a href="/api/exports/self-links" target="_blank" rel="noopener">
              <Button variant="secondary" size="sm">Export links by group</Button>
            </a>
          </>
        }
      />

      <Section>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded border border-rule bg-surface px-4 py-3">
          <p className="max-w-xl text-sm text-ink-soft">
            Treat each link like a key: anyone holding it can edit that publisher&rsquo;s details, so
            send it to the publisher only. A link stays the same once created, so a publisher can keep
            using the one you sent. <span className="font-medium text-ink">Replace</span> gives them a
            new one and kills the old at once — do that if a link was forwarded, lost, or printed on a
            QR sheet that has gone astray, then send the publisher the new one.
          </p>
          <EmailLinksButton />
        </div>
        <DataTable>
          <thead>
            <tr>
              <Th>Publisher</Th>
              <Th>Group</Th>
              <Th>Personal link</Th>
              <Th align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PublisherLinkRow key={r.id} publisherId={r.id} name={r.name} group={r.group} url={r.url} />
            ))}
          </tbody>
        </DataTable>
      </Section>
    </>
  );
}
