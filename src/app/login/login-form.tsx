"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { signIn, type LoginState } from "./actions";
import { SubmitButton } from "@/components/ui";

export function LoginForm({
  next,
  action: serverAction = signIn,
}: {
  next?: string;
  /** The school overseer signs in through a page of his own, which refuses
   * accounts that cannot open the school area. */
  action?: (prev: LoginState, formData: FormData) => Promise<LoginState>;
}) {
  const [state, action] = useActionState<LoginState, FormData>(serverAction, {});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // A failed sign-in leaves nothing typed behind: on a shared device the
  // address on screen says as much as the password would.
  useEffect(() => {
    if (!state.error) return;
    setEmail("");
    setPassword("");
    emailRef.current?.focus();
  }, [state]);

  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && (
        <p className="rounded border border-clay/30 bg-clay-light px-3 py-2 text-sm text-clay" role="alert">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="field-label">Email</label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@congregation.org"
          className="field-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="password" className="field-label">Password</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={shown ? "text" : "password"}
            autoComplete="current-password"
            required
            className="field-input pr-16"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-pressed={shown}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-ink-soft hover:text-ink"
          >
            {shown ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
