"use client";

import { useActionState } from "react";
import { saveHallCommittee, sendHallMailNow, type BookingState } from "./actions";
import { TextField } from "@/components/fields";
import { Button, SubmitButton } from "@/components/ui";
import { Panel } from "@/components/shell";

type Contact = { name: string; email: string; email2: string };
type Contacts = { chairman: Contact; assistant: Contact; member: Contact };

const PEOPLE = [
  { role: "chairman", title: "Chairman of the operating committee", short: "Chairman’s" },
  { role: "assistant", title: "Assistant to the chairman", short: "Assistant’s" },
  { role: "member", title: "Another member of the committee", short: "Member’s" },
] as const;

/**
 * Who the automatic hall emails go to, and a way to send one straight away to
 * check that the addresses and the mail account are working.
 */
export function HallCommittee({
  contacts,
  mailConfigured,
}: {
  contacts: Contacts;
  mailConfigured: boolean;
}) {
  const [saved, saveAction] = useActionState<BookingState, FormData>(saveHallCommittee, {});
  const [sent, sendAction, sending] = useActionState<BookingState, FormData>(sendHallMailNow, {});

  return (
    <Panel className="p-4">
      <form action={saveAction} className="grid gap-4">
        {PEOPLE.map(({ role, title, short }) => (
          <div key={role} className="grid gap-3 sm:grid-cols-3">
            <TextField
              label={title}
              name={`${role}Name`}
              defaultValue={contacts[role].name}
              error={saved.errors?.[`${role}Name`]}
              placeholder="Brother’s full name"
            />
            <TextField
              label={`${short} email`}
              name={`${role}Email`}
              type="email"
              defaultValue={contacts[role].email}
              error={saved.errors?.[`${role}Email`]}
              hint="Left blank, no hall email goes to him."
            />
            <TextField
              label={`${short} second email`}
              name={`${role}Email2`}
              type="email"
              defaultValue={contacts[role].email2}
              error={saved.errors?.[`${role}Email2`]}
              hint="Optional — another address he reads."
            />
          </div>
        ))}
        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">Save the committee</SubmitButton>
          {saved.ok && <p className="mt-1.5 text-xs text-pine-dark">{saved.ok}</p>}
          {saved.error && <p className="mt-1.5 text-xs text-clay">{saved.error}</p>}
        </div>
      </form>

      <div className="mt-4 border-t border-rule pt-3">
        <p className="text-xs text-ink-soft">
          Every day the system looks ahead: an approved booking is emailed to these brothers seven
          days before it happens and again the day before, and on the 1st of each month they get the
          whole month&rsquo;s schedule. The day-before reminder is what catches a booking approved
          too late for the week-ahead notice. Where two addresses are given, both are used; the same
          address filled in twice is only mailed once. Each notice goes out only once per booking.
        </p>
        {!mailConfigured && (
          <p className="mt-1.5 text-xs text-clay">
            No mail account is connected yet, so nothing can go out. Set one up on the Email page.
          </p>
        )}
        <form action={sendAction} className="mt-2.5 flex flex-wrap gap-2">
          <Button type="submit" name="what" value="week" variant="secondary" size="sm" disabled={sending}>
            Send the week-ahead notice now
          </Button>
          <Button type="submit" name="what" value="day" variant="secondary" size="sm" disabled={sending}>
            Send the day-before reminder now
          </Button>
          <Button type="submit" name="what" value="month" variant="secondary" size="sm" disabled={sending}>
            Send this month&rsquo;s schedule now
          </Button>
        </form>
        {sent.ok && <p className="mt-1.5 text-xs text-pine-dark">{sent.ok}</p>}
        {sent.error && <p className="mt-1.5 text-xs text-clay">{sent.error}</p>}
      </div>
    </Panel>
  );
}
