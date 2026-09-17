"use client";

import { useActionState } from "react";
import { saveHallCommittee, sendHallMailNow, type BookingState } from "./actions";
import { TextField } from "@/components/fields";
import { Button, SubmitButton } from "@/components/ui";
import { Panel } from "@/components/shell";

type Contacts = {
  chairman: { name: string; email: string };
  assistant: { name: string; email: string };
};

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
      <form action={saveAction} className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Chairman of the operating committee"
          name="chairmanName"
          defaultValue={contacts.chairman.name}
          error={saved.errors?.chairmanName}
          placeholder="Brother’s full name"
        />
        <TextField
          label="Chairman’s email"
          name="chairmanEmail"
          type="email"
          defaultValue={contacts.chairman.email}
          error={saved.errors?.chairmanEmail}
          hint="Left blank, no hall email goes to him."
        />
        <TextField
          label="Assistant to the chairman"
          name="assistantName"
          defaultValue={contacts.assistant.name}
          error={saved.errors?.assistantName}
          placeholder="Brother’s full name"
        />
        <TextField
          label="Assistant’s email"
          name="assistantEmail"
          type="email"
          defaultValue={contacts.assistant.email}
          error={saved.errors?.assistantEmail}
          hint="Left blank, no hall email goes to him."
        />
        <div className="sm:col-span-2">
          <SubmitButton variant="secondary" pendingLabel="Saving…">Save the committee</SubmitButton>
          {saved.ok && <p className="mt-1.5 text-xs text-pine-dark">{saved.ok}</p>}
          {saved.error && <p className="mt-1.5 text-xs text-clay">{saved.error}</p>}
        </div>
      </form>

      <div className="mt-4 border-t border-rule pt-3">
        <p className="text-xs text-ink-soft">
          Every day the system looks ahead: an approved booking is emailed to these brothers seven
          days before it happens, and on the 1st of each month they get the whole month&rsquo;s
          schedule. A booking is only emailed once.
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
