"use client";

import { useEffect, useActionState, useState } from "react";
import { TextField, TextArea } from "@/components/fields";
import { AssigneesField } from "./assignees-field";
import { SubmitButton, Button } from "@/components/ui";
import { Notice } from "@/components/shell";
import { useFormMemory } from "@/lib/use-form-memory";
import { saveMeeting, type DecisionState } from "./actions";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/**
 * One meeting, many decisions. Each row is an agenda item with what was
 * decided, who is carrying it out and when it is due. Rows are numbered
 * in the field names (agendaItem.0, agendaItem.1 …) and the action saves
 * them together.
 *
 * What is typed is remembered in this browser until the meeting is saved, so
 * leaving the page, a refresh or a refused save does not lose the entry.
 */
export function DecisionForm({
  suggestions,
  meeting,
}: {
  suggestions: string[];
  /** Set on a meeting's own page: the items added belong to that date. */
  meeting?: { date: string; joint: boolean };
}) {
  const START_ROWS = meeting ? 1 : 3;
  const [state, action] = useActionState<DecisionState, FormData>(saveMeeting, {});
  const memo = useFormMemory(meeting ? `mcss:boe:meeting:${meeting.date}` : "mcss:boe:meeting", {
    ignore: ["meetingDate", "meetingKind"],
  });
  const [rows, setRows] = useState<number[]>(range(START_ROWS));
  const [next, setNext] = useState(START_ROWS);

  // A remembered entry brings back as many rows as it had.
  const { memory } = memo;
  useEffect(() => {
    if (!memory) return;
    const count = Object.keys(memory).filter((k) => /^agendaItem\.\d+$/.test(k)).length;
    if (count > 0) {
      setRows(range(count));
      setNext(count);
    }
  }, [memory]);

  // Saved: start afresh. Refused: React has emptied the form, so put the entry back.
  const { restore, forget } = memo;
  useEffect(() => {
    if (state.ok) {
      forget();
      setRows(range(START_ROWS));
      setNext(START_ROWS);
    } else if (state.error || state.errors) {
      restore();
    }
  }, [state, restore, forget]);

  const addRow = () => {
    setRows((r) => [...r, next]);
    setNext((n) => n + 1);
  };
  const removeRow = (key: number) => setRows((r) => (r.length > 1 ? r.filter((x) => x !== key) : r));
  const clearAll = () => {
    if (!window.confirm("Clear everything typed into this form?")) return;
    forget();
    setRows(range(START_ROWS));
    setNext(START_ROWS);
  };

  return (
    <form
      key={memo.formKey}
      action={action}
      {...memo.formProps}
      className="space-y-5 rounded border border-rule bg-surface p-5"
    >
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      {memo.restored && !state.error && !state.errors && (
        <p className="rounded border border-rule bg-paper px-3 py-2 text-xs text-ink-soft">
          Your unsaved entry has been brought back. It stays in this browser until the meeting is recorded.
        </p>
      )}

      {meeting && <input type="hidden" name="meetingDate" value={meeting.date} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {!meeting && <TextField
          label="Date of the meeting" name="meetingDate" type="date" required
          defaultValue={memo.value("meetingDate", new Date().toISOString().slice(0, 10))}
          error={state.errors?.meetingDate}
        />}
        <div>
          <label htmlFor="meetingKind" className="field-label">Which meeting</label>
          <select id="meetingKind" name="meetingKind" defaultValue={memo.value("meetingKind", meeting?.joint ? "JOINT" : "BOE")} className="field-input">
            <option value="BOE">Body of elders</option>
            <option value="JOINT">Joint body of elders</option>
          </select>
          <p className="field-hint">A joint meeting is with the elders of the other congregations at the hall.</p>
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((key, i) => {
          const err = (field: string) => state.errors?.[`${field}.${i}`];
          const v = (field: string) => memo.value(`${field}.${i}`);
          return (
            <fieldset key={key} className="rounded border border-rule bg-paper/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <legend className="text-xs font-medium uppercase tracking-wide text-ink-soft">Decision {i + 1}</legend>
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(key)} className="text-xs text-ink-faint hover:text-clay">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Agenda item" name={`agendaItem.${i}`} placeholder="Kingdom Hall roof repair"
                  defaultValue={v("agendaItem")} error={err("agendaItem")}
                />
                <AssigneesField
                  name={`assignees.${i}`} suggestions={suggestions}
                  defaultNames={memo.values(`assignees.${i}`)}
                />
                <div className="sm:col-span-2">
                  <TextArea
                    label="What was decided" name={`decision.${i}`} rows={2}
                    defaultValue={v("decision")} error={err("decision")}
                  />
                </div>
                <TextField
                  label="Deadline" name={`targetDate.${i}`} type="date"
                  defaultValue={v("targetDate")} error={err("targetDate")}
                />
                <TextField label="Notes" name={`notes.${i}`} defaultValue={v("notes")} />
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>+ Another decision</Button>
        <SubmitButton pendingLabel="Saving…">{meeting ? "Add to this meeting" : "Record the meeting"}</SubmitButton>
        <button type="button" onClick={clearAll} className="text-xs text-ink-faint hover:text-clay">
          Clear the form
        </button>
      </div>
      <p className="text-xs text-ink-faint">
        Rows left blank are ignored. What you type is kept in this browser until the meeting is
        recorded. Record the decision itself, not the discussion, and keep confidential matters
        out of this system.
      </p>
    </form>
  );
}
