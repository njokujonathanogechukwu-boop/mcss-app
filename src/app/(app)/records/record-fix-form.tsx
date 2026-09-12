"use client";

import { useActionState } from "react";
import { TextField, TextArea, SelectField, CheckField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { saveRecordFix, type RecordFixState } from "./actions";
import type { Review } from "@/lib/completeness";

export function RecordFixForm({
  review,
  groups,
  month,
  flags,
}: {
  review: Review;
  groups: { id: string; number: number; name: string }[];
  month: { year: number; month: number; label: string };
  flags: { canEditPublisher: boolean; canEditContact: boolean; canEditReport: boolean };
}) {
  const [state, formAction] = useActionState<RecordFixState, FormData>(saveRecordFix, {});
  const isPioneer = review.pioneerStatus !== "NONE";

  const showBio = flags.canEditPublisher;
  const showContact = flags.canEditContact;
  const showGroup = flags.canEditPublisher;
  const showReport = flags.canEditReport;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="publisherId" value={review.id} />

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}

      {showBio && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 w-full border-b border-rule pb-1 font-serif text-sm">Bio-data</legend>
          <TextField label="Date of birth" name="dateOfBirth" type="date" defaultValue={review.values.dateOfBirth} />
          <TextField
            label="Date of baptism"
            name="baptismDate"
            type="date"
            defaultValue={review.values.baptismDate}
            hint={review.values.isBaptized ? undefined : "Leave blank for an unbaptized publisher."}
          />
        </fieldset>
      )}

      {showGroup && (
        <fieldset>
          <legend className="mb-2 w-full border-b border-rule pb-1 font-serif text-sm">Service group</legend>
          <SelectField
            label="Service group"
            name="groupId"
            defaultValue={review.groupId ?? ""}
            placeholder="Not assigned"
            options={groups.map((g) => ({ value: g.id, label: `${g.number} — ${g.name}` }))}
          />
        </fieldset>
      )}

      {showContact && (
        <fieldset className="space-y-4">
          <legend className="mb-2 w-full border-b border-rule pb-1 font-serif text-sm">How to reach them</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Phone" name="phone" type="tel" defaultValue={review.values.phone} placeholder="+234…" />
            <TextField label="Email" name="email" type="email" defaultValue={review.values.email} />
          </div>
          <TextArea label="Address" name="address" rows={2} defaultValue={review.values.address} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Emergency contact" name="emergencyContactName" defaultValue={review.values.emergencyContactName} />
            <TextField label="Emergency contact phone" name="emergencyContactPhone" type="tel" defaultValue={review.values.emergencyContactPhone} />
          </div>
        </fieldset>
      )}

      {showReport && (
        <fieldset className="space-y-3">
          <legend className="mb-2 w-full border-b border-rule pb-1 font-serif text-sm">
            Report for {month.label}
          </legend>
          <input type="hidden" name="reportYear" value={month.year} />
          <input type="hidden" name="reportMonth" value={month.month} />
          <CheckField label="Shared in the ministry this month" name="reportShared" defaultChecked={false} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Bible studies" name="reportStudies" type="number" defaultValue="" placeholder="0" />
            {isPioneer ? (
              <TextField label="Hours" name="reportHours" type="number" defaultValue="" placeholder="0" />
            ) : (
              <div className="flex items-end">
                <CheckField label="Auxiliary pioneered this month" name="reportAux" defaultChecked={false} />
              </div>
            )}
          </div>
          <p className="text-xs text-ink-faint">
            {isPioneer
              ? "Pioneers report hours. Leave blank if there is nothing to record yet."
              : "Publishers report participation only. Tick auxiliary if they pioneered this month."}
          </p>
        </fieldset>
      )}

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
