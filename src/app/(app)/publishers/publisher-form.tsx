"use client";

import { useActionState } from "react";
import Link from "next/link";
import { TextField, TextArea, SelectField, CheckField } from "@/components/fields";
import { SubmitButton, Button } from "@/components/ui";
import { Notice } from "@/components/shell";
import type { FormState } from "./actions";

type Publisher = {
  id?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  baptismDate?: string;
  isBaptized?: boolean;
  isAnointed?: boolean;
  appointment?: string;
  pioneerStatus?: string;
  status?: string;
  privileges?: string[];
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  groupId?: string | null;
  notes?: string | null;
};

export function PublisherForm({
  action,
  publisher = {},
  groups,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  publisher?: Publisher;
  groups: { id: string; number: number; name: string }[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-9">
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <fieldset className="space-y-4">
        <legend className="mb-3 w-full border-b border-rule pb-1.5 font-serif text-sm">
          Who they are
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="First name" name="firstName" required defaultValue={publisher.firstName} error={e.firstName} />
          <TextField label="Last name" name="lastName" required defaultValue={publisher.lastName} error={e.lastName} />
          <SelectField
            label="Sex" name="gender" defaultValue={publisher.gender ?? "MALE"} error={e.gender}
            options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }]}
          />
          <TextField label="Date of birth" name="dateOfBirth" type="date" defaultValue={publisher.dateOfBirth} error={e.dateOfBirth} />
          <TextField
            label="Date of baptism" name="baptismDate" type="date"
            defaultValue={publisher.baptismDate} error={e.baptismDate}
            hint="Leave blank for an unbaptized publisher."
          />
        </div>
        <div className="pt-1">
          <CheckField label="Baptized" name="isBaptized" defaultChecked={publisher.isBaptized} />
          <CheckField
            label="Partakes of the emblems" name="isAnointed" defaultChecked={publisher.isAnointed}
            hint="Used for the Memorial partaker count."
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 w-full border-b border-rule pb-1.5 font-serif text-sm">
          Standing in the congregation
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Appointment" name="appointment" defaultValue={publisher.appointment ?? "PUBLISHER"} error={e.appointment}
            options={[
              { value: "PUBLISHER", label: "Publisher" },
              { value: "MINISTERIAL_SERVANT", label: "Ministerial servant" },
              { value: "ELDER", label: "Elder" },
            ]}
          />
          <SelectField
            label="Pioneer service" name="pioneerStatus" defaultValue={publisher.pioneerStatus ?? "NONE"} error={e.pioneerStatus}
            hint="Only pioneers report hours."
            options={[
              { value: "NONE", label: "Not a pioneer" },
              { value: "AUXILIARY", label: "Auxiliary pioneer" },
              { value: "REGULAR", label: "Regular pioneer" },
              { value: "SPECIAL", label: "Special pioneer" },
            ]}
          />
          <SelectField
            label="Record status" name="status" defaultValue={publisher.status ?? "ACTIVE"} error={e.status}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "IRREGULAR", label: "Irregular" },
              { value: "INACTIVE", label: "Inactive" },
              { value: "TRANSFERRED_OUT", label: "Transferred out" },
              { value: "DECEASED", label: "Deceased" },
            ]}
          />
          <SelectField
            label="Service group" name="groupId" defaultValue={publisher.groupId ?? ""} error={e.groupId}
            placeholder="Not assigned"
            options={groups.map((g) => ({ value: g.id, label: `${g.number} — ${g.name}` }))}
          />
        </div>
        <TextField
          label="Privileges" name="privileges"
          defaultValue={(publisher.privileges ?? []).join(", ")}
          hint="Separate with commas, for example: Attendant, Sound, Microphones"
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 w-full border-b border-rule pb-1.5 font-serif text-sm">
          How to reach them
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Phone" name="phone" type="tel" defaultValue={publisher.phone ?? ""} error={e.phone} placeholder="+234…" />
          <TextField label="Email" name="email" type="email" defaultValue={publisher.email ?? ""} error={e.email} />
        </div>
        <TextArea label="Address" name="address" rows={2} defaultValue={publisher.address ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Emergency contact" name="emergencyContactName" defaultValue={publisher.emergencyContactName ?? ""} />
          <TextField label="Emergency contact phone" name="emergencyContactPhone" type="tel" defaultValue={publisher.emergencyContactPhone ?? ""} />
        </div>
        <TextArea
          label="Notes" name="notes" rows={3} defaultValue={publisher.notes ?? ""}
          hint="Practical notes only. Do not record confidential judicial matters here."
        />
      </fieldset>

      <div className="flex items-center gap-2 border-t border-rule pt-5">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        <Link href={cancelHref}>
          <Button variant="ghost" type="button">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}
