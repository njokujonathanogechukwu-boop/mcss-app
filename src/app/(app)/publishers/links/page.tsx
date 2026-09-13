import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { ensureSelfToken, requestOrigin } from "@/lib/self-service";
import { PageHeader, Section, DataTable, Th, Td } from "@/components/shell";
import { Button } from "@/components/ui";
import { CopyLinkButton } from "./copy-link";
import { EmailLinksButton } from "./email-links";

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

  const origin = await requestOrigin();

  // Tokens are created here, not on first copy, so every link can be shown and
  // exported straight away. It is idempotent, and a token grants nothing until
  // the link is actually sent to someone.
  const rows: { id: string; name: string; group: string; url: string }[] = [];
  for (const p of publishers) {
    const token = p.selfToken ?? (await ensureSelfToken(p.id));
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
            using the one you sent.
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
              <tr key={r.id} className="hover:bg-paper">
                <Td className="font-medium whitespace-nowrap">{r.name}</Td>
                <Td className="text-ink-soft whitespace-nowrap">{r.group}</Td>
                <Td>
                  <input
                    readOnly
                    value={r.url}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={`Update link for ${r.name}`}
                    className="field-input w-full min-w-[16rem] font-mono text-xs"
                  />
                </Td>
                <Td align="right">
                  <CopyLinkButton url={r.url} />
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Section>
    </>
  );
}
