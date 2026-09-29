"use client";

import { useActionState, useEffect, useState } from "react";
import { FormProblems, SelectField, TextField } from "@/components/fields";
import { Notice } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import { MONTH_LABELS, WEEKDAY_LABELS } from "@/lib/school";
import { addWeek, createPeriod, deletePeriod, deleteWeek, savePeriod, type SchoolState } from "./actions";

export const MONTH_OPTIONS = MONTH_LABELS.map((label, index) => ({
  value: String(index + 1),
  label,
}));

export const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, index) => ({
  value: String(index),
  label,
}));

/**
 * Starts a schedule for one workbook. The two months are filled in at once, each
 * week already carrying the parts the S-140 prints, so the overseer only has to
 * put names against them.
 */
export function NewPeriodForm({
  defaultYear, defaultMonth, defaultWeekday,
}: { defaultYear: number; defaultMonth: number; defaultWeekday: number }) {
  const [state, action] = useActionState<SchoolState, FormData>(createPeriod, {});
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-3 rounded border border-dashed border-rule-strong bg-paper p-4">
      <p className="font-serif text-sm text-ink">Start a schedule</p>
      <FormProblems state={state} />
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField label="First month" name="startMonth" options={MONTH_OPTIONS} defaultValue={String(defaultMonth)} />
        <TextField label="Year" name="startYear" type="number" min={2020} max={2100} required defaultValue={defaultYear} />
        <SelectField
          label="Day of the meeting" name="meetingWeekday" options={WEEKDAY_OPTIONS}
          defaultValue={String(defaultWeekday)}
        />
        <TextField label="Time it starts" name="startHour" type="number" min={0} max={23} required defaultValue={18} hint="The hour, 24-hour clock. 18 is 6:00 pm." />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Minutes past the hour" name="startMinute" type="number" min={0} max={59} required defaultValue={0} />
        <TextField
          label="Name for it" name="label" placeholder="September–October 2026"
          hint="Optional. Left blank it is named after the two months."
        />
      </div>

      <SubmitButton size="sm" variant="secondary" pendingLabel="Starting…">Start this schedule</SubmitButton>
    </form>
  );
}

/** A schedule's name, the day the congregation meets and the time it starts. */
export function PeriodSettingsForm({ period }: {
  period: { id: string; label: string; meetingWeekday: number; startHour: number; startMinute: number };
}) {
  const [state, action] = useActionState<SchoolState, FormData>(savePeriod, {});

  return (
    <form action={action} className="space-y-3 rounded border border-rule bg-surface p-4">
      <input type="hidden" name="id" value={period.id} />
      <p className="font-serif text-sm text-ink">Settings</p>
      <FormProblems state={state} />
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" name="label" required defaultValue={period.label} />
        <SelectField
          label="Day of the meeting" name="meetingWeekday" options={WEEKDAY_OPTIONS}
          defaultValue={String(period.meetingWeekday)}
          hint="Changing this does not move the weeks already dated."
        />
        <TextField label="Starts at the hour" name="startHour" type="number" min={0} max={23} required defaultValue={period.startHour} />
        <TextField label="and minutes" name="startMinute" type="number" min={0} max={59} required defaultValue={period.startMinute} />
      </div>

      <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}

/** Takes a whole schedule off the file. The one action here that cannot be undone. */
export function DeletePeriodForm({ id, label, weeks }: { id: string; label: string; weeks: number }) {
  return (
    <form
      action={deletePeriod}
      onSubmit={(e) => {
        if (!window.confirm(`Delete the ${label} schedule and its ${weeks} week${weeks === 1 ? "" : "s"}? Every assignment on it goes too, and this cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="danger">Delete this schedule</Button>
    </form>
  );
}

/** Adds one meeting to a schedule, for a week the workbook dates did not cover. */
export function AddWeekForm({ periodId, suggested }: { periodId: string; suggested?: string }) {
  const [state, action] = useActionState<SchoolState, FormData>(addWeek, {});
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="flex flex-wrap items-end gap-3 rounded border border-rule bg-surface p-4">
      <input type="hidden" name="periodId" value={periodId} />
      <div className="min-w-[12rem] flex-1">
        <TextField
          label="Add a meeting on" name="weekOf" type="date" required defaultValue={suggested}
          error={state.errors?.weekOf}
        />
      </div>
      {state.error && <p className="text-sm text-clay">{state.error}</p>}
      {state.ok && <p className="text-sm text-pine-dark">{state.ok}</p>}
      <SubmitButton size="sm" variant="secondary" pendingLabel="Adding…">Add the week</SubmitButton>
    </form>
  );
}

/** Drops a meeting from a schedule, an assembly week for instance. */
export function DeleteWeekForm({ id, date }: { id: string; date: string }) {
  return (
    <form
      action={deleteWeek}
      onSubmit={(e) => {
        if (!window.confirm(`Take the meeting of ${date} off the schedule? Its parts and assignments go with it.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" aria-label={`Remove the meeting of ${date}`}>
        ✕
      </Button>
    </form>
  );
}
