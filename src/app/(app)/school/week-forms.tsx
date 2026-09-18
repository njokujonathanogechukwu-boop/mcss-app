"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckField, NameField, SelectField, TextField } from "@/components/fields";
import { NamePicker, type NameOption } from "@/components/name-picker";
import { Notice } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import { HALL_LABELS, PART_KINDS, SECTION_LABELS, SLOT_LABELS, hallsFor, slotField, type PartKind } from "@/lib/school";
import type { MidweekSection, MidweekSlot } from "@prisma/client";
import { addPart, deletePart, movePart, savePart, saveWeekHeader, type SchoolState } from "./actions";

const SECTION_OPTIONS = (Object.keys(SECTION_LABELS) as MidweekSection[]).map((s) => ({
  value: s,
  label: SECTION_LABELS[s],
}));

const KIND_OPTIONS = (Object.keys(PART_KINDS) as PartKind[]).map((k) => ({
  value: k,
  label: PART_KINDS[k].label,
}));

export type WeekHeaderProps = {
  id: string;
  weekOf: string;
  bibleReading: string | null;
  chairmanId: string | null;
  counselorId: string | null;
  openingPrayerId: string | null;
  closingPrayerId: string | null;
  openingSong: number | null;
  livingSong: number | null;
  closingSong: number | null;
  cancelled: boolean;
  cancelledReason: string | null;
  note: string | null;
};

/**
 * The head of the schedule: the date, the weekly Bible reading, the chairman,
 * the auxiliary classroom counselor, the two prayers, the three songs, and the
 * banner a circuit overseer's week or an assembly carries.
 */
export function WeekHeaderForm({ week, people }: { week: WeekHeaderProps; people: NameOption[] }) {
  const [state, action] = useActionState<SchoolState, FormData>(saveWeekHeader, {});
  const [cancelled, setCancelled] = useState(week.cancelled);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-4 rounded border border-rule bg-surface p-5">
      <input type="hidden" name="id" value={week.id} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          label="Date of the meeting" name="weekOf" type="date" required
          defaultValue={week.weekOf}
        />
        <TextField
          label="Weekly Bible reading" name="bibleReading" defaultValue={week.bibleReading ?? ""}
          placeholder="Psalm 18–22" hint="Printed beside the date at the head of the schedule."
        />
        <TextField
          label="Banner for the week" name="note" defaultValue={week.note ?? ""}
          placeholder="Circuit overseer visit"
          hint="Optional. Printed across the top of the schedule, for a special week."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NameField
          label="Chairman" name="chairmanId" options={people} defaultValue={week.chairmanId ?? ""}
          emptyLabel="Not assigned yet" clearOnSubmit={false}
          hint="A brother the body of elders has approved."
        />
        <NameField
          label="Auxiliary classroom counselor" name="counselorId" options={people}
          defaultValue={week.counselorId ?? ""} emptyLabel="Not assigned yet" clearOnSubmit={false}
        />
        <NameField
          label="Opening prayer" name="openingPrayerId" options={people}
          defaultValue={week.openingPrayerId ?? ""} emptyLabel="Not assigned yet" clearOnSubmit={false}
        />
        <NameField
          label="Closing prayer" name="closingPrayerId" options={people}
          defaultValue={week.closingPrayerId ?? ""} emptyLabel="Not assigned yet" clearOnSubmit={false}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Opening song" name="openingSong" type="number" min={1} max={999}
          defaultValue={week.openingSong ?? ""}
        />
        <TextField
          label="Song before Living as Christians" name="livingSong" type="number" min={1} max={999}
          defaultValue={week.livingSong ?? ""}
        />
        <TextField
          label="Closing song" name="closingSong" type="number" min={1} max={999}
          defaultValue={week.closingSong ?? ""}
        />
      </div>

      <div className="border-t border-rule pt-3">
        <CheckField
          label="No meeting this week" name="cancelled" checked={cancelled}
          onChange={(e) => setCancelled(e.target.checked)}
          hint="An assembly or convention week, or the Memorial falling on a weekday. The week stays on the schedule and prints as not held."
        />
        {cancelled && (
          <TextField
            label="Why there is no meeting" name="cancelledReason"
            defaultValue={week.cancelledReason ?? ""} placeholder="Circuit assembly"
          />
        )}
      </div>

      <SubmitButton pendingLabel="Saving…">Save the heading</SubmitButton>
    </form>
  );
}

export type PartProps = {
  id: string;
  position: number;
  section: MidweekSection;
  title: string;
  minutes: number | null;
  detail: string | null;
  kind: PartKind;
  dualHall: boolean;
  /** Who is assigned, by `SLOT@HALL`, as a picker value. */
  values: Record<string, string>;
};

