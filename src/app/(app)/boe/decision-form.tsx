"use client";

import { useActionState } from "react";
import { TextField, TextArea, SelectField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { saveDecision, type DecisionState } from "./actions";

export function DecisionForm({ elders }: { elders: { id: string; label: string }[] }) {
  const [state, action] = useActionState<DecisionState, FormData>(saveDecision, {});

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Date of the meeting" name="meetingDate" type="date" required
          defaultValue={new Date().toISOString().slice(0, 10)} error={state.errors?.meetingDate}
        />
        <TextField
          label="Agenda item" name="agendaItem" required placeholder="Kingdom Hall roof repair"
          error={state.errors?.agendaItem}
        />
      </div>

      <TextArea
        label="What was decided" name="decision" rows={3} required error={state.errors?.decision}
        hint="Record the decision itself, not the discussion. Keep confidential matters out of this system."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label="Assigned to" name="assignedToId" placeholder="Not assigned"
          options={elders.map((e) => ({ value: e.id, label: e.label }))}
        />
        <TextField label="Target date" name="targetDate" type="date" error={state.errors?.targetDate} />
        <SelectField
          label="Status" name="status" defaultValue="OPEN"
          options={[
            { value: "OPEN", label: "Open" },
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "COMPLETED", label: "Completed" },
            { value: "DEFERRED", label: "Deferred" },
          ]}
        />
      </div>

      <TextArea label="Notes" name="notes" rows={2} />
      <SubmitButton pendingLabel="Saving…">Record item</SubmitButton>
    </form>
  );
}
