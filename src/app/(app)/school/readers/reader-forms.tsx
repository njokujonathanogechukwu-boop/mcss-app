"use client";

import { useActionState, useEffect, useState } from "react";
import { NameField } from "@/components/fields";
import { Notice } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import type { NameOption } from "@/components/name-picker";
import { addApprovedReader, removeApprovedReader, type SchoolState } from "../actions";

/** Adds one brother to the list the reader of the Bible study is picked from. */
export function AddReaderForm({ brothers }: { brothers: NameOption[] }) {
  const [state, action] = useActionState<SchoolState, FormData>(addApprovedReader, {});
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-3 rounded border border-dashed border-rule-strong bg-paper p-4">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <NameField
            label="Add a brother to the list" name="readerId" options={brothers}
            emptyLabel="Choose a brother…" placeholder="Type a name…"
            hint="Only the brothers the body of elders has approved belong here."
          />
          {state.errors?.readerId && (
            <p className="mt-1 text-xs text-clay">{state.errors.readerId}</p>
          )}
        </div>
        <SubmitButton size="sm" variant="secondary" pendingLabel="Adding…">Add him</SubmitButton>
      </div>
    </form>
  );
}

/** Takes one brother off the list again. */
export function RemoveReaderButton({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState<SchoolState, FormData>(removeApprovedReader, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit" size="sm" variant="ghost"
        onClick={(e) => {
          if (!window.confirm(`Take ${name} off the list of approved readers?`)) e.preventDefault();
        }}
      >
        Remove
      </Button>
      {state.error && <span className="ml-2 text-xs text-clay">{state.error}</span>}
    </form>
  );
}
