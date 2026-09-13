"use client";

import { useActionState, useState } from "react";
import { mergePublishers, type MergeState } from "./actions";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";

export type MergeCandidate = {
  id: string;
  name: string;
  group: string;
  standing: string;
  baptized: string;
  reports: number;
  privileges: number;
  hasAccount: boolean;
  created: string;
};

export function MergeForm({ a, b, overlap }: { a: MergeCandidate; b: MergeCandidate; overlap: number }) {
  const [state, action] = useActionState<MergeState, FormData>(mergePublishers, {});
  const [keep, setKeep] = useState(a.reports >= b.reports ? a.id : b.id);
  const kept = keep === a.id ? a : b;
  const gone = keep === a.id ? b : a;

  const card = (p: MergeCandidate) => (
    <label
      key={p.id}
      className={`block cursor-pointer rounded border p-4 ${keep === p.id ? "border-pine bg-pine-light/40" : "border-rule bg-surface hover:border-rule-strong"}`}
    >
      <div className="flex items-start gap-3">
        <input type="radio" name="keep" value={p.id} defaultChecked={keep === p.id} onChange={() => setKeep(p.id)} className="mt-1 text-pine focus:ring-pine" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ink">{p.name}</p>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-ink-soft">
            <dt>Group</dt><dd>{p.group}</dd>
            <dt>Standing</dt><dd>{p.standing}</dd>
            <dt>Baptized</dt><dd>{p.baptized}</dd>
            <dt>Reports on file</dt><dd>{p.reports}</dd>
            <dt>Privileges</dt><dd>{p.privileges}</dd>
            <dt>Sign-in account</dt><dd>{p.hasAccount ? "Yes" : "No"}</dd>
            <dt>Record created</dt><dd>{p.created}</dd>
          </dl>
          <p className="mt-2 text-xs font-medium">{keep === p.id ? "Keep this record" : "Fold into the other"}</p>
        </div>
      </div>
    </label>
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="remove" value={gone.id} />
      <div className="grid gap-4 sm:grid-cols-2">{card(a)}{card(b)}</div>

      <div className="rounded border border-rule bg-paper px-4 py-3 text-sm text-ink-soft">
        <p className="font-medium text-ink">What will happen</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
          <li>{gone.reports} report{gone.reports === 1 ? "" : "s"} from {gone.name} move to {kept.name}{overlap ? `; ${overlap} month${overlap === 1 ? "" : "s"} already on ${kept.name} keep their existing figures` : ""}.</li>
          <li>Privileges, transfers, elders’ items and group roles move across.</li>
          <li>Details {kept.name} is missing (dates, phone, address, group) are filled in from {gone.name}.</li>
          <li>{gone.name}’s record is then deleted. This cannot be undone.</li>
        </ul>
      </div>

      <label className="flex items-start gap-2.5">
        <input type="checkbox" name="confirm" value="true" required className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine" />
        <span className="text-sm text-ink">I have checked both records and they are the same person.</span>
      </label>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      <SubmitButton variant="danger" pendingLabel="Merging…">Merge into {kept.name}</SubmitButton>
    </form>
  );
}
