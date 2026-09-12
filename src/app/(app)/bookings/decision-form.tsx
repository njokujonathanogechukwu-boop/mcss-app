"use client";

import { useActionState, useRef } from "react";
import { decideBooking, type BookingState } from "./actions";
import { SubmitButton, Button } from "@/components/ui";

export function DecisionForm({ id }: { id: string }) {
  const [state, action] = useActionState<BookingState, FormData>(decideBooking, {});
  // The submit button's own name/value is not reliably included in the
  // FormData a server action receives, so the choice is written into a
  // hidden field the moment a button is pressed.
  const decision = useRef<HTMLInputElement>(null);
  const choose = (value: "APPROVED" | "DECLINED") => () => {
    if (decision.current) decision.current.value = value;
  };

  return (
    <form action={action} className="mt-3 border-t border-rule pt-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" ref={decision} defaultValue="" />

      {state.error && (
        <div className="mb-2 rounded border border-clay/30 bg-clay-light px-3 py-2 text-xs text-clay">
          <p>{state.error}</p>
          {state.clashes && (
            <ul className="mt-1 list-inside list-disc">
              {state.clashes.map((c) => <li key={c}>{c}</li>)}
            </ul>
          )}
        </div>
      )}
      {state.ok && (
        <p className="mb-2 rounded border border-pine/25 bg-pine-light px-3 py-2 text-xs text-pine-dark">
          {state.ok}
        </p>
      )}

      <input
        type="text"
        name="decisionNote"
        placeholder="Note for the record (optional)"
        maxLength={200}
        className="mb-2 w-full rounded border border-rule-strong bg-surface px-2.5 py-1.5 text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <SubmitButton onClick={choose("APPROVED")} size="sm" pendingLabel="Working…">
          Approve
        </SubmitButton>
        <SubmitButton onClick={choose("DECLINED")} size="sm" variant="secondary" pendingLabel="Working…">
          Decline
        </SubmitButton>
      </div>
    </form>
  );
}
