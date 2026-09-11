"use client";

import { useActionState } from "react";
import { TextField, SelectField, TextArea } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { recordAttendance, type AttendanceState } from "./actions";

export function AttendanceForm() {
  const [state, action] = useActionState<AttendanceState, FormData>(recordAttendance, {});

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Date of the meeting" name="date" type="date" required
          defaultValue={new Date().toISOString().slice(0, 10)} error={state.errors?.date}
        />
        <SelectField
          label="Meeting" name="meetingType" error={state.errors?.meetingType}
          options={[
            { value: "MIDWEEK", label: "Midweek meeting" },
            { value: "WEEKEND", label: "Weekend meeting" },
          ]}
        />
        <TextField
          label="Present in the hall" name="inPerson" type="number" min={0} required
          defaultValue={0} error={state.errors?.inPerson}
        />
        <TextField
          label="Joined by video" name="zoom" type="number" min={0} required
          defaultValue={0} error={state.errors?.zoom}
          hint="Count devices connected, as announced."
        />
      </div>

      <TextArea label="Notes" name="notes" rows={2} hint="Optional: visiting speaker, special event, weather." />

      <SubmitButton pendingLabel="Recording…">Record attendance</SubmitButton>
      <p className="text-xs text-ink-faint">
        Entering the same date and meeting again replaces the earlier figure.
      </p>
    </form>
  );
}
