"use client";

import { useActionState, useState } from "react";
import { TextField, TextArea, SelectField, CheckField } from "@/components/fields";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import { saveRecordFix, type RecordFixState } from "./actions";
import type { Review, ReviewMonth } from "@/lib/completeness";

function periodValue(m: ReviewMonth): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}

export function RecordFixForm({
  review,
  groups,
  month,
  flags,
}: {
  review: Review;
  groups: { id: string; number: number; name: string }[];
  month: ReviewMonth;
  flags: { canEditPublisher: boolean; canEditContact: boolean; canEditGroup: boolean; canEditReport: boolean };
}) {
  const [state, formAction] = useActionState<RecordFixState, FormData>(saveRecordFix, {});
  const [aux, setAux] = useState(false);
  const isPioneer = review.pioneerStatus !== "NONE";

  const showBio = flags.canEditPublisher;
  const showContact = flags.canEditContact;
  const showGroup = flags.canEditGroup;
  const showReport = flags.canEditReport;

  // Only months with no report on file are offered, so a save from this form
  // can never overwrite figures that are already recorded.
  const reportMonths: ReviewMonth[] = [
    ...(review.missing.thisMonth ? [month] : []),
    ...review.missing.otherMonths,
  ];

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="publisherId" value={review.id} />

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.message}</Notice>}

      {showBio && (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 w-full border-b border-rule pb-1 font-serif text-sm">Bio-data</legend>
          <TextField
            label="Date of birth"
            name="dateOfBirth"
            type="date"
            defaultValue={review.values.dateOfBirth}
            error={state.errors?.dateOfBirth}
          />
          <TextField
            label="Date of baptism"
            name="baptismDate"
            type="date"
            defaultValue={review.values.baptismDate}
            hint={review.values.isBaptized ? undefined : "Leave blank for an unbaptized publisher."}
            error={state.errors?.baptismDate}
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
            error={state.errors?.groupId}
          />
        </fieldset>
      )}

      {showContact && (
        <fieldset className="space-y-4">
          <legend className="mb-2 w-full border-b border-rule pb-1 font-serif text-sm">How to reach them</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Phone"
              name="phone"
              type="tel"
              defaultValue={review.values.phone}
              placeholder="+234…"
              error={state.errors?.phone}
            />
            <TextField
              label="Email"
              name="email"
              type="email"
              defaultValue={review.values.email}
              error={state.errors?.email}
            />
          </div>
          <TextArea
            label="Address"
            name="address"
            rows={2}
            defaultValue={review.values.address}
            error={state.errors?.address}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Emergency contact"
              name="emergencyContactName"
              defaultValue={review.values.emergencyContactName}
              error={state.errors?.emergencyContactName}
            />
            <TextField
              label="Emergency contact phone"
              name="emergencyContactPhone"
              type="tel"
              defaultValue={review.values.emergencyContactPhone}
              error={state.errors?.emergencyContactPhone}
            />
          </div>
        </fieldset>
      )}

      {showReport && reportMonths.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-2 w-full border-b border-rule pb-1 font-serif text-sm">
            Field service report
          </legend>
          <SelectField
            label="Month still missing"
            name="reportPeriod"
            defaultValue={periodValue(reportMonths[0])}
            options={reportMonths.map((m) => ({ value: periodValue(m), label: m.label }))}
            hint={
              reportMonths.length > 1
                ? `${reportMonths.length} months are outstanding. Save one, then pick the next.`
                : undefined
            }
            error={state.errors?.reportPeriod}
          />
          <CheckField label="Shared in the ministry" name="reportShared" defaultChecked={false} />
          {!isPioneer && (
            <CheckField
              label="Auxiliary pioneered that month"
              name="reportAux"
              defaultChecked={aux}
              onChange={(e) => setAux(e.target.checked)}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Bible studies"
              name="reportStudies"
              type="number"
              defaultValue=""
              placeholder="0"
              error={state.errors?.reportStudies}
            />
            {(isPioneer || aux) && (
              <TextField
                label="Hours"
                name="reportHours"
                type="number"
                defaultValue=""
                placeholder="0"
                error={state.errors?.reportHours}
              />
            )}
          </div>
          <p className="text-xs text-ink-faint">
            {isPioneer
              ? "Pioneers report hours. Leave everything empty to record that they did not share."
              : "Publishers report participation only. Tick auxiliary if they pioneered that month, then add their hours."}
          </p>
        </fieldset>
      )}

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
