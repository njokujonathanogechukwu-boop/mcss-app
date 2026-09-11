"use client";

import { useActionState } from "react";
import { TextField, SelectField, CheckField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { saveGroup, type GroupState } from "./actions";

export function GroupForm({
  group,
  candidates,
}: {
  group?: {
    id: string; number: number; name: string;
    overseerId: string | null; assistantId: string | null; active: boolean;
  };
  candidates: { id: string; label: string }[];
}) {
  const bound = saveGroup.bind(null, group?.id ?? null);
  const [state, action] = useActionState<GroupState, FormData>(bound, {});
  const options = candidates.map((c) => ({ value: c.id, label: c.label }));

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Number" name="number" type="number" min={1} max={99} required
          defaultValue={group?.number} error={state.errors?.number}
        />
        <div className="sm:col-span-2">
          <TextField
            label="Name" name="name" required defaultValue={group?.name}
            error={state.errors?.name} placeholder="Wuse II"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Group overseer" name="overseerId" placeholder="Not assigned"
          defaultValue={group?.overseerId ?? ""} error={state.errors?.overseerId}
          options={options} hint="Elders only."
        />
        <SelectField
          label="Assistant" name="assistantId" placeholder="Not assigned"
          defaultValue={group?.assistantId ?? ""} error={state.errors?.assistantId}
          options={options}
        />
      </div>

      <CheckField
        label="Group is in use" name="active" defaultChecked={group?.active ?? true}
        hint="Uncheck to retire a group without deleting its history."
      />

      <SubmitButton pendingLabel="Saving…">{group ? "Save group" : "Create group"}</SubmitButton>
    </form>
  );
}
