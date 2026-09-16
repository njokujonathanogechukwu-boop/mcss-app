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
  "In Google Cloud (console.cloud.google.com) create a project and enable the Gmail API for it.",
  "Under OAuth consent screen choose External, fill in the app name and your email, and set Publishing status to In production — left in Testing, the token stops working after 7 days.",
  "Under Credentials create an OAuth client ID of type Web application and add https://developers.google.com/oauthplayground as an authorised redirect URI. Note the client ID and secret.",
  "At developers.google.com/oauthplayground tick 'Use your own OAuth credentials', enter that ID and secret, authorise the scope https://mail.google.com/ signed in as the congregation account, then exchange the code for a refresh token.",
  "In Vercel → your project → Settings → Environment variables add MAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN for Production, then redeploy.",
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
                Signed in with OAuth2, so Google accepts it from the server without a password or a
                domain. Gmail allows about 500 recipients a day from this account, so a
                congregation-wide mailing is fine but several in one day are not.
              </p>
            </>
          ) : provider === "resend" ? (
            <>
              <p className="text-sm text-ink">
                Sending through Resend as <span className="font-medium">{emailFrom()}</span>
              </p>
              {d.usingTestSender ? (
                <p className="mt-1 text-xs text-clay">
                  This is still Resend&rsquo;s test sender, which only reaches your own Resend inbox.
                  Verify a domain at resend.com/domains and set REMINDER_EMAIL_FROM to an address on
                  it, then redeploy, before mailing any publisher.
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-faint">
                  Resend&rsquo;s free tier sends up to 100 emails a day and 3,000 a month.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-clay">No mail account is connected yet</p>
              <p className="mt-1 text-xs text-ink-soft">
                Until this is done, nothing on the platform can send an email — reminders and personal
                update links stay copy-and-WhatsApp only. The congregation Gmail account signs in with
                OAuth2: no password and no domain to buy. Set it up once:
              </p>
              <ol className="mt-2.5 list-decimal space-y-1 pl-5 text-xs text-ink-soft">
                {SETUP_STEPS.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-ink-faint">
                Paste the client secret and refresh token into Vercel only — never into a chat, an
                email or a file in this project. (Rather use a sending service? Set RESEND_API_KEY
                instead and the Resend route takes over.)
              </p>
            </>
          )}
        </Panel>
      </Section>

      <Section
        title="Is it working?"
        description="Signs in to the mail service and sends one test message to an address you choose. Nothing goes to any publisher."
      >
        <div className="space-y-4">
          <p className="rounded border border-rule bg-paper px-3 py-2 text-xs text-ink-soft">
            What this deployment can see:{" "}
            <span className={d.gmailUser ? "text-ink" : "text-clay"}>MAIL_USER {d.gmailUser ?? "not set"}</span>
            {" · "}
            <span className={d.gmailClientId ? "text-ink" : "text-clay"}>GMAIL_CLIENT_ID {d.gmailClientId ? "set" : "not set"}</span>
            {" · "}
            <span className={d.gmailClientSecret ? "text-ink" : "text-clay"}>GMAIL_CLIENT_SECRET {d.gmailClientSecret ? "set" : "not set"}</span>
            {" · "}
            <span className={d.gmailRefreshToken ? "text-ink" : "text-clay"}>GMAIL_REFRESH_TOKEN {d.gmailRefreshToken ? "set" : "not set"}</span>
            {" · "}
            <span className={d.resendKey ? "text-ink" : "text-ink-faint"}>RESEND_API_KEY {d.resendKey ? "set" : "not set"}</span>
          </p>

          {!d.provider && (
            <p className="text-xs text-clay">
              Nothing can send until a complete setup reaches the Production environment: for Gmail,
              all of MAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN; or for
              Resend, just RESEND_API_KEY. After adding them, redeploy — an environment variable only
              reaches the app on the next deployment, so the current one carries on with the old
              settings.
            </p>
          )}
          {d.provider === "resend" && d.usingTestSender && (
            <p className="text-xs text-clay">
              Mail is going out from Resend&rsquo;s test sender ({d.from}), which only delivers to your
              own Resend inbox. To reach publishers, verify a domain at resend.com/domains, set
              REMINDER_EMAIL_FROM to an address on it, and redeploy.
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
