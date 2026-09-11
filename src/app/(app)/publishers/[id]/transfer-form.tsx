"use client";

import { useActionState } from "react";
import { SelectField, TextField, TextArea } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { transferPublisher, type FormState } from "../actions";

export function TransferForm({
  publisherId,
  groups,
  currentGroupId,
}: {
  publisherId: string;
  groups: { id: string; number: number; name: string }[];
  currentGroupId: string | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(transferPublisher, {});

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-4">
      <input type="hidden" name="publisherId" value={publisherId} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <SelectField
        label="Move to group"
        name="toGroupId"
        placeholder="Choose a group"
        error={state.errors?.toGroupId}
        options={groups
          .filter((g) => g.id !== currentGroupId)
          .map((g) => ({ value: g.id, label: `${g.number} — ${g.name}` }))}
      />
      <TextField
        label="Effective from"
        name="effectiveDate"
        type="date"
        defaultValue={new Date().toISOString().slice(0, 10)}
        error={state.errors?.effectiveDate}
      />
      <TextArea label="Reason" name="reason" rows={2} hint="Optional. Kept in the transfer history." />
      <SubmitButton variant="secondary" pendingLabel="Recording…">Record transfer</SubmitButton>
    </form>
  );
}
