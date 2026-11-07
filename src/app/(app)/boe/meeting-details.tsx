"use client";

import { useActionState } from "react";
import { TextField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { updateMeeting, type DecisionState } from "./actions";

/**
 * The details shared by every decision of one meeting: its date and whether it
 * was a joint meeting. Saving moves all of them together.
 */
export function MeetingDetails({ date, kind }: { date: string; kind: "BOE" | "JOINT" | "MIXED" }) {
  const [state, action] = useActionState<DecisionState, FormData>(updateMeeting, {});

  return (
    <form action={action} className="space-y-3 rounded border border-rule bg-surface p-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <input type="hidden" name="from" value={date} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label="Date of the meeting" name="meetingDate" type="date" required
          defaultValue={date} error={state.errors?.meetingDate}
        />
        <div>
          <label htmlFor="meetingKind" className="field-label">Which meeting</label>
          <select id="meetingKind" name="meetingKind" defaultValue={kind === "MIXED" ? "KEEP" : kind} className="field-input">
            {kind === "MIXED" && <option value="KEEP">Leave each item as it is</option>}
            <option value="BOE">Body of elders (congregation)</option>
            <option value="JOINT">Joint body of elders</option>
          </select>
        </div>
        <div className="flex items-end">
          <SubmitButton pendingLabel="Saving…">Save meeting details</SubmitButton>
        </div>
      </div>
      <p className="text-xs text-ink-faint">
        A new date or meeting applies to every item recorded at this meeting. To change one item
        only, use its own Edit.
      </p>
    </form>
  );
}
