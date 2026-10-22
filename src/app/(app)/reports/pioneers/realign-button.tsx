"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui";
import { applyRecordedStarts, type StartState } from "./actions";

/** Puts every report in step with the recorded starts, in one go. */
export function RealignButton({ count }: { count: number }) {
  const [state, action] = useActionState<StartState, FormData>(applyRecordedStarts, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <SubmitButton size="sm" pendingLabel="Correcting…">
        Correct {count} report{count === 1 ? "" : "s"}
      </SubmitButton>
      {state.ok && <span className="text-xs text-pine-dark">{state.ok}</span>}
      {state.error && <span className="text-xs text-clay">{state.error}</span>}
    </form>
  );
}
