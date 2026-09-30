"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui";
import { setCollectingMonthAction, type CloseState } from "./actions";

/**
 * Chooses the month the group links are collecting. The select defaults to the
 * month already set, and the confirmation message stays beside the button
 * rather than in a form field, so it survives the submit.
 */
export function CollectingMonthForm({
  current,
  options,
}: {
  current: { year: number; month: number };
  options: { year: number; month: number; label: string }[];
}) {
  const [state, action] = useActionState<CloseState, FormData>(setCollectingMonthAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="collecting" className="field-label">
          Month the group links collect
        </label>
        <select
          id="collecting"
          name="period"
          defaultValue={`${current.year}-${current.month}`}
          className="field-input py-1.5 text-sm"
        >
          {options.map((o) => (
            <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton pendingLabel="Setting…" variant="secondary" size="sm">
        Set the month
      </SubmitButton>
      {state.ok && <span className="text-xs text-pine">{state.ok}</span>}
      {state.error && <span className="text-xs text-clay">{state.error}</span>}
    </form>
  );
}
