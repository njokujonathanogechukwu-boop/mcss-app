import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { displayName, formatDateTime } from "@/lib/format";
import { PageHeader, Section, DataTable, Th, Td } from "@/components/shell";
import { Badge } from "@/components/ui";
import { NewUserForm, PasswordForm, FormUpload } from "./forms";
import { setUserRole, toggleUser, removeForm } from "./actions";
import { listTemplates, FORM_LABELS } from "@/lib/forms";
import { Button } from "@/components/ui";
import type { FormKind } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requirePermission("user:manage");

  const [users, publishers, audit, templates] = await Promise.all([
    prisma.user.findMany({
      include: { publisher: { select: { firstName: true, lastName: true } } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.publisher.findMany({
      where: { status: "ACTIVE" },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.auditLog.findMany({
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    listTemplates(),
  ]);
  const templateByKind = new Map(templates.map((t) => [t.kind, t]));
  const kinds: FormKind[] = ["S21", "S1", "S88"];

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Who can sign in, and what each of them is able to do. Give the narrowest access that lets someone do their work."
      />

      <Section title="People with accounts">
        <DataTable>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Access</Th>
              <Th>Last signed in</Th>
              <Th align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td>
                  {u.name}
                  {u.id === session.userId && <span className="ml-2"><Badge>You</Badge></span>}
                  {!u.active && <span className="ml-2"><Badge tone="bad">Suspended</Badge></span>}
                  {u.publisher && (
                    <span className="block text-xxs text-ink-faint">
                      Record: {displayName(u.publisher)}
                    </span>
                  )}
                </Td>
                <Td className="text-ink-soft">{u.email}</Td>
                <Td>
                  <form action={setUserRole} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={u.id} />
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="rounded border border-rule-strong bg-surface px-2 py-1 text-xs"
                      aria-label={`Access level for ${u.name}`}
                    >
                      {Object.entries(ROLE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <button className="text-xs text-pine hover:underline">Set</button>
                  </form>
                </Td>
                <Td className="text-xs text-ink-soft">{formatDateTime(u.lastLoginAt)}</Td>
                <Td align="right">
                  {u.id !== session.userId && (
                    <form action={toggleUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs text-ink-faint hover:text-clay">
                        {u.active ? "Suspend" : "Restore"}
                      </button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Add an account">
          <NewUserForm
            publishers={publishers.map((p) => ({ id: p.id, label: displayName(p) }))}
          />
        </Section>

        <Section title="Your password">
          <PasswordForm />
        </Section>
      </div>

      <Section
        title="Official forms"
        description="Upload the fillable PDFs from jw.org and every export is written onto the real form. Without one, the app prints its own layout with the same figures."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {kinds.map((kind) => {
            const t = templateByKind.get(kind);
            const { code, title } = FORM_LABELS[kind];
            return (
              <div key={kind} className="rounded border border-rule bg-surface p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-serif text-base text-ink">{code}</p>
                    <p className="text-xs text-ink-soft">{title}</p>
                  </div>
                  {t ? <Badge tone="good">On file</Badge> : <Badge>Built-in layout</Badge>}
                </div>
                {t && (
                  <div className="mb-4 rounded border border-rule bg-paper px-3 py-2 text-xs text-ink-soft">
                    <p className="truncate text-ink" title={t.fileName}>{t.fileName}</p>
                    <p>{t.fieldCount} fields · uploaded {formatDateTime(t.uploadedAt)}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <a href={`/api/forms/${kind}?mode=test`} target="_blank" rel="noopener" className="text-pine hover:underline">Download field check</a>
                      <a href={`/api/forms/${kind}`} target="_blank" rel="noopener" className="text-pine hover:underline">Original</a>
                      <form action={removeForm}>
                        <input type="hidden" name="kind" value={kind} />
                        <button className="text-ink-faint hover:text-clay">Remove</button>
                      </form>
                    </div>
                  </div>
                )}
                <FormUpload kind={kind} code={code} title={title} />
              </div>
            );
          })}
        </div>
        <p className="mt-3 max-w-[70ch] text-xs text-ink-faint">
          The app finds each box on the form by where it sits on the page, so a new edition of a
          form usually works unchanged. The field check download fills every box with its own
          name; if an export ever puts a figure in the wrong place, that file shows why.
        </p>
      </Section>

      <Section
        title="Backup"
        description="Everything the congregation has entered, as one file. Keep a copy somewhere safe from time to time; the database itself is also backed up daily by Supabase."
      >
        <a href="/api/exports/backup" target="_blank" rel="noopener">
          <Button variant="secondary" size="sm">Download a full backup (JSON)</Button>
        </a>
      </Section>

      <Section title="Recent activity" description="Every change to the records is logged here.">
        <ul className="divide-y divide-rule rounded border border-rule bg-surface text-sm">
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="text-ink-soft">
                <span className="text-ink">{a.actor?.name ?? "System"}</span> {a.action} — {a.summary}
              </span>
              <span className="text-xs text-ink-faint">{formatDateTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
