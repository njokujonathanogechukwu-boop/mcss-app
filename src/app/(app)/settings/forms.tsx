"use client";

import { useActionState, useEffect, useState } from "react";
import { TextField, SelectField, CheckField, NameField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { createUser, changeOwnPassword, uploadForm, type UserState, type FormUploadState } from "./actions";
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/rbac";

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => ({
  value: r,
  label: `${ROLE_LABELS[r]} — ${ROLE_DESCRIPTIONS[r]}`,
}));

const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "An upper-case letter", test: (v) => /[A-Z]/.test(v) },
  { label: "A lower-case letter", test: (v) => /[a-z]/.test(v) },
  { label: "A number", test: (v) => /[0-9]/.test(v) },
];

/**
 * Adds a sign-in account. The fields are controlled so a failed validation
 * keeps everything the secretary typed (React resets uncontrolled inputs when
 * the action returns); on success the form remounts and starts blank.
 */
export function NewUserForm({
  publishers,
}: {
  publishers: { id: string; label: string }[];
}) {
  const [state, action] = useActionState<UserState, FormData>(createUser, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("VIEWER");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(true);
  const [welcome, setWelcome] = useState(false);
  const [welcomePassword, setWelcomePassword] = useState(false);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Name" name="name" required value={name}
          onChange={(e) => setName(e.target.value)} error={state.errors?.name}
        />
        <TextField
          label="Email" name="email" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} error={state.errors?.email}
        />
      </div>

      <SelectField
        label="What they can do" name="role" value={role}
        onChange={(e) => setRole(e.target.value)} options={ROLE_OPTIONS}
      />

      <NameField
        label="Their publisher record" name="publisherId" emptyLabel="Not linked"
        options={publishers.map((p) => ({ value: p.id, label: p.label }))}
        hint="Optional. Links the account to a record in the roster."
        clearOnSubmit={false}
      />

      <div>
        <TextField
          label="First password" name="password" type="password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          error={state.errors?.password}
        />
        <ul className="mt-2 space-y-0.5 text-xs">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(password);
            return (
              <li key={r.label} className={ok ? "text-pine-dark" : "text-ink-faint"}>
                {ok ? "✓" : "·"} {r.label}
              </li>
            );
          })}
        </ul>
        <p className="field-hint mt-1">They can change it after signing in.</p>
      </div>

      <CheckField
        label="Account can sign in" name="active" checked={active}
        onChange={(e) => setActive(e.target.checked)}
      />

      <div className="border-t border-rule pt-2">
        <CheckField
          label="Email them the sign-in address" name="welcomeEmail" checked={welcome}
          onChange={(e) => {
            setWelcome(e.target.checked);
            if (!e.target.checked) setWelcomePassword(false);
          }}
          hint="A short welcome from the congregation's mail account. Needs RESEND_API_KEY to be set up."
        />
        <CheckField
          label="Include the first password in that email" name="welcomePassword"
          checked={welcomePassword} disabled={!welcome}
          onChange={(e) => setWelcomePassword(e.target.checked)}
          hint="Email is not a safe place for a password — only tick this if you would otherwise send it separately."
        />
      </div>

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
