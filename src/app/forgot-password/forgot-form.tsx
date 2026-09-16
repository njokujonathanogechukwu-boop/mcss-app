"use client";

import { useActionState } from "react";
import { TextField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { requestPasswordReset, type ForgotState } from "./actions";

export function ForgotForm() {
  const [state, action] = useActionState<ForgotState, FormData>(requestPasswordReset, {});

  return (
    <form action={action} className="space-y-4">
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <TextField
        label="Email on your account" name="email" type="email" required
        autoComplete="username" placeholder="you@congregation.org"
        error={state.errors?.email}
      />

      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send me a reset link
      </SubmitButton>
    </form>
  );
}
