"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui";
import { sendRemindersNow, type SendNowState } from "./actions";

/**
 * Lets the secretary email this month's overseer reminders straight away
 * instead of waiting for the scheduled job. The result is React state, not a
 * form control, so it survives the post-submit form reset.
 */
export function SendNow({ year, month }: { year: number; month: number }) {
  const [state, formAction] = useActionState<SendNowState, FormData>(sendRemindersNow, {});

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <SubmitButton pendingLabel="Sending…">Send the reminder emails now</SubmitButton>
      {state.ok && <span className="text-xs text-pine">{state.ok}</span>}
      {state.error && <span className="text-xs text-clay">{state.error}</span>}
      {state.warnings?.map((w) => (
        <span key={w} className="w-full text-xs text-[#7A5E1E]">{w}</span>
      ))}
    </form>
  );
}
