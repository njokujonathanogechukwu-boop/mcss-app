"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SelectField, TextField } from "@/components/fields";
import { NamePicker, type NameOption } from "@/components/name-picker";
import { Notice } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import { SECTION_LABELS, SLOT_LABELS, historyOverridePath } from "@/lib/school";
import { WEEKDAY_OPTIONS } from "../school-forms";
import { importPastSchedule, type HistoryPerson, type HistoryState, type HistoryPreviewWeek } from "../actions";

/**
 * Files a schedule the congregation printed before the app. The file is read
 * and every printed name matched against the rolls, then laid out for the
 * overseer to check — a misread name would otherwise sit in the history and
 * skew the rotation — and nothing is written until it is confirmed.
 */
export function PastScheduleForm({
  people, defaultYear, defaultWeekday,
}: {
  people: NameOption[];
  defaultYear: number;
  defaultWeekday: number;
}) {
  const [state, action] = useActionState<HistoryState, FormData>(importPastSchedule, {});
  const [attempt, setAttempt] = useState(0);
  const router = useRouter();
  const { preview } = state;

  useEffect(() => {
    if (state.periodId) router.push(`/school/periods/${state.periodId}`);
  }, [state.periodId, router]);

  return (
    <form
      key={attempt}
      action={action}
      className="space-y-4 rounded border border-dashed border-rule-strong bg-paper p-4"
    >
      <div>
        <p className="font-serif text-sm text-ink">File a schedule from before the app</p>
        <p className="mt-1 text-xs text-ink-soft">
          A photo of the printed schedule (JPG or PNG), the Word file it was typed in, or a PDF. It is read and
          every printed name is matched against the rolls for you to check. Nothing is written until you confirm
          it, and the weeks it holds then count in the rotation.
        </p>
      </div>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.errors?.schedule && <Notice tone="error">{state.errors.schedule}</Notice>}

      <input
        type="file"
        name="schedule"
        accept=".jpg,.jpeg,.png,.webp,.docx,.pdf"
        required={!preview}
        hidden={Boolean(preview)}
        className="block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border file:border-rule-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
      />

      {preview ? (
        <>
          <input type="hidden" name="confirm" value="1" />
          <input type="hidden" name="parsed" value={state.parsed ?? ""} />
          {state.ok && <Notice tone="info">{state.ok}</Notice>}

          <div className="space-y-2 rounded border border-rule bg-surface p-3">
            <p className="font-serif text-sm text-ink">Before it is filed</p>
            <p className="text-xs text-ink-soft">
              The printed sheet carries no year, so the dates below are the ones the reader guessed. Set the year
              the meetings were held and the day of the week the congregation meets; every week is moved to that
              day before anything is written.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Year these meetings were held" name="fixYear" type="number" min={2000} max={2100} required
                defaultValue={defaultYear} error={state.errors?.fixYear}
              />
              <SelectField
                label="Day of the meeting" name="fixWeekday" options={WEEKDAY_OPTIONS}
                defaultValue={String(defaultWeekday)} error={state.errors?.fixWeekday}
              />
            </div>
          </div>

          <PreviewWeeks weeks={preview} people={people} />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton size="sm" pendingLabel="Filing…">File these weeks</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              Start again
            </Button>
          </div>
        </>
      ) : (
        <SubmitButton size="sm" variant="secondary" pendingLabel="Reading…">Read the schedule</SubmitButton>
      )}
    </form>
  );
}

function PreviewWeeks({ weeks, people }: { weeks: HistoryPreviewWeek[]; people: NameOption[] }) {
  return (
    <div className="space-y-2">
      {weeks.map((week, weekIndex) => (
        <details key={`${week.date ?? "undated"}-${weekIndex}`} open className="rounded border border-rule bg-surface">
          <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
            <span className="font-serif text-sm text-ink">{week.date ?? "No date read"}</span>
            {week.bibleReading && <span className="text-xs text-ink-soft">{week.bibleReading}</span>}
            <span className="ml-auto text-xs text-ink-faint">Songs {week.songs}</span>
          </summary>
          <div className="border-t border-rule px-3 py-2 text-sm">
            <p className="text-xs text-ink-soft">
              <Person label="Chairman" person={week.chairman} people={people} path={historyOverridePath(weekIndex, "chairman")} />
              {" · "}
              <Person label="Opening prayer" person={week.openingPrayer} people={people} path={historyOverridePath(weekIndex, "opening")} />
              {" · "}
              <Person label="Closing prayer" person={week.closingPrayer} people={people} path={historyOverridePath(weekIndex, "closing")} />
            </p>
            <ol className="mt-2 space-y-1">
              {week.parts.map((part) => (
                <li key={part.position} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="w-5 shrink-0 text-right text-xs text-ink-faint">{part.position}.</span>
                  <span className="text-ink">{part.title}</span>
                  <span className="text-xs text-ink-faint">
                    {part.minutes === null ? "—" : `${part.minutes} min`} · {SECTION_LABELS[part.section as keyof typeof SECTION_LABELS] ?? part.section}
                  </span>
                  {part.detail && <span className="w-full pl-7 text-xs text-ink-soft">{part.detail}</span>}
                  {part.names.map(({ slot, person }) => (
                    <span key={slot} className="w-full pl-7 text-xs">
                      <span className="text-ink-faint">{SLOT_LABELS[slot]}: </span>
                      <Person
                        person={person}
                        people={people}
                        path={historyOverridePath(weekIndex, "part", part.position, slot)}
                      />
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          </div>
        </details>
      ))}
    </div>
  );
}

function Person({
  label, person, people, path,
}: {
  label?: string;
  person: HistoryPerson | null;
  people: NameOption[];
  path: string;
}) {
  if (!person) return <>{label ? `${label}: —` : "—"}</>;
  if (person.raw === "CHAIRMAN") return <>{label ? `${label}: ` : ""}the chairman</>;
  if (person.name) return <>{label ? `${label}: ` : ""}<span className="text-ink">{person.name}</span></>;
  return (
    <>
      {label ? `${label}: ` : ""}
      <span className="text-clay">{person.raw}</span>
      {" — not on the rolls: "}
      <NamePicker
        id={`pick-${path}`}
        name={path}
        options={people}
        placeholder="Pick who this was…"
        ariaLabel={`Pick who ${person.raw} is`}
        className="inline-block w-56 align-baseline"
      />
    </>
  );
}
