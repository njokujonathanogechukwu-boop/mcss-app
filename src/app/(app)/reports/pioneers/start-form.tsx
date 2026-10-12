"use client";

import { useActionState } from "react";
import { savePioneerStart, type StartState } from "./actions";

/**
 * The month a regular pioneer began serving. Saved as soon as a month is
 * chosen; clearing it lets the review read the start from the reports again.
 */
export function PioneerStartForm({ publisherId, value }: { publisherId: string; value: string }) {
  const [state, action, pending] = useActionState<StartState, FormData>(savePioneerStart, {});

  return (
    <form action={action} className="flex flex-col gap-0.5">
      <input type="hidden" name="publisherId" value={publisherId} />
      <input
        type="month"
        name="start"
        defaultValue={value}
        aria-label="Began regular pioneer service"
        title="The month they began serving as a regular pioneer"
        className="w-36 rounded border border-rule-strong bg-surface px-1.5 py-1 text-xs"
        // Where the browser lets the month be typed, wait for a whole one.
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v === "" || /^\d{4}-\d{2}$/.test(v)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <span className="text-xxs text-ink-faint">
        {pending ? "Saving…" : state.error ?? state.ok ?? (value ? "" : "From the reports")}
      </span>
    </form>
  );
}
