"use client";

import { useActionState, useEffect, useState } from "react";
import { TextField, TextArea } from "@/components/fields";
import { HallChoice } from "./hall-choice";
import { Button, SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { decideBooking, updateBooking, type BookingState } from "./actions";

export type EditableBooking = {
  id: string;
  status: string;
  /** Every part of the hall the event uses. */
  resourceIds: string[];
  requestingBody: string;
  contactName: string;
  contactPhone: string | null;
  eventType: string;
  /** As the form's datetime-local fields take them: "2026-10-20T18:00". */
  start: string;
  end: string;
  setupRequirements: string | null;
  decisionNote: string | null;
};

/**
 * Changes a booking in place, before or after approval. Hidden behind Edit so
 * the list stays readable; a saved change closes it on the re-render that
 * follows. An approved booking can also be cancelled from here.
 */
export function BookingEdit({
  booking, resources,
}: {
  booking: EditableBooking;
  resources: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<BookingState, FormData>(updateBooking, {});
  const [cancelState, cancel] = useActionState<BookingState, FormData>(decideBooking, {});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Edit booking
        </Button>
        {state.ok && <span className="text-xs text-pine-dark">{state.ok}</span>}
        {cancelState.error && <span className="text-xs text-clay">{cancelState.error}</span>}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <form action={action} className="space-y-3 rounded border border-rule-strong bg-paper/60 p-4">
        <input type="hidden" name="id" value={booking.id} />

        {state.error && (
          <Notice tone="error">
            <p>{state.error}</p>
            {state.clashes && (
              <ul className="mt-1 list-inside list-disc">
                {state.clashes.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}
          </Notice>
        )}

        <HallChoice
          resources={resources} defaultIds={booking.resourceIds} error={state.errors?.resourceId}
          idPrefix={`edit-${booking.id}`}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Requested by" name="requestingBody" required defaultValue={booking.requestingBody}
            error={state.errors?.requestingBody}
          />
          <TextField
            label="What it is for" name="eventType" required defaultValue={booking.eventType}
            error={state.errors?.eventType}
          />
          <TextField
            label="Contact name" name="contactName" required defaultValue={booking.contactName}
            error={state.errors?.contactName}
          />
          <TextField
            label="Contact phone" name="contactPhone" type="tel" required defaultValue={booking.contactPhone ?? ""}
            error={state.errors?.contactPhone}
          />
          <TextField
            label="Starts" name="startTime" type="datetime-local" required defaultValue={booking.start}
            error={state.errors?.startTime}
          />
          <TextField
            label="Ends" name="endTime" type="datetime-local" required defaultValue={booking.end}
            error={state.errors?.endTime}
          />
        </div>
        <TextArea
          label="Setting up" name="setupRequirements" rows={2} defaultValue={booking.setupRequirements ?? ""}
        />
        <TextField
          label="Note for the record" name="decisionNote" defaultValue={booking.decisionNote ?? ""}
          placeholder="Why it changed (optional)"
        />

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm" pendingLabel="Saving…">Save changes</SubmitButton>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      </form>

      {booking.status === "APPROVED" && (
        <form
          action={cancel}
          className="mt-2"
          onSubmit={(e) => {
            if (!window.confirm("Cancel this booking? The hall becomes free for that time again.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={booking.id} />
          <input type="hidden" name="decision" value="CANCELLED" />
          <input type="hidden" name="decisionNote" value={booking.decisionNote ?? ""} />
          <button type="submit" className="text-xs text-clay hover:underline">Cancel this booking</button>
        </form>
      )}
    </div>
  );
}
