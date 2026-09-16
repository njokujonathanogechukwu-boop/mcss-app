"use client";

import { useActionState } from "react";
import { sendSignupEmail, type SignupState } from "./actions";

/** Per-row (re)send of the one-time signup link, with the result inline. */
export function SendSignupButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<SignupState, FormData>(sendSignupEmail, {});

  return (
    <form action={action} className="text-right">
      <input type="hidden" name="id" value={userId} />
      <button
        disabled={pending}
        className="text-xs text-pine hover:underline disabled:text-ink-faint"
      >
        {pending ? "Sending…" : "Send signup email"}
      </button>
      {state.ok && <span className="block text-xxs text-pine-dark">{state.ok}</span>}
      {state.error && <span className="block text-xxs text-clay">{state.error}</span>}
    </form>
  );
}
