"use client";

import { useActionState, useEffect, useState } from "react";
import { TextField, TextArea } from "@/components/fields";
import { AssigneesField } from "./assignees-field";
import { SubmitButton, Button } from "@/components/ui";
import { Notice } from "@/components/shell";
import { useFormMemory } from "@/lib/use-form-memory";
import { deleteDecision, updateDecision, type DecisionState } from "./actions";

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
 * Amends one recorded item in place, outstanding or completed. The form is
 * hidden until Edit is pressed so the lists stay readable; a saved item closes
 * it again on the re-render that follows. Changes not yet saved are kept in
 * this browser, so the form opens again where it was left.
 */
export function DecisionEdit({
  item,
  suggestions,
}: {
  item: EditableDecision;
  suggestions: string[];
}) {
  const [state, action] = useActionState<DecisionState, FormData>(updateDecision, {});
  const memo = useFormMemory(`mcss:boe:edit:${item.id}`, ["id", "status"]);
  const [open, setOpen] = useState(false);

  const { restore, forget } = memo;
  useEffect(() => {
    if (state.ok) {
      forget();
      setOpen(false);
    } else if (state.error || state.errors) {
      restore();
    }
  }, [state, restore, forget]);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {memo.restored ? "Edit · unsaved changes" : "Edit"}
      </Button>
    );
  }

  const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const v = (name: string, fallback: string) => memo.value(name, fallback);

  const cancel = () => {
    if (memo.restored && !window.confirm("Discard the changes you have not saved?")) return;
    forget();
    setOpen(false);
  };

  return (
    <div className="mt-3 w-full">
      <form
        key={memo.formKey}
        action={action}
        {...memo.formProps}
        className="space-y-3 rounded border border-rule-strong bg-paper/60 p-4"
      >
        {state.error && <Notice tone="error">{state.error}</Notice>}
        {memo.restored && !state.error && !state.errors && (
          <p className="text-xs text-ink-soft">Showing the changes you had not saved yet.</p>
        )}

        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="status" value={item.status} />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Agenda item" name="agendaItem" defaultValue={v("agendaItem", item.agendaItem)}
            error={state.errors?.agendaItem} required
          />
          <TextField
            label="Date of the meeting" name="meetingDate" type="date"
            defaultValue={v("meetingDate", iso(item.meetingDate))} error={state.errors?.meetingDate} required
          />
          <div className="sm:col-span-2">
            <TextArea
              label="What was decided" name="decision" rows={3} defaultValue={v("decision", item.decision)}
              error={state.errors?.decision}
            />
          </div>
          <AssigneesField
            name="assignees" suggestions={suggestions}
            defaultNames={memo.memory ? memo.values("assignees") : item.assignees}
          />
          <div>
            <label htmlFor={`meetingKind-${item.id}`} className="field-label">Which meeting</label>
            <select
              id={`meetingKind-${item.id}`} name="meetingKind"
              defaultValue={v("meetingKind", item.joint ? "JOINT" : "BOE")}
              className="field-input"
            >
              <option value="BOE">Body of elders</option>
              <option value="JOINT">Joint body of elders</option>
            </select>
          </div>
          <TextField
            label="Deadline" name="targetDate" type="date"
            defaultValue={v("targetDate", iso(item.targetDate))} error={state.errors?.targetDate}
          />
          <div className="sm:col-span-2">
            <TextField label="Notes" name="notes" defaultValue={v("notes", item.notes ?? "")} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          <Button type="button" variant="secondary" size="sm" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </form>

      <form
        action={deleteDecision}
        onSubmit={(e) => {
          if (!window.confirm(`Delete "${item.agendaItem}" for good? It also leaves the meeting summary. This cannot be undone.`)) {
            e.preventDefault();
            return;
          }
          forget();
        }}
        className="mt-2 text-right"
      >
        <input type="hidden" name="id" value={item.id} />
        <button className="text-xs text-ink-faint hover:text-clay">Delete this item</button>
      </form>
    </div>
  );
}
