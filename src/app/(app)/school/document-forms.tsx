"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { SelectField, TextField } from "@/components/fields";
import { Notice } from "@/components/shell";
import { Button, SubmitButton } from "@/components/ui";
import { MAX_DOCUMENT_BYTES } from "@/lib/school";
import { deleteSchoolDocument, uploadSchoolDocuments, type SchoolState } from "./actions";

export type ScopeOption = { value: string; label: string };

/**
 * Files the schedules printed before the app — Word, PDF and photographs of the
 * noticeboard — alongside the workbook pages the overseer wants to keep. Several
 * at once, because a period's worth of old schedules comes as a handful of files.
 */
export function UploadDocumentsForm({
  options, weekId, periodId,
}: {
  /** Periods and weeks to file under, as `period:<id>` and `week:<id>`. Omitted on a week's own page. */
  options?: ScopeOption[];
  weekId?: string;
  periodId?: string;
}) {
  const [state, action] = useActionState<SchoolState, FormData>(uploadSchoolDocuments, {});
  const [scope, setScope] = useState(weekId ? `week:${weekId}` : periodId ? `period:${periodId}` : "");
  const [saved, setSaved] = useState(0);
  const [tooBig, setTooBig] = useState<string | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  // A batch over the cap would cross the post limit and drop the page before
  // the server could refuse it, so it is weighed here first.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const together = [...(filesRef.current?.files ?? [])].reduce((sum, file) => sum + file.size, 0);
    if (together > MAX_DOCUMENT_BYTES) {
      event.preventDefault();
      setTooBig("Those files come to more than 3.5 MB together. File them in smaller batches.");
      return;
    }
    setTooBig(null);
  }

  const chosenWeek = options ? (scope.startsWith("week:") ? scope.slice(5) : "") : (weekId ?? "");
  const chosenPeriod = options ? (scope.startsWith("period:") ? scope.slice(7) : "") : (periodId ?? "");

  return (
    <form
      key={saved}
      action={action}
      onSubmit={onSubmit}
      className="space-y-3 rounded border border-dashed border-rule-strong bg-paper p-4"
    >
      <input type="hidden" name="weekId" value={chosenWeek} />
      <input type="hidden" name="periodId" value={chosenPeriod} />

      <p className="font-serif text-sm text-ink">File a document</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="What are these?" name="label" required
          placeholder="September–October 2024 schedules"
          error={state.errors?.label}
          hint="The name they are found under later."
        />
        {options && (
          <SelectField
            label="File it under" name="scope" options={options}
            value={scope} onChange={(e) => setScope(e.target.value)}
            placeholder="General — no schedule in particular"
          />
        )}
      </div>

      <div>
        <label htmlFor="documents" className="field-label">Files</label>
        <input
          ref={filesRef}
          id="documents" name="documents" type="file" multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,.rtf"
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border-0 file:bg-pine file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-pine-dark"
        />
        {tooBig
          ? <p className="field-error">{tooBig}</p>
          : state.errors?.documents
            ? <p className="field-error">{state.errors.documents}</p>
            : <p className="field-hint">Word, PDF and photographs — up to 3.5 MB across the files filed at once.</p>}
      </div>

      <SubmitButton size="sm" variant="secondary" pendingLabel="Filing…">File these</SubmitButton>
    </form>
  );
}

export function DeleteDocumentForm({ id, fileName }: { id: string; fileName: string }) {
  const [, action] = useActionState<SchoolState, FormData>(deleteSchoolDocument, {});

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit" size="sm" variant="ghost" aria-label={`Delete ${fileName}`}
        onClick={(e) => {
          if (!window.confirm(`Delete ${fileName} from the archive?`)) e.preventDefault();
        }}
      >
        ✕
      </Button>
    </form>
  );
}
