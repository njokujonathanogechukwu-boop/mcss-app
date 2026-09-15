"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { testMailConnection, type MailState } from "./actions";

/**
 * Signs in to the mail account and sends one test message, then reports which
 * part broke in words the secretary can act on without reading a server log.
 */
export function TestMailForm({ ownEmail }: { ownEmail: string }) {
  const [state, action] = useActionState<MailState, FormData>(testMailConnection, {});
  const [to, setTo] = useState(ownEmail);

  return (
    <form action={action} className="space-y-3">
      {state.error && <Notice tone="error"><span className="whitespace-pre-line">{state.error}</span></Notice>}
      {state.ok && <Notice tone="success"><span className="whitespace-pre-line">{state.ok}</span></Notice>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="test-to" className="field-label">Send the test to</label>
          <input
            id="test-to" name="to" type="email" className="field-input"
            value={to} onChange={(e) => setTo(e.target.value)}
            placeholder={ownEmail || "an address you can open"}
          />
          <p className="field-hint">Your own address is filled in. Nothing is sent to any publisher.</p>
        </div>
        <SubmitButton variant="secondary" pendingLabel="Testing…">Test the connection</SubmitButton>
      </div>
    </form>
  );
}
