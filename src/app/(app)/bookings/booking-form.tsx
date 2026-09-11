"use client";

import { useActionState } from "react";
import { TextField, TextArea, SelectField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { requestBooking, type BookingState } from "./actions";

export function BookingForm({
  resources,
}: {
  resources: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<BookingState, FormData>(requestBooking, {});

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && !state.clashes && <Notice tone="success">{state.ok}</Notice>}
      {state.clashes && (
        <Notice tone="error">
          <p className="font-medium">Saved, but this time is already taken.</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {state.clashes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <p className="mt-1.5">
            The elders will see the overlap when they review it, and cannot approve both.
          </p>
        </Notice>
      )}

      <SelectField
        label="Which part of the hall" name="resourceId" placeholder="Choose one"
        error={state.errors?.resourceId}
        options={resources.map((r) => ({ value: r.id, label: r.name }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Requested by" name="requestingBody" required
          placeholder="Maitama Congregation" error={state.errors?.requestingBody}
          hint="The congregation, circuit or group making the request."
        />
        <TextField
          label="What it is for" name="eventType" required
          placeholder="Circuit overseer's visit" error={state.errors?.eventType}
        />
        <TextField label="Contact name" name="contactName" required error={state.errors?.contactName} />
        <TextField label="Contact phone" name="contactPhone" type="tel" placeholder="+234…" />
        <TextField
          label="Starts" name="startTime" type="datetime-local" required error={state.errors?.startTime}
        />
        <TextField
          label="Ends" name="endTime" type="datetime-local" required error={state.errors?.endTime}
        />
      </div>

      <TextArea
        label="Setting up" name="setupRequirements" rows={2}
        hint="Chairs, sound, platform arrangement, anything the attendants should know."
      />

      <SubmitButton pendingLabel="Sending…">Send request</SubmitButton>
    </form>
  );
}
