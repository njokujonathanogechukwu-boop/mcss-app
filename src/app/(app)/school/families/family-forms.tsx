"use client";

import { useActionState, useEffect, useState } from "react";
import { FormProblems, TextField } from "@/components/fields";
import { NamePicker, type NameOption } from "@/components/name-picker";
import { Notice } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import { addFamilyMember, createFamily, deleteFamily, removeFamilyMember, type SchoolState } from "../actions";

/** Records a family with its first members; more can be added from its row. */
export function NewFamilyForm({ people }: { people: NameOption[] }) {
  const [state, action] = useActionState<SchoolState, FormData>(createFamily, {});
  const [saved, setSaved] = useState(0);
  const [count, setCount] = useState(2);

  useEffect(() => {
    if (state.ok) {
      setSaved((n) => n + 1);
      setCount(2);
    }
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-3 rounded border border-dashed border-rule-strong bg-paper p-4">
      <p className="font-serif text-sm text-ink">Record a family</p>
      <FormProblems state={state} />
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <TextField
        label="Family name" name="name" required placeholder="Akpowenre family"
        hint="How the overseer knows them, usually the surname."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>
            <label className="field-label" htmlFor={`family-member-${i}`}>Member {i + 1}</label>
            <NamePicker
              id={`family-member-${i}`} name="member" options={people}
              emptyLabel="Nobody" placeholder="Type a name…" clearOnSubmit={false}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setCount((n) => n + 1)}>
          + Another member
        </Button>
        <SubmitButton size="sm" variant="secondary" pendingLabel="Recording…">Record this family</SubmitButton>
      </div>
    </form>
  );
}

/** Adds one more person to a family already recorded. */
export function AddMemberForm({ familyId, people }: { familyId: string; people: NameOption[] }) {
  const [state, action] = useActionState<SchoolState, FormData>(addFamilyMember, {});
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="mt-2 space-y-2">
      <input type="hidden" name="familyId" value={familyId} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <NamePicker
            id={`add-${familyId}`} name="member" options={people} ariaLabel="Add a member"
            emptyLabel="Nobody" placeholder="Add a member…" clearOnSubmit={false}
          />
        </div>
        <SubmitButton size="sm" variant="ghost" pendingLabel="Adding…">Add</SubmitButton>
      </div>
      <FormProblems state={state} />
    </form>
  );
}

/** Takes one person out of a family. */
export function RemoveMemberButton({ familyId, member, name }: { familyId: string; member: string; name: string }) {
  const [state, action] = useActionState<SchoolState, FormData>(removeFamilyMember, {});
  return (
    <form action={action} className="inline">
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="member" value={member} />
      <button
        type="submit" className="ml-1 text-ink-faint hover:text-clay" aria-label={`Take ${name} out of the family`}
        onClick={(e) => {
          if (!window.confirm(`Take ${name} out of this family?`)) e.preventDefault();
        }}
      >
        ✕
      </button>
      {state.error && <span className="ml-1 text-xs text-clay">{state.error}</span>}
    </form>
  );
}

/** Removes a whole family record. Past schedules are untouched. */
export function DeleteFamilyButton({ familyId, name }: { familyId: string; name: string }) {
  const [state, action] = useActionState<SchoolState, FormData>(deleteFamily, {});
  return (
    <form action={action}>
      <input type="hidden" name="familyId" value={familyId} />
      <Button
        type="submit" size="sm" variant="ghost"
        onClick={(e) => {
          if (!window.confirm(`Remove the ${name} family? Its members can then only be paired with the same gender.`)) {
            e.preventDefault();
          }
        }}
      >
        Remove
      </Button>
      {state.error && <span className="ml-2 text-xs text-clay">{state.error}</span>}
    </form>
  );
}
