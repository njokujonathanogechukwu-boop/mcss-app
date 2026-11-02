"use client";

import { useActionState, useState } from "react";
import { endPioneerService, undoPioneerEnd, type StartState } from "./actions";

/**
 * Records that a pioneer has stopped, with the last month served: their
 * months as a pioneer are kept, and from the next month they are a publisher.
 * Hidden behind a link so the review stays readable.
 */
export function EndServiceForm({ publisherId, name, defaultMonth }: { publisherId: string; name: string; defaultMonth: string }) {
  const [state, action, pending] = useActionState<StartState, FormData>(endPioneerService, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xxs text-clay hover:underline">
        End service…
      </button>
    );
  }
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Record that ${name} has stopped regular pioneer service? Their months as a pioneer are kept.`)) {
          e.preventDefault();
        }
      }}
      className="mt-1.5 space-y-1 rounded border border-rule bg-paper p-2"
    >
      <input type="hidden" name="publisherId" value={publisherId} />
      <label className="block text-xxs text-ink-soft">
        Last month served
        <input
          type="month" name="end" required defaultValue={defaultMonth}
          className="mt-0.5 block w-36 rounded border border-rule-strong bg-surface px-1.5 py-1 text-xs"
        />
      </label>
      <input
        name="reason" maxLength={200} placeholder="Reason (optional)"
        className="block w-36 rounded border border-rule-strong bg-surface px-1.5 py-1 text-xs"
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded bg-clay px-2 py-0.5 text-xxs font-medium text-white hover:opacity-90">
          {pending ? "Saving…" : "End service"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xxs text-ink-faint hover:underline">Cancel</button>
      </div>
      {state.error && <p className="text-xxs text-clay">{state.error}</p>}
    </form>
  );
}

/** Takes back an end of service recorded by mistake. */
export function UndoEndButton({ publisherId }: { publisherId: string }) {
  const [state, action, pending] = useActionState<StartState, FormData>(undoPioneerEnd, {});
  return (
    <form action={action} className="mt-0.5">
      <input type="hidden" name="publisherId" value={publisherId} />
      <button type="submit" disabled={pending} className="text-xxs text-pine hover:underline">
        {pending ? "Working…" : "Undo"}
      </button>
      {state.error && <span className="ml-1 text-xxs text-clay">{state.error}</span>}
    </form>
  );
}