/** One numbered line of the schedule, with everyone assigned to it. */
export function PartCard({ part, people, count }: { part: PartProps; people: NameOption[]; count: number }) {
  const [state, action] = useActionState<SchoolState, FormData>(savePart, {});
  const [kind, setKind] = useState<PartKind>(part.kind);
  const [dualHall, setDualHall] = useState(part.dualHall);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  const slots = PART_KINDS[kind].slots;

  return (
    <div className="rounded border border-rule bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-2.5">
        <p className="font-serif text-sm text-ink">
          {part.position}. <span className="text-ink-soft">{SECTION_LABELS[part.section]}</span>
        </p>
        <div className="flex items-center gap-2">
          {state.ok && <span className="text-xs text-pine-dark">{state.ok}</span>}
          {state.error && <span className="text-xs text-clay">{state.error}</span>}
          <PartTools partId={part.id} title={part.title} position={part.position} count={count} />
        </div>
      </div>

      <form key={saved} action={action} className="space-y-3 p-4">
        <input type="hidden" name="partId" value={part.id} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Title as the workbook prints it" name="title" required defaultValue={part.title}
            placeholder="A Guarded Heart"
          />
          <SelectField label="Section" name="section" options={SECTION_OPTIONS} defaultValue={part.section} />
          <SelectField
            label="What it needs" name="kind" value={kind}
            onChange={(e) => setKind(e.target.value as PartKind)}
            options={KIND_OPTIONS}
          />
          <TextField
            label="Minutes" name="minutes" type="number" min={1} max={120}
            defaultValue={part.minutes ?? ""}
          />
        </div>

        <TextField
          label="Notes for the part" name="detail" defaultValue={part.detail ?? ""}
          placeholder="Proverbs 4:23; or: house to house, lmd lesson 3, point 4"
          hint="The scripture, the setting of a student assignment, or the lesson and point to work on."
        />

        <div className="border-t border-rule pt-3">
          <CheckField
            label="Also handled in the auxiliary classroom" name="dualHall"
            checked={dualHall} onChange={(e) => setDualHall(e.target.checked)}
            hint="Students move to the auxiliary classroom after Spiritual Gems and come back for the last part (S-38 par. 27). Untick it for a circuit overseer's week."
          />

          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {hallsFor(dualHall).map((hall) =>
              slots.map((slot: MidweekSlot) => {
                const field = slotField(slot, hall);
                // The id has to carry the part: several parts on this page ask
                // for a student in the main hall, and ids are page-wide.
                const id = `${part.id}-${field}`;
                return (
                  <div key={field}>
                    <label className="field-label" htmlFor={id}>
                      {SLOT_LABELS[slot]}
                      {dualHall ? ` — ${HALL_LABELS[hall].toLowerCase()}` : ""}
                    </label>
                    <NamePicker
                      id={id}
                      name={field}
                      options={people}
                      defaultValue={part.values[field] ?? ""}
                      emptyLabel="Not assigned yet"
                      placeholder="Type a name…"
                      clearOnSubmit={false}
                    />
                  </div>
                );
              }),
            )}
          </div>
        </div>

        <SubmitButton size="sm" pendingLabel="Saving…">Save part {part.position}</SubmitButton>
      </form>
    </div>
  );
}

/** Move a part up or down the schedule, or take it off altogether. */
function PartTools({
  partId, title, position, count,
}: { partId: string; title: string; position: number; count: number }) {
  const [, move] = useActionState<SchoolState, FormData>(movePart, {});
  const [, remove] = useActionState<SchoolState, FormData>(deletePart, {});

  return (
    <div className="flex shrink-0 items-center gap-1">
      <form action={move}>
        <input type="hidden" name="partId" value={partId} />
        <input type="hidden" name="direction" value="up" />
        <Button type="submit" size="sm" variant="ghost" disabled={position <= 1} aria-label={`Move ${title} up`}>
          ↑
        </Button>
      </form>
      <form action={move}>
        <input type="hidden" name="partId" value={partId} />
        <input type="hidden" name="direction" value="down" />
        <Button type="submit" size="sm" variant="ghost" disabled={position >= count} aria-label={`Move ${title} down`}>
          ↓
        </Button>
      </form>
      <form action={remove}>
        <input type="hidden" name="partId" value={partId} />
        <Button
          type="submit" size="sm" variant="ghost" aria-label={`Remove ${title}`}
          onClick={(e) => {
            if (!window.confirm(`Take “${title}” off the schedule? The rest are renumbered.`)) e.preventDefault();
          }}
        >
          ✕
        </Button>
      </form>
    </div>
  );
}

/** Adds one more line to a week, below whichever part is chosen. */
export function AddPartForm({ weekId, positions }: { weekId: string; positions: number[] }) {
  const [state, action] = useActionState<SchoolState, FormData>(addPart, {});
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="space-y-3 rounded border border-dashed border-rule-strong bg-paper p-4">
      <input type="hidden" name="weekId" value={weekId} />
      <p className="font-serif text-sm text-ink">Add a part</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="Title" name="title" required placeholder="Local needs" />
        <SelectField label="Section" name="section" options={SECTION_OPTIONS} defaultValue="LIVING" />
        <SelectField label="What it needs" name="kind" options={KIND_OPTIONS} defaultValue="TALK" />
        <TextField label="Minutes" name="minutes" type="number" min={1} max={120} defaultValue={15} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Add it after" name="afterPosition"
          options={positions.map((p) => ({ value: String(p), label: `Part ${p}` }))}
          defaultValue={String(positions[positions.length - 1] ?? 0)}
        />
        <div className="flex items-end pb-1">
          <CheckField label="Also handled in the auxiliary classroom" name="dualHall" />
        </div>
      </div>

      <SubmitButton size="sm" variant="secondary" pendingLabel="Adding…">Add this part</SubmitButton>
    </form>
  );
}
