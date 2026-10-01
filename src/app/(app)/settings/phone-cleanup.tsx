"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/shell";
import { Button } from "@/components/ui";
import { applyPhoneNumbers, checkPhoneNumbers, type PhoneCleanupState } from "./actions";

/**
 * Brings the phone numbers already on file into the local form beginning
 * with 0. It always shows the changes first; nothing is written until they are
 * confirmed. New numbers are put in this form as they are saved.
 */
export function PhoneCleanup() {
  const [state, setState] = useState<PhoneCleanupState>({});
  const [pending, start] = useTransition();
  const plan = state.plan;

  const check = () => start(async () => setState(await checkPhoneNumbers()));
  const apply = () => {
    if (!plan || !window.confirm(`Rewrite ${plan.changes.length} phone numbers so they begin with 0?`)) return;
    start(async () => setState(await applyPhoneNumbers()));
  };

  return (
    <div className="space-y-4 rounded border border-rule bg-surface p-4">
      <p className="text-sm text-ink-soft">
        Every phone number is kept as 0 followed by ten digits — <span className="font-mono">08031234567</span>.
        Numbers saved from now on are put in that form automatically. This brings the ones already on file
        into line: publishers&rsquo; and emergency contacts&rsquo; numbers, the school&rsquo;s students and
        guardians, and hall booking contacts. Foreign numbers, or anything that cannot be read as a Nigerian
        number, are left exactly as they are.
      </p>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={check}>
          {pending && !plan ? "Checking…" : plan ? "Check again" : "Check phone numbers"}
        </Button>
        {plan && plan.changes.length > 0 && (
          <Button type="button" size="sm" disabled={pending} onClick={apply}>
            {pending ? "Working…" : `Fix ${plan.changes.length} number${plan.changes.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      {plan && (
        <div className="space-y-3 text-sm">
          <p className="text-ink-soft">
            {plan.alreadyLocal} already begin with 0 · {plan.changes.length} to fix · {plan.unreadable.length} left as
            they are.
          </p>

          {plan.changes.length > 0 && (
            <div className="max-h-80 overflow-auto rounded border border-rule">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-paper text-left text-ink-soft">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Whose</th>
                    <th className="px-3 py-1.5 font-medium">Number</th>
                    <th className="px-3 py-1.5 font-medium">Now</th>
                    <th className="px-3 py-1.5 font-medium">Becomes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {plan.changes.map((c) => (
                    <tr key={`${c.table}-${c.id}-${c.field}`}>
                      <td className="px-3 py-1.5 text-ink">{c.who}</td>
                      <td className="px-3 py-1.5 text-ink-soft">{c.label}</td>
                      <td className="px-3 py-1.5 font-mono text-ink-soft">{c.before}</td>
                      <td className="px-3 py-1.5 font-mono text-pine-dark">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {plan.unreadable.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-ink">Left as they are — check these by hand:</p>
              <ul className="space-y-0.5 text-xs text-ink-soft">
                {plan.unreadable.map((u) => (
                  <li key={`${u.table}-${u.id}-${u.field}`}>
                    {u.who} · {u.label}: <span className="font-mono">{u.before}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
