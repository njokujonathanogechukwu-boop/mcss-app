"use client";

import { useActionState, useEffect, useState } from "react";
import { TextField, TextArea } from "@/components/fields";
import { AssigneesField } from "./assignees-field";
import { SubmitButton, Button } from "@/components/ui";
import { Notice } from "@/components/shell";
import { updateDecision, type DecisionState } from "./actions";

type EditableDecision = {
  id: string;
  agendaItem: string;
  decision: string;
  notes: string | null;
  status: string;
  meetingDate: Date;
  targetDate: Date | null;
  /** Everyone assigned, by name. */
  assignees: string[];
  joint: boolean;
};

/**
 * Amends one recorded item in place. The form is hidden until Edit is
 * pressed so the outstanding list stays readable; a saved item closes it
 * again on the re-render that follows.
 */
export function DecisionEdit({
  item,
  suggestions,
}: {
  item: EditableDecision;
  suggestions: string[];
}) {
  const [state, action] = useActionState<DecisionState, FormData>(updateDecision, {});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );
  }

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <form action={action} className="mt-3 space-y-3 rounded border border-rule-strong bg-paper/60 p-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="status" value={item.status} />

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Agenda item" name="agendaItem" defaultValue={item.agendaItem}
          error={state.errors?.agendaItem} required
        />
        <TextField
          label="Date of the meeting" name="meetingDate" type="date"
          defaultValue={iso(item.meetingDate)} error={state.errors?.meetingDate} required
        />
        <div className="sm:col-span-2">
          <TextArea
            label="What was decided" name="decision" rows={2} defaultValue={item.decision}
            error={state.errors?.decision}
          />
        </div>
        <AssigneesField name="assignees" suggestions={suggestions} defaultNames={item.assignees} />
        <div>
          <label htmlFor={`meetingKind-${item.id}`} className="field-label">Which meeting</label>
          <select
            id={`meetingKind-${item.id}`} name="meetingKind" defaultValue={item.joint ? "JOINT" : "BOE"}
            className="field-input"
          >
            <option value="BOE">Body of elders</option>
            <option value="JOINT">Joint body of elders</option>
          </select>
        </div>
        <TextField
          label="Deadline" name="targetDate" type="date"
          defaultValue={iso(item.targetDate)} error={state.errors?.targetDate}
        />
        <div className="sm:col-span-2">
          <TextField label="Notes" name="notes" defaultValue={item.notes ?? ""} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
