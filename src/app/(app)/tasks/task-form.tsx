"use client";

import { useEffect, useActionState, useState } from "react";
import { TextField, TextArea } from "@/components/fields";
import { NamePicker } from "@/components/name-picker";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { createTask, type FormState } from "./actions";

/**
 * Adds one activity to the to-do list. The form blanks itself after a save so
 * the next entry starts clean (keyed on the save count).
 */
export function TaskForm({ people }: { people: { value: string; label: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(createTask, {});
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <TextField
        label="What needs doing" name="title" required
        placeholder="Prepare the accounts for the branch report"
        error={state.errors?.title}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Due by" name="dueDate" type="date" error={state.errors?.dueDate} />
        <div>
          <label htmlFor="assigneeId" className="field-label">Assign to</label>
          <NamePicker
            id="assigneeId" name="assigneeId" emptyLabel="Nobody yet"
            options={people} placeholder="Search publishers…"
          />
        </div>
      </div>
      <TextArea label="Notes" name="detail" rows={2} error={state.errors?.detail} />

      <SubmitButton pendingLabel="Adding…">Add task</SubmitButton>
    </form>
  );
}
