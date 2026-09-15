"use client";

import { useActionState, useEffect, useState } from "react";
import { TextField, TextArea } from "@/components/fields";
import { NamePicker } from "@/components/name-picker";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { recordApproval, announceAux, type FormState } from "./actions";

/** Records one approved auxiliary pioneer application. Controlled fields keep
 * what was typed when validation fails; the form blanks on success. */
export function AuxApprovalForm({ people }: { people: { value: string; label: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(recordApproval, {});
  const [start, setStart] = useState("");
  const [months, setMonths] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div>
        <label htmlFor="publisherId" className="field-label">Publisher</label>
        <NamePicker
          id="publisherId" name="publisherId" options={people}
          placeholder="Search publishers…" clearOnSubmit={false}
        />
        {state.errors?.publisherId && <p className="field-error">{state.errors.publisherId}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Service starts" name="start" type="month" required
          value={start} onChange={(e) => setStart(e.target.value)} error={state.errors?.start}
        />
        <TextField
          label="Number of months" name="months" type="number" min={1} max={60}
          value={months} onChange={(e) => setMonths(e.target.value)}
          error={state.errors?.months}
          hint="Leave blank for indefinite service."
        />
      </div>

      <TextArea
        label="Notes" name="notes" rows={2} value={notes}
        onChange={(e) => setNotes(e.target.value)}
        hint="For example the approved hour goal or the application reference."
      />

      <SubmitButton pendingLabel="Recording…">Record approval</SubmitButton>
      <p className="text-xs text-ink-faint">
        Recording an approval sets the publisher&rsquo;s pioneer status to Auxiliary, so hours are
        expected from them on the report sheet.
      </p>
    </form>
  );
}

/** One-click announcement of the approvals for the chosen month not yet announced. */
export function AnnounceForm({ year, month }: { year: number; month: number }) {
  const [state, action] = useActionState<FormState, FormData>(announceAux, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <SubmitButton variant="secondary" size="sm" pendingLabel="Announcing…">
        Announce new approvals
      </SubmitButton>
    </form>
  );
}
