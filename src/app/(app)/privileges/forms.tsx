"use client";

import { useActionState } from "react";
import { TextField, SelectField, TextArea } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { createPrivilege, assignPrivilege, type PrivilegeState } from "./actions";

export const CATEGORY_LABELS = {
  CONGREGATION: "Congregation department",
  MEETING: "Meeting duty",
  OTHER: "Other",
} as const;

export const ROLE_LABELS = {
  OVERSEER: "Overseer",
  ASSISTANT: "Assistant",
  SERVANT: "Servant",
  ASSIGNEE: "Assignee",
} as const;

export function AssignForm({
  departments,
  publishers,
}: {
  departments: { id: string; name: string }[];
  publishers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<PrivilegeState, FormData>(assignPrivilege, {});

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Department" name="privilegeId" placeholder="Choose one" required
          options={departments.map((p) => ({ value: p.id, label: p.name }))}
          error={state.errors?.privilegeId}
        />
        <SelectField
          label="Role" name="role" defaultValue="ASSIGNEE"
          options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
          error={state.errors?.role}
        />
        <SelectField
          label="Publisher" name="publisherId" placeholder="Choose one" required
          options={publishers.map((p) => ({ value: p.id, label: p.name }))}
          error={state.errors?.publisherId}
        />
        <TextField label="Since" name="startDate" type="date" error={state.errors?.startDate} hint="Optional." />
      </div>
      <TextArea label="Notes" name="notes" rows={2} hint="Optional: rota day, who they cover for." />

      <SubmitButton pendingLabel="Saving…">Assign</SubmitButton>
    </form>
  );
}

export function NewPrivilegeForm() {
  const [state, action] = useActionState<PrivilegeState, FormData>(createPrivilege, {});

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Department" name="name" required placeholder="e.g. Sound & AV" error={state.errors?.name} />
        <SelectField
          label="Kind" name="category"
          options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          error={state.errors?.category}
        />
      </div>
      <TextArea label="What it covers" name="description" rows={2} hint="Optional." />

      <SubmitButton variant="secondary" pendingLabel="Adding…">Add department</SubmitButton>
    </form>
  );
}
