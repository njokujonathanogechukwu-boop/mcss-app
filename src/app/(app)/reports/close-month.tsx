"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui";
import { closeReportingMonth, reopenReportingMonth, type CloseState } from "./actions";

/**
 * Close the month once its report has gone to the branch, or reopen it. The
 * result is React state rather than a form control, so it survives the
 * post-submit form reset. Closing asks for confirmation because it freezes the
 * month's on-time set and affects the branch figures.
 */
export function CloseMonthButton({ year, month }: { year: number; month: number }) {
  const [state, action] = useActionState<CloseState, FormData>(closeReportingMonth, {});
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Close ${month}/${year} and mark its report submitted to the branch? ` +
              `Reports that arrive after this are treated as late and roll into next month.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <SubmitButton pendingLabel="Closing…">Close month &amp; mark submitted</SubmitButton>
      {state.ok && <span className="text-xs text-pine">{state.ok}</span>}
      {state.error && <span className="text-xs text-clay">{state.error}</span>}
    </form>
  );
}

export function ReopenMonthButton({ year, month }: { year: number; month: number }) {
  const [state, action] = useActionState<CloseState, FormData>(reopenReportingMonth, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <SubmitButton pendingLabel="Reopening…" variant="secondary" size="sm">
        Reopen this month
      </SubmitButton>
      {state.ok && <span className="text-xs text-pine">{state.ok}</span>}
      {state.error && <span className="text-xs text-clay">{state.error}</span>}
    </form>
  );
}
