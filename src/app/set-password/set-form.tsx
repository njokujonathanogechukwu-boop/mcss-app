"use client";

import { useActionState, useState } from "react";
import { TextField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { setPasswordWithToken, type SetPasswordState } from "./actions";

const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "At least 12 characters", test: (v) => v.length >= 12 },
  { label: "An upper-case letter", test: (v) => /[A-Z]/.test(v) },
  { label: "A lower-case letter", test: (v) => /[a-z]/.test(v) },
  { label: "A number", test: (v) => /[0-9]/.test(v) },
];

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<SetPasswordState, FormData>(setPasswordWithToken, {});
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <div>
        <TextField
          label="New password" name="password" type="password" required
          autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} error={state.errors?.password}
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
      </div>

      <TextField
        label="Type it again" name="confirm" type="password" required
        autoComplete="new-password" error={state.errors?.confirm}
      />

      <SubmitButton className="w-full" pendingLabel="Saving…">Set my password</SubmitButton>
    </form>
  );
}
