"use client";

import { useActionState, useEffect, useState } from "react";
import { TextArea, useRestoreAfterReset } from "@/components/fields";
import { NamePicker } from "@/components/name-picker";
import { SubmitButton } from "@/components/ui";
import { Notice } from "@/components/shell";
import {
  recordStanding, addRestriction, liftRestriction, correctStanding, deleteStanding, type StandingState,
} from "./actions";

const KIND_OPTIONS = [
  { value: "REPROVED", label: "Reproved" },
  { value: "DISFELLOWSHIPPED", label: "Disfellowshipped" },
  { value: "DISASSOCIATED", label: "Disassociated" },
  { value: "REINSTATED", label: "Reinstated" },
  { value: "RESTRICTION", label: "Restrictions placed" },
];

/** Records one entry in a publisher's standing. Fields are controlled so a
 * failed save keeps what was typed; the form blanks only after it succeeds. */
export function StandingForm({
  people, today,
}: {
  people: { value: string; label: string }[];
  today: string;
}) {
  const [state, action] = useActionState<StandingState, FormData>(recordStanding, {});
  const [kind, setKind] = useState("REPROVED");
  const [eventDate, setEventDate] = useState(today);
  const [announcedDate, setAnnouncedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);
  const keepKind = useRestoreAfterReset<HTMLSelectElement>((el) => {
    el.value = kind;
  });

  return (
    <form key={saved} action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div>
        <label htmlFor="publisherId" className="field-label">Publisher</label>
        <NamePicker
          id="publisherId" name="publisherId" options={people}
          placeholder="Search publishers…" clearOnSubmit={false}
        />
        {state.errors?.publisherId && <p className="field-error">{state.errors.publisherId}</p>}
      </div>

      <div>
        <label htmlFor="kind" className="field-label">What happened</label>
        <select
          ref={keepKind} id="kind" name="kind" className="field-input"
          value={kind} onChange={(e) => setKind(e.target.value)}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="field-hint">
          {kind === "RESTRICTION"
            ? "Say what was withheld in the notes. You lift them later with one click."
            : kind === "REINSTATED"
              ? "Puts the publisher back on the roll as Active."
              : kind === "REPROVED"
                ? "They stay on the roll and keep reporting. Record the announcement date only if it was read to the congregation."
                : "Takes the publisher off the roll: no report, roster, S-1 or S-21 until they are reinstated."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="eventDate" className="field-label">Date it happened</label>
          <input
            id="eventDate" name="eventDate" type="date" required className="field-input"
            value={eventDate} onChange={(e) => setEventDate(e.target.value)}
          />
          {state.errors?.eventDate && <p className="field-error">{state.errors.eventDate}</p>}
        </div>
        <div>
          <label htmlFor="announcedDate" className="field-label">Date announced to the congregation</label>
          <input
            id="announcedDate" name="announcedDate" type="date" className="field-input"
            value={announcedDate} onChange={(e) => setAnnouncedDate(e.target.value)}
          />
          {state.errors?.announcedDate
            ? <p className="field-error">{state.errors.announcedDate}</p>
            : <p className="field-hint">Leave blank if nothing was announced.</p>}
        </div>
      </div>

      <TextArea
        label="Notes" name="notes" rows={2} value={notes}
        onChange={(e) => setNotes(e.target.value)}
        hint="For restrictions, what was withheld and until when."
      />

      <SubmitButton pendingLabel="Recording…">Record this</SubmitButton>
    </form>
  );
}

/** Fills in the date restrictions were lifted, closing them off. */
export function LiftForm({ id, today }: { id: string; today: string }) {
  const [state, action] = useActionState<StandingState, FormData>(liftRestriction, {});
  const [liftedDate, setLiftedDate] = useState(today);

  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`lift-${id}`} className="field-label">Lifted on</label>
          <input
            id={`lift-${id}`} name="liftedDate" type="date" required className="field-input"
            value={liftedDate} onChange={(e) => setLiftedDate(e.target.value)}
          />
        </div>
        <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">Lift restrictions</SubmitButton>
      </div>
      {state.errors?.liftedDate && <p className="field-error">{state.errors.liftedDate}</p>}
      {state.error && <p className="field-error">{state.error}</p>}
      {state.ok && <p className="text-xs text-pine-dark">{state.ok}</p>}
    </form>
  );
}

