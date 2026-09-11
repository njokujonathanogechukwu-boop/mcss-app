"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { TextField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<LoginState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <p className="rounded border border-clay/30 bg-clay-light px-3 py-2 text-sm text-clay" role="alert">
          {state.error}
        </p>
      )}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        placeholder="you@congregation.org"
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
