import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { emailFrom, mailDiagnostics, mailProvider } from "@/lib/email";
import { audienceOptions } from "@/lib/mail-audience";
import { formatDate, formatDateTime } from "@/lib/format";
import { PageHeader, Section, EmptyState, DataTable, Th, Td, Panel } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { ComposeForm } from "./compose-form";
import { TestMailForm } from "./test-form";

export const dynamic = "force-dynamic";
// A congregation-wide mail goes out one message at a time; the page's action
// needs the whole of the function's budget to finish it.
export const maxDuration = 60;

const KIND_LABEL: Record<string, string> = {
  REMINDER: "Report reminder",
  UPDATE_LINK: "Update link",
  ANNOUNCEMENT: "Announcement",
  ACCOUNT: "New account",
  GENERAL: "Written here",
};

const SETUP_STEPS = [
  "Create a Gmail account for the congregation, for example maitamasecretary@gmail.com.",
  "Turn on 2-Step Verification for that account (Google → Security → 2-Step Verification). Without it Google will not issue an app password and will refuse every sign-in.",
  "Create an app password (Google → Security → App passwords). It is 16 letters; spaces in it are removed for you.",
  "In Vercel → your project → Settings → Environment variables, add MAIL_USER (the address) and MAIL_APP_PASSWORD (the app password) for Production.",
  "Redeploy. A variable added in Vercel does not reach the running app until the next deployment.",
  "Press Test the connection below and read what it says.",
];

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ announcement?: string }>;
}) {
  const user = await requirePermission("mail:send");
  const sp = await searchParams;

  const [options, recent, announcement] = await Promise.all([
    audienceOptions(),
    prisma.outboundMail.findMany({ orderBy: { createdAt: "desc" }, take: 25 }),
    sp.announcement
      ? prisma.announcement.findUnique({ where: { id: sp.announcement } })
      : Promise.resolve(null),
  ]);

  const provider = mailProvider();
  const d = mailDiagnostics();

  return (
    <>
      <PageHeader
        title="Email"
        description="Write one message here and it goes out from the congregation's own mail account — to a typed list, to one service group, or to every publisher who has an email address."
        actions={
          <>
            <Link href="/reports/reminders">
              <Button variant="secondary" size="sm">Overseer reminders</Button>
            </Link>
            <Link href="/publishers/links">
              <Button variant="secondary" size="sm">Personal update links</Button>
            </Link>
          </>
        }
      />

      <Section>
        <Panel className="p-4">
          {provider === "gmail" ? (
            <>
              <p className="text-sm text-ink">
                Sending through Gmail as <span className="font-medium">{emailFrom()}</span>
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                Gmail allows about 500 recipients a day from this account. Reminders and personal
                update links count towards the same allowance, so a congregation-wide mail is best
                sent on a day when nothing else goes out.
              </p>
            </>
          ) : provider === "resend" ? (
            <>
              <p className="text-sm text-ink">
                Sending through Resend as <span className="font-medium">{emailFrom()}</span>
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                No Gmail account is set up yet, so mail falls back to Resend — and its test sender
                only reaches the Resend account&rsquo;s own inbox until a domain is verified.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-clay">No mail account is connected yet</p>
              <p className="mt-1 text-xs text-ink-soft">
                Until this is done, nothing on the platform can send an email — reminders and personal
                update links stay copy-and-WhatsApp only. Set it up once:
              </p>
              <ol className="mt-2.5 list-decimal space-y-1 pl-5 text-xs text-ink-soft">
                {SETUP_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-ink-faint">
                Paste the app password into Vercel only — never into a chat, an email or a file in
                this project.
              </p>
            </>
          )}
        </Panel>
      </Section>

      <Section
        title="Is it working?"
        description="Signs in to the mail account and sends one test message to an address you choose. Nothing goes to any publisher."
      >
        <div className="space-y-4">
          <p className="rounded border border-rule bg-paper px-3 py-2 text-xs text-ink-soft">
            What this deployment can see:{" "}
            <span className={d.user ? "text-ink" : "text-clay"}>
              MAIL_USER {d.user ?? "not set"}
            </span>
            {" · "}
            <span className={d.passwordChars ? "text-ink" : "text-clay"}>
              MAIL_APP_PASSWORD {d.passwordChars ? `${d.passwordChars} characters` : "not set"}
            </span>
            {" · "}
            <span className={d.resendKey ? "text-ink" : "text-ink-faint"}>
              RESEND_API_KEY {d.resendKey ? "set" : "not set"}
            </span>
          </p>

          {!d.provider && (
            <p className="text-xs text-clay">
              Nothing can send until both MAIL_USER and MAIL_APP_PASSWORD are set here, and set for
              the Production environment. After adding them, redeploy — an environment variable only
              reaches the app on the next deployment, so the current one carries on with the old
              settings.
            </p>
          )}
          {d.passwordChars > 0 && d.passwordChars !== 16 && (
            <p className="text-xs text-clay">
              A Gmail app password is 16 letters. What reached this deployment is {d.passwordChars}{" "}
              characters, so it is probably not the whole password. Spaces are removed for you, so
              paste it exactly as Google shows it.
            </p>
          )}

          <TestMailForm ownEmail={user.email} />
        </div>
      </Section>

      {provider ? (
        <Section title="Write and send">
          <ComposeForm
            groups={options.groups}
            congregation={options.congregation}
            withoutEmail={options.withoutEmail}
            kind={announcement ? "ANNOUNCEMENT" : "GENERAL"}
            initialSubject={announcement?.title}
            initialBody={
              announcement
                ? [
                    announcement.body,
                    announcement.eventDate ? `Date: ${formatDate(announcement.eventDate)}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n\n")
                : undefined
            }
          />
        </Section>
      ) : null}

      <Section
        title={`Recently sent${recent.length ? ` · ${recent.length}` : ""}`}
        description="Every email the platform has put out, including the reminders and update links sent from their own pages. Failed sends keep the reason."
      >
        {recent.length === 0 ? (
          <EmptyState
            title="Nothing sent yet"
            description="Once a mail goes out — from here, from reminders, or from the personal update links — it is listed here with its outcome."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>To</Th>
                <Th>Subject</Th>
                <Th>What it was</Th>
                <Th align="right">Outcome</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((m) => (
                <tr key={m.id} className="hover:bg-paper">
                  <Td className="whitespace-nowrap text-xs text-ink-faint">{formatDateTime(m.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-ink-soft">{m.to}</Td>
                  <Td className="max-w-[28ch] truncate text-ink">{m.subject}</Td>
                  <Td className="whitespace-nowrap">
                    <Badge tone="neutral">{KIND_LABEL[m.kind] ?? m.kind}</Badge>
                  </Td>
                  <Td align="right">
                    {m.ok ? (
                      <Badge tone="good">Sent · {m.provider}</Badge>
                    ) : (
                      <div>
                        <Badge tone="bad">Failed</Badge>
                        {m.error && <p className="mt-1 text-xxs text-clay">{m.error}</p>}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Section>
    </>
  );
}
