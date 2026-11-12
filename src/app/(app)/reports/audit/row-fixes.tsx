"use client";

import { useActionState, useState } from "react";
import { auditFix, type FixState } from "./actions";

const WORD: Record<string, string> = {
  NONE: "publisher", AUXILIARY: "auxiliary pioneer", REGULAR: "regular pioneer", SPECIAL: "special pioneer",
};

const btn =
  "rounded border border-rule-strong bg-surface px-2 py-0.5 text-xxs text-ink-soft hover:border-pine hover:text-pine disabled:opacity-50";

/**
 * The fixes offered beside one flagged line of the audit. Each button is its
 * own form, so the fix it asks for always reaches the action.
 */
export function RowFixes({
  publisherId, name, year, month, filed, expected, reviewed, hasFlags, gone,
  canReports, canPublishers,
}: {
  publisherId: string;
  name: string;
  year: number;
  month: number;
  filed: string | null;
  expected: string;
  reviewed: boolean;
  hasFlags: boolean;
  gone: boolean;
  canReports: boolean;
  canPublishers: boolean;
}) {
  const [state, action, pending] = useActionState<FixState, FormData>(auditFix, {});
  const [moving, setMoving] = useState(false);

  const hidden = (op: string, extra?: Record<string, string>) => (
    <>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="publisherId" value={publisherId} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
  const one = (op: string, label: string, extra?: Record<string, string>, confirm?: string) => (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {hidden(op, extra)}
      <button className={btn} disabled={pending}>{label}</button>
    </form>
  );

  const mismatch = filed !== null && filed !== expected;
  const auxWithoutApproval = filed === "AUXILIARY" && expected === "NONE";

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {canReports && mismatch && !auxWithoutApproval && one("category", `File as ${WORD[expected]}`, { to: expected })}
        {auxWithoutApproval && canPublishers && one(
          "approveAux", "Approve auxiliary for this month", undefined,
          `Record ${name} as approved to auxiliary pioneer for this month?`,
        )}
        {auxWithoutApproval && canReports && one(
          "notAux", "Not an auxiliary pioneer", undefined,
          `File ${name}'s report as a publisher's? Their hours will no longer be counted.`,
        )}
        {canReports && hasFlags && (reviewed ? one("unreviewed", "Reviewed ✓ · undo") : one("reviewed", "Looks right"))}
        {canPublishers && !gone && (
          <button type="button" className={btn} onClick={() => setMoving((m) => !m)}>
            {moving ? "Cancel" : "Moved out…"}
          </button>
        )}
      </div>

      {moving && (
        <form
          action={action}
          onSubmit={(e) => {
            if (!window.confirm(`Mark ${name} as moved out of the congregation? Their record and reports are kept.`)) e.preventDefault();
          }}
          className="flex flex-wrap items-end gap-1.5 rounded border border-rule bg-paper p-2"
        >
          {hidden("movedOut")}
          <label className="text-xxs text-ink-soft">
            Moved on
            <input
              type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)}
              className="field-input mt-0.5 py-1 text-xs"
            />
          </label>
          <label className="text-xxs text-ink-soft">
            To (congregation or place)
            <input name="where" placeholder="Optional" className="field-input mt-0.5 py-1 text-xs" />
          </label>
          <button className={btn} disabled={pending}>Mark moved out</button>
        </form>
      )}

      {state.error && <p className="text-xxs text-clay">{state.error}</p>}
      {state.ok && <p className="text-xxs text-pine">{state.ok}</p>}
    </div>
  );
}
