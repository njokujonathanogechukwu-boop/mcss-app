import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { currentServiceYear, reportingMonth, serviceYearMonths } from "@/lib/service-year";
import { EmptyState, PageHeader, Section } from "@/components/shell";
import { Button } from "@/components/ui";
import { emailConfigured } from "@/lib/email";
import { addressed, gatherReminders, waHref } from "@/lib/reminders";
import { ReminderCard } from "./reminder-card";
import { SendNow } from "./send-now";

export const dynamic = "force-dynamic";

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;

  const fallback = reportingMonth();
  const [yStr, mStr] = (sp.period ?? `${fallback.year}-${fallback.month}`).split("-");
  const year = Number(yStr) || fallback.year;
  const month = Number(mStr) || fallback.month;
  const showContact = can(user.role, "publisher:readContact");

  const { label, groups, totalMissing } = await gatherReminders(year, month);

  const cards = groups.map((g) => ({
    key: g.key,
    title: g.title,
    meta: [
      `${g.missing.length} of ${g.members} yet to report`,
      g.who ? `Overseer: ${g.who}` : "No overseer on file",
      g.assistant ? `Assistant: ${addressed(g.assistant)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    message: g.message,
    hasEmail: g.emails.length > 0,
    waHref: showContact ? waHref(g.overseer?.phone, g.message) : null,
  }));

  const periodOptions = [
    ...serviceYearMonths(currentServiceYear()),
    ...serviceYearMonths(currentServiceYear() - 1),
  ];

  const emailReady = emailConfigured();
  const cronReady = Boolean(process.env.CRON_SECRET);

  return (
    <>
      <PageHeader
        title="Reminders for the field service overseers"
        description={`${totalMissing} publisher${totalMissing === 1 ? "" : "s"} still to report for ${label}, across ${groups.length} group${groups.length === 1 ? "" : "s"}.`}
        back={{ href: "/reports", label: "Report sheet" }}
      />

      <div
        className={`mb-6 rounded border px-4 py-3 text-sm ${
          emailReady && cronReady
            ? "border-pine/30 bg-pine-light text-pine-dark"
            : "border-rule bg-surface text-ink-soft"
        }`}
      >
        {emailReady && cronReady ? (
          <>
            <p className="font-medium">Automatic email reminders are on.</p>
            <p className="mt-1">
              Each overseer with an email on file is reminded about the month just ended on the
              5th, 12th and 18th, ahead of the 20th deadline for the branch report. You can also
              send them yourself below.
            </p>
            <div className="mt-3">
              <SendNow year={year} month={month} />
            </div>
          </>
        ) : emailReady ? (
          <>
            <p className="font-medium">Email is configured, but the monthly schedule is not secured.</p>
            <p className="mt-1">
              Add <span className="font-mono text-xs">CRON_SECRET</span> under Vercel → Settings →
              Environment variables so the scheduled job can run. You can still send now.
            </p>
            <div className="mt-3">
              <SendNow year={year} month={month} />
            </div>
          </>
        ) : (
          <>
            <p className="font-medium">Automatic email is not set up yet.</p>
            <p className="mt-1">
              Add the mail variables (Gmail: <span className="font-mono text-xs">MAIL_USER</span>,{" "}
              <span className="font-mono text-xs">GMAIL_CLIENT_ID</span>,{" "}
              <span className="font-mono text-xs">GMAIL_CLIENT_SECRET</span>,{" "}
              <span className="font-mono text-xs">GMAIL_REFRESH_TOKEN</span>; or Resend:{" "}
              <span className="font-mono text-xs">RESEND_API_KEY</span>) and{" "}
              <span className="font-mono text-xs">CRON_SECRET</span> for the monthly schedule under
              Vercel → Settings → Environment variables, then redeploy. The Email page shows what is
              connected and walks through the Google sign-in. Until then, copy a reminder or open it
              in WhatsApp yourself below.
            </p>
          </>
        )}
      </div>

      <form method="get" className="mb-6 grid gap-3 rounded border border-rule bg-surface p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="period" className="field-label">Reporting month</label>
          <select id="period" name="period" defaultValue={`${year}-${month}`} className="field-input">
            {periodOptions.map((p) => (
              <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" className="w-full">Show</Button>
        </div>
        <p className="flex items-end text-xs text-ink-faint">
          WhatsApp and copy are done by you. Email reminders run on the schedule above.
        </p>
      </form>

      {cards.length === 0 ? (
        <EmptyState
          title={`Everyone has reported for ${label}`}
          description="When a publisher has no report on file for the month, their group appears here with a reminder ready to send."
        />
      ) : (
        <Section title="By group">
          <div className="grid gap-4 lg:grid-cols-2">
            {cards.map((c) => (
              <ReminderCard
                key={c.key}
                title={c.title}
                meta={c.meta}
                message={c.message}
                hasEmail={c.hasEmail}
                waHref={c.waHref}
              />
            ))}
          </div>
        </Section>
      )}

      <Section title="Recording what you find">
        <p className="rounded border border-rule bg-surface px-4 py-4 text-sm text-ink-soft">
          A publisher who has been reminded and still sends nothing can be marked{" "}
          <span className="font-medium text-ink">No report</span> on the{" "}
          <Link href={`/reports?period=${year}-${month}`} className="text-pine hover:underline">report sheet</Link>.
          That keeps them out of the month&rsquo;s figures while still counting as an instance to
          report on, and it is not the same as leaving the row blank — a late report does not make
          a publisher irregular.
        </p>
      </Section>
    </>
  );
}