/** Records restrictions against an entry already on file, e.g. a reinstatement. */
export function AddRestrictionForm({ parentId, today }: { parentId: string; today: string }) {
  const [state, action] = useActionState<StandingState, FormData>(addRestriction, {});
  const [when, setWhen] = useState(today);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-ink-soft hover:text-pine">Add restrictions to this entry</summary>
      <form key={saved} action={action} className="mt-2 space-y-3 rounded border border-rule bg-paper p-3">
        <input type="hidden" name="parentId" value={parentId} />
        {state.error && <Notice tone="error">{state.error}</Notice>}
        {state.ok && <Notice tone="success">{state.ok}</Notice>}
        <div>
          <label htmlFor={`placed-${parentId}`} className="field-label">Date placed</label>
          <input
            id={`placed-${parentId}`} name="eventDate" type="date" required className="field-input"
            value={when} onChange={(e) => setWhen(e.target.value)}
          />
          {state.errors?.eventDate && <p className="field-error">{state.errors.eventDate}</p>}
        </div>
        <div>
          <label htmlFor={`withheld-${parentId}`} className="field-label">What was withheld</label>
          <textarea
            id={`withheld-${parentId}`} name="notes" rows={2} className="field-input"
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Say what they may not do, and until when."
          />
          {state.errors?.notes && <p className="field-error">{state.errors.notes}</p>}
        </div>
        <SubmitButton variant="secondary" size="sm" pendingLabel="Recording…">Record restrictions</SubmitButton>
      </form>
    </details>
  );
}

/** Corrects the dates or notes on an entry already on file. */
export function CorrectForm({
  id, publisherId, kind, eventDate, announcedDate, notes,
}: {
  id: string;
  publisherId: string;
  kind: string;
  eventDate: string;
  announcedDate: string;
  notes: string;
}) {
  const [state, action] = useActionState<StandingState, FormData>(correctStanding, {});
  const [when, setWhen] = useState(eventDate);
  const [announced, setAnnounced] = useState(announcedDate);
  const [note, setNote] = useState(notes);

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-ink-soft hover:text-pine">Correct this entry</summary>
      <form action={action} className="mt-2 space-y-3 rounded border border-rule bg-paper p-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="publisherId" value={publisherId} />
        <input type="hidden" name="kind" value={kind} />
        {state.error && <Notice tone="error">{state.error}</Notice>}
        {state.ok && <Notice tone="success">{state.ok}</Notice>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`event-${id}`} className="field-label">Date it happened</label>
            <input
              id={`event-${id}`} name="eventDate" type="date" required className="field-input"
              value={when} onChange={(e) => setWhen(e.target.value)}
            />
            {state.errors?.eventDate && <p className="field-error">{state.errors.eventDate}</p>}
          </div>
          <div>
            <label htmlFor={`announced-${id}`} className="field-label">Date announced</label>
            <input
              id={`announced-${id}`} name="announcedDate" type="date" className="field-input"
              value={announced} onChange={(e) => setAnnounced(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`notes-${id}`} className="field-label">Notes</label>
          <textarea
            id={`notes-${id}`} name="notes" rows={2} className="field-input"
            value={note} onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">Save changes</SubmitButton>
      </form>
    </details>
  );
}

export function DeleteRecordButton({ id, restrictions = 0 }: { id: string; restrictions?: number }) {
  const message = restrictions
    ? `Delete this entry and the ${restrictions} restriction${restrictions === 1 ? "" : "s"} recorded under it? `
    : "Delete this entry? ";
  return (
    <form action={deleteStanding}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-clay hover:text-clay"
        onClick={(e) => {
          if (!window.confirm(
            message + "If it changed the publisher's record status, the status goes back to what the remaining entries say.",
          )) {
            e.preventDefault();
          }
        }}
      >
        Delete
      </button>
    </form>
  );
}
