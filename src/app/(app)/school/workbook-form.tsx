"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SelectField, TextField } from "@/components/fields";
import { Notice } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import { PART_KINDS, WEEKDAY_LABELS, clockLabel } from "@/lib/school";
import { importWorkbook, type WorkbookState } from "./actions";
import { WEEKDAY_OPTIONS } from "./school-forms";

type Preview = NonNullable<WorkbookState["preview"]>;

/**
 * Builds a schedule out of a workbook. The file is read first and what is found
 * is laid out for the overseer to check, because a part that is missed or misread
 * would otherwise sit quietly on the schedule all period. Nothing is written
 * until it is confirmed, and the confirmed pass reads the same upload again, so
 * what was shown is what is written.
 */
export function WorkbookImportForm({
  defaultWeekday, defaultHour, defaultMinute, taken,
}: {
  defaultWeekday: number;
  defaultHour: number;
  defaultMinute: number;
  /** The periods already on file, so the overseer knows a rebuild replaces one. */
  taken: string[];
}) {
  const [state, action] = useActionState<WorkbookState, FormData>(importWorkbook, {});
  const [attempt, setAttempt] = useState(0);
  const [readError, setReadError] = useState<string | null>(null);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const bypass = useRef(false);
  const { preview, settings } = state;

  useEffect(() => {
    if (state.periodId) router.push(`/school/periods/${state.periodId}`);
  }, [state.periodId, router]);

  // The EPUB itself is far too large to post, so its readable text — the OPF and
  // the chapter XHTML — is pulled out here in the browser and only that is sent.
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (bypass.current) {
      bypass.current = false;
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    event.preventDefault();
    setReadError(null);
    try {
      const entries = await extractEntries(file);
      if (!textRef.current || !nameRef.current) return;
      textRef.current.value = JSON.stringify(entries);
      nameRef.current.value = file.name;
    } catch {
      setReadError("That EPUB could not be opened here. Download it again from jw.org and choose it once more.");
      return;
    }
    bypass.current = true;
    event.currentTarget.requestSubmit();
  }

  return (
    <form
      key={attempt}
      action={action}
      onSubmit={onSubmit}
      className="space-y-4 rounded border border-dashed border-rule-strong bg-paper p-4"
    >
      <div>
        <p className="font-serif text-sm text-ink">Build a schedule from a workbook</p>
        <p className="mt-1 text-xs text-ink-soft">
          Upload the <strong>EPUB</strong> of <em>Our Christian Life and Ministry—Meeting Workbook</em>. Every week,
          part, length, song and Bible reading is read out of it, so only the names are left to fill in. The PDF and
          the JWPUB cannot be read as text — file those under the archive instead.
        </p>
      </div>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.errors?.workbook && <Notice tone="error">{state.errors.workbook}</Notice>}
      {readError && <Notice tone="error">{readError}</Notice>}

      <input type="hidden" name="workbookText" ref={textRef} defaultValue="" />
      <input type="hidden" name="workbookName" ref={nameRef} defaultValue="" />

      {/* Stays mounted once a file is chosen, so the confirmed pass posts the
          very upload that was previewed rather than asking for it again. */}
      <input
        ref={fileRef}
        type="file"
        name="workbook"
        accept=".epub,application/epub+zip"
        required={!preview}
        hidden={Boolean(preview)}
        className="block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border file:border-rule-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
      />

      {preview && settings ? (
        <>
          <input type="hidden" name="confirm" value="1" />
          <input type="hidden" name="meetingWeekday" value={String(settings.meetingWeekday)} />
          <input type="hidden" name="startHour" value={String(settings.startHour)} />
          <input type="hidden" name="startMinute" value={String(settings.startMinute)} />
          <input type="hidden" name="label" value={settings.label} />

          <p className="rounded border border-rule bg-surface px-3 py-2 text-sm text-ink-soft">
            {WEEKDAY_LABELS[settings.meetingWeekday]}s at {clockLabel(settings.startHour, settings.startMinute)}
            {settings.label ? ` · named “${settings.label}”` : ""}
          </p>

          {state.ok && <Notice tone="info">{state.ok}</Notice>}
          <PreviewTable weeks={preview.weeks} />

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton size="sm" pendingLabel="Building…">Build the schedule</SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              Start again
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Day of the meeting" name="meetingWeekday" options={WEEKDAY_OPTIONS}
              defaultValue={String(defaultWeekday)} error={state.errors?.meetingWeekday}
            />
            <TextField
              label="Time it starts" name="startHour" type="number" min={0} max={23} required
              defaultValue={defaultHour} hint="The hour, 24-hour clock. 18 is 6:00 pm."
              error={state.errors?.startHour}
            />
            <TextField
              label="Minutes past the hour" name="startMinute" type="number" min={0} max={59} required
              defaultValue={defaultMinute} error={state.errors?.startMinute}
            />
            <TextField
              label="Name for it" name="label" placeholder="September–October 2026"
              hint="Optional. Left blank it is named after the two months."
            />
          </div>

          {taken.length > 0 && (
            <p className="text-xs text-ink-faint">
              Already on file: {taken.join(", ")}. Uploading the workbook for one of these rebuilds its weeks, which
              is only allowed while no names have been given out against it.
            </p>
          )}

          {state.ok && <Notice tone="error">{state.ok}</Notice>}
          <SubmitButton size="sm" variant="secondary" pendingLabel="Reading…">Read the workbook</SubmitButton>
        </>
      )}
    </form>
  );
}

