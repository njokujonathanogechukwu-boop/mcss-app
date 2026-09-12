"use client";

import { useActionState } from "react";
import { TextField, SelectField, CheckField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { createUser, changeOwnPassword, uploadForm, type UserState, type FormUploadState } from "./actions";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/rbac";

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => ({
  value: r,
  label: `${ROLE_LABELS[r]} — ${ROLE_DESCRIPTIONS[r]}`,
}));

export function NewUserForm({
  publishers,
}: {
  publishers: { id: string; label: string }[];
}) {
  const [state, action] = useActionState<UserState, FormData>(createUser, {});

  return (
    <form action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" required error={state.errors?.name} />
        <TextField label="Email" name="email" type="email" required error={state.errors?.email} />
      </div>

      <SelectField label="What they can do" name="role" defaultValue="VIEWER" options={ROLE_OPTIONS} />

      <SelectField
        label="Their publisher record" name="publisherId" placeholder="Not linked"
        options={publishers.map((p) => ({ value: p.id, label: p.label }))}
        hint="Optional. Links the account to a record in the roster."
      />

      <TextField
        label="First password" name="password" type="password" required
        error={state.errors?.password}
        hint="At least 12 characters with upper case, lower case and a number. They can change it after signing in."
      />

      <CheckField label="Account can sign in" name="active" defaultChecked />
      <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<UserState, FormData>(changeOwnPassword, {});

  return (
    <form action={action} className="max-w-md space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <TextField
        label="Current password" name="currentPassword" type="password" required
        autoComplete="current-password" error={state.errors?.currentPassword}
      />
      <TextField
        label="New password" name="newPassword" type="password" required
        autoComplete="new-password" error={state.errors?.newPassword}
      />
      <SubmitButton variant="secondary" pendingLabel="Changing…">Change password</SubmitButton>
    </form>
  );
}

export function FormUpload({ kind, code, title }: { kind: "S21" | "S1" | "S88"; code: string; title: string }) {
  const [state, action] = useActionState<FormUploadState, FormData>(uploadForm, {});

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <label htmlFor={`form-${kind}`} className="field-label">
        Upload the {code} PDF
      </label>
      <input
        id={`form-${kind}`}
        name="file"
        type="file"
        accept=".pdf,application/pdf"
        required
        className="block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border file:border-rule-strong file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-paper"
      />
      <p className="field-hint">The fillable {title} form as downloaded from jw.org.</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && (
        <Notice tone="success">
          <p>{state.ok}</p>
          {state.summary && (
            <ul className="mt-2 space-y-0.5 text-xs">
              {state.summary.checks.map((c) => (
                <li key={c.label}>{c.ok ? "✓" : "✗"} {c.label}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      <SubmitButton variant="secondary" size="sm" pendingLabel="Uploading…">Save this form</SubmitButton>
    </form>
  );
}
