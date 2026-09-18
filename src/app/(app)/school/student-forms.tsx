"use client";

import { useActionState, useEffect, useState } from "react";
import { NameField, SelectField, TextArea, TextField } from "@/components/fields";
import type { NameOption } from "@/components/name-picker";
import { Notice } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import { linkStudentToPublisher, saveStudent, setStudentActive, type SchoolState } from "./actions";

const GENDER_OPTIONS = [
  { value: "MALE", label: "Brother" },
  { value: "FEMALE", label: "Sister" },
];

export type StudentFormValues = {
  id?: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  conductorId: string;
  enrolledAt: string;
  notes: string;
};

/**
 * Puts someone on the roll of the school, or saves changes to a student already
 * on it. Enrollment itself is settled with the Bible study conductor or a
 * believing parent present (S-38 par. 1); this only records the outcome.
 */
export function StudentForm({ student, conductors }: { student?: StudentFormValues; conductors: NameOption[] }) {
  const [state, action] = useActionState<SchoolState, FormData>(saveStudent, {});
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-4">
      {student?.id && <input type="hidden" name="id" value={student.id} />}
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          label="First name" name="firstName" required defaultValue={student?.firstName}
          error={state.errors?.firstName}
        />
        <TextField
          label="Last name" name="lastName" required defaultValue={student?.lastName}
          error={state.errors?.lastName}
        />
        <SelectField
          label="Brother or sister" name="gender" options={GENDER_OPTIONS}
          defaultValue={student?.gender ?? "MALE"} error={state.errors?.gender}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          label="Date of birth" name="dateOfBirth" type="date"
          defaultValue={student?.dateOfBirth} error={state.errors?.dateOfBirth}
          hint="A student under 18 needs a guardian below."
        />
        <TextField label="Phone" name="phone" defaultValue={student?.phone} error={state.errors?.phone} />
        <TextField
          label="Enrolled from" name="enrolledAt" type="date"
          defaultValue={student?.enrolledAt} error={state.errors?.enrolledAt}
          hint="Left blank, today."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Guardian" name="guardianName" defaultValue={student?.guardianName}
          error={state.errors?.guardianName}
        />
        <TextField
          label="Guardian's phone" name="guardianPhone" defaultValue={student?.guardianPhone}
          error={state.errors?.guardianPhone}
        />
      </div>

      <NameField
        label="Conductor of their Bible study" name="conductorId" options={conductors}
        defaultValue={student?.conductorId} emptyLabel="Not recorded" clearOnSubmit={false}
        error={state.errors?.conductorId}
        hint="The publisher who conducts the study this student is enrolled from."
      />

      <TextArea
        label="Notes" name="notes" defaultValue={student?.notes}
        placeholder="Reads slowly; works well with a partner who is patient."
        hint="How the student is doing, and the points still to work on."
      />

      <SubmitButton pendingLabel="Saving…">{student?.id ? "Save the student" : "Enrol the student"}</SubmitButton>
    </form>
  );
}

/**
 * Takes a student off the roll, or puts them back. The record is kept either way:
 * their past assignments are part of the school's history.
 */
export function StudentActiveForm({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [state, action] = useActionState<SchoolState, FormData>(setStudentActive, {});

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      <Button
        type="submit" size="sm" variant={active ? "danger" : "secondary"}
        onClick={(e) => {
          if (active && !window.confirm(`Take ${name} off the roll of the school? Their past assignments stay on the old schedules.`)) {
            e.preventDefault();
          }
        }}
      >
        {active ? "Take off the roll" : "Put back on the roll"}
      </Button>
    </form>
  );
}

/**
 * Joins a student who has become a publisher to the record the secretary keeps,
 * so one person is not on two rolls with two histories.
 */
export function LinkPublisherForm({ id, publishers, current }: {
  id: string;
  publishers: NameOption[];
  current: string;
}) {
  const [state, action] = useActionState<SchoolState, FormData>(linkStudentToPublisher, {});

  return (
    <form action={action} className="space-y-3 rounded border border-rule bg-surface p-4">
      <input type="hidden" name="id" value={id} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <NameField
        label="Now a publisher" name="publisherId" options={publishers} defaultValue={current}
        emptyLabel="Not linked" clearOnSubmit={false} error={state.errors?.publisherId}
        hint="Linking them keeps this roll and the publisher list from counting the same person twice."
      />
      <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">Save the link</SubmitButton>
    </form>
  );
}
