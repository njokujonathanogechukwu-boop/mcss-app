"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui";
import { updateMyDetails, type SelfState } from "./actions";

export type SelfPublisher = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  baptismDate: string;
  isBaptized: boolean;
  phone: string;
  email: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-clay">{error}</p>}
    </div>
  );
}

export function SelfForm({ token, publisher }: { token: string; publisher: SelfPublisher }) {
  const [state, formAction] = useActionState<SelfState, FormData>(
    updateMyDetails.bind(null, token),
    {},
  );
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      {state.ok && (
        <p className="rounded border border-pine/40 bg-pine-light px-4 py-3 text-sm text-pine-dark">
          {state.ok}
        </p>
      )}
      {e._form && (
        <p className="rounded border border-clay/40 bg-clay-light px-4 py-3 text-sm text-clay">
          {e._form}
        </p>
      )}

      <fieldset className="grid gap-4 rounded border border-rule bg-surface p-4 sm:grid-cols-2">
        <legend className="px-1 font-serif text-lg text-ink">Your details</legend>
        <Field label="First name" name="firstName" error={e.firstName}>
          <input id="firstName" name="firstName" defaultValue={publisher.firstName} required className="field-input" />
        </Field>
        <Field label="Last name" name="lastName" error={e.lastName}>
          <input id="lastName" name="lastName" defaultValue={publisher.lastName} required className="field-input" />
        </Field>
        <Field label="Date of birth" name="dateOfBirth" error={e.dateOfBirth}>
          <input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={publisher.dateOfBirth} className="field-input" />
        </Field>
        <div className="flex items-end gap-2 pb-1">
          <input
            id="isBaptized"
            name="isBaptized"
            type="checkbox"
            defaultChecked={publisher.isBaptized}
            className="h-4 w-4 accent-[#2F5D46]"
          />
          <label htmlFor="isBaptized" className="text-sm text-ink-soft">
            I am baptized
          </label>
        </div>
        <Field label="Date of baptism" name="baptismDate" error={e.baptismDate}>
          <input id="baptismDate" name="baptismDate" type="date" defaultValue={publisher.baptismDate} className="field-input" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded border border-rule bg-surface p-4 sm:grid-cols-2">
        <legend className="px-1 font-serif text-lg text-ink">How to reach you</legend>
        <Field label="Phone" name="phone" error={e.phone}>
          <input id="phone" name="phone" type="tel" defaultValue={publisher.phone} placeholder="0803 000 0000" className="field-input" />
        </Field>
        <Field label="Email" name="email" error={e.email}>
          <input id="email" name="email" type="email" defaultValue={publisher.email} className="field-input" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Home address" name="address" error={e.address}>
            <textarea id="address" name="address" rows={2} defaultValue={publisher.address} className="field-input" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded border border-rule bg-surface p-4 sm:grid-cols-2">
        <legend className="px-1 font-serif text-lg text-ink">Emergency contact</legend>
        <Field label="Contact name" name="emergencyContactName" error={e.emergencyContactName}>
          <input id="emergencyContactName" name="emergencyContactName" defaultValue={publisher.emergencyContactName} className="field-input" />
        </Field>
        <Field label="Contact phone" name="emergencyContactPhone" error={e.emergencyContactPhone}>
          <input id="emergencyContactPhone" name="emergencyContactPhone" type="tel" defaultValue={publisher.emergencyContactPhone} className="field-input" />
        </Field>
      </fieldset>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Save my details</SubmitButton>
        <p className="text-xs text-ink-faint">Your changes go straight to the congregation records.</p>
      </div>
    </form>
  );
}
