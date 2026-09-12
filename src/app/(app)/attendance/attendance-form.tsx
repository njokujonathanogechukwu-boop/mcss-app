"use client";

import { useActionState } from "react";
import { TextField, SelectField, TextArea } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { recordAttendance, recordMemorial, type AttendanceState } from "./actions";

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

export function MemorialForm({ latest }: { latest?: { date: string; inPerson: number; video: number; partakers: number; notes: string | null } }) {
  const [state, action] = useActionState<AttendanceState, FormData>(recordMemorial, {});

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Date of the Memorial" name="date" type="date" required
          defaultValue={latest?.date} error={state.errors?.date}
          hint="The year of this date is the year the record is filed under."
        />
        <TextField
          label="Partakers" name="partakers" type="number" min={0} required
          defaultValue={latest?.partakers ?? 0} error={state.errors?.partakers}
        />
        <TextField
          label="Present in the hall" name="inPerson" type="number" min={0} required
          defaultValue={latest?.inPerson ?? 0} error={state.errors?.inPerson}
        />
        <TextField
          label="Joined by video" name="video" type="number" min={0} required
          defaultValue={latest?.video ?? 0} error={state.errors?.video}
        />
      </div>

      <TextArea label="Notes" name="notes" rows={2} defaultValue={latest?.notes ?? ""} hint="Optional: venue, speaker, tied-in groups." />

      <SubmitButton pendingLabel="Recording…">Record the Memorial</SubmitButton>
      <p className="text-xs text-ink-faint">
        Entering a date in the same year again replaces that year’s figures.
      </p>
    </form>
  );
}