/** The OPF and the chapter XHTML of an EPUB, read here so only text is posted. */
async function extractEntries(file: File): Promise<Record<string, string>> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries: Record<string, string> = {};
  for (const path of Object.keys(zip.files)) {
    if (!/(\.opf|\.xhtml)$/i.test(path)) continue;
    const entry = zip.file(path);
    if (entry) entries[path] = await entry.async("string");
  }
  return entries;
}

function PreviewTable({ weeks }: { weeks: Preview["weeks"] }) {
  return (
    <div className="space-y-2">
      {weeks.map((week) => (
        <details key={week.meeting} className="rounded border border-rule bg-surface">
          <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
            <span className="font-serif text-sm text-ink">{formatMeeting(week.meeting)}</span>
            <span className="text-xs text-ink-faint">{week.label}</span>
            {week.bibleReading && <span className="text-xs text-ink-soft">{week.bibleReading}</span>}
            <span className="ml-auto text-xs text-ink-faint">
              Songs {week.openingSong ?? "—"}/{week.livingSong ?? "—"}/{week.closingSong ?? "—"} ·{" "}
              {week.parts.length ? `${week.parts.length} parts` : "no meeting"}
            </span>
          </summary>
          {week.parts.length === 0 ? (
            <p className="border-t border-rule px-3 py-2 text-sm text-clay">
              The workbook prints no parts for this week, so it will be marked as no meeting. Change that on the
              week's own page if that is wrong.
            </p>
          ) : (
            <ol className="border-t border-rule px-3 py-1 text-sm">
              {week.parts.map((part) => (
                <li
                  key={part.position}
                  className="flex flex-wrap items-baseline gap-x-2 border-b border-rule/50 py-1.5 last:border-0"
                >
                  <span className="w-5 shrink-0 text-right text-xs text-ink-faint">{part.position}.</span>
                  <span className="text-ink">{part.title}</span>
                  <span className="text-xs text-ink-faint">
                    {part.minutes === null ? "—" : `${part.minutes} min`} · {PART_KINDS[part.kind].label}
                  </span>
                  {part.detail && <span className="w-full pl-7 text-xs text-ink-soft">{part.detail}</span>}
                </li>
              ))}
            </ol>
          )}
        </details>
      ))}
    </div>
  );
}

function formatMeeting(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
