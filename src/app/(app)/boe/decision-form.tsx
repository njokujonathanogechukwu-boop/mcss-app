"use client";

import { useEffect, useActionState, useState } from "react";
import { TextField, TextArea } from "@/components/fields";
import { NamePicker } from "@/components/name-picker";
import { SubmitButton, Button } from "@/components/ui";
import { Notice } from "@/components/shell";
import { saveMeeting, type DecisionState } from "./actions";

type Row = { key: number };

/**
 * One meeting, many decisions. Each row is an agenda item with what was
 * decided, who is carrying it out and when it is due. Rows are numbered
 * in the field names (agendaItem.0, agendaItem.1 …) and the action saves
 * them together.
 */
export function DecisionForm({ elders }: { elders: { id: string; label: string }[] }) {
  const [state, action] = useActionState<DecisionState, FormData>(saveMeeting, {});
  const [rows, setRows] = useState<Row[]>([{ key: 0 }, { key: 1 }, { key: 2 }]);
  const [next, setNext] = useState(3);
  // A saved meeting must not sit in the form waiting to be saved twice.
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  const addRow = () => {
    setRows((r) => [...r, { key: next }]);
    setNext((n) => n + 1);
  };
  const removeRow = (key: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x.key !== key) : r));

  return (
    <form key={saved} action={action} className="space-y-5 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Date of the meeting" name="meetingDate" type="date" required
          defaultValue={new Date().toISOString().slice(0, 10)} error={state.errors?.meetingDate}
        />
      </div>

      <div className="space-y-4">
        {rows.map((row, i) => {
          const err = (field: string) => state.errors?.[`${field}.${i}`];
          return (
            <fieldset key={row.key} className="rounded border border-rule bg-paper/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <legend className="text-xs font-medium uppercase tracking-wide text-ink-soft">Decision {i + 1}</legend>
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(row.key)} className="text-xs text-ink-faint hover:text-clay">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Agenda item" name={`agendaItem.${i}`} placeholder="Kingdom Hall roof repair"
                  error={err("agendaItem")}
                />
                <div>
                  <label htmlFor={`assignedToId.${i}`} className="field-label">Assigned to</label>
                  <NamePicker
                    id={`assignedToId.${i}`}
                    name={`assignedToId.${i}`}
                    emptyLabel="Not assigned"
                    options={elders.map((e) => ({ value: e.id, label: e.label }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextArea
                    label="What was decided" name={`decision.${i}`} rows={2}
                    error={err("decision")}
                  />
                </div>
                <TextField label="Deadline" name={`targetDate.${i}`} type="date" error={err("targetDate")} />
                <TextField label="Notes" name={`notes.${i}`} />
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>+ Another decision</Button>
        <SubmitButton pendingLabel="Saving…">Record the meeting</SubmitButton>
      </div>
      <p className="text-xs text-ink-faint">
        Rows left blank are ignored. Record the decision itself, not the discussion, and keep
        confidential matters out of this system.
      </p>
    </form>
  );
}
