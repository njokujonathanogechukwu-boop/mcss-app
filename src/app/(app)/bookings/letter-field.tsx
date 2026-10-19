"use client";

import { useId, useState } from "react";

const MAX = 3 * 1024 * 1024;

/**
 * The letter asking for the hall, attached to the request so the operating
 * committee can read it. A file over the limit is refused here, before the
 * post would be dropped for its size.
 */
export function LetterField({
  current, error,
}: {
  /** The letter already attached, when editing a booking. */
  current?: { fileName: string; href: string } | null;
  error?: string;
}) {
  const id = useId();
  const [tooBig, setTooBig] = useState(false);
  const [remove, setRemove] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {current ? "Replace the request letter" : "Request letter (optional)"}
      </label>
      {current && (
        <p className="mb-1.5 text-xs text-ink-soft">
          Attached:{" "}
          <a href={current.href} target="_blank" rel="noopener" className="text-pine hover:underline">
            {current.fileName}
          </a>
        </p>
      )}
      <input
        id={id}
        name="letter"
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
        onChange={(e) => {
          const big = (e.currentTarget.files?.[0]?.size ?? 0) > MAX;
          setTooBig(big);
          if (big) e.currentTarget.value = "";
        }}
        className="block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border-0 file:bg-pine file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-pine-dark"
      />
      {tooBig ? (
        <p className="field-error">That file is over 3 MB. Scan or photograph the letter at a smaller size.</p>
      ) : error ? (
        <p className="field-error">{error}</p>
      ) : (
        <p className="field-hint">The letter asking for the hall — PDF, Word or a photograph, up to 3 MB. The operating committee can open it from their emails.</p>
      )}
      {current && (
        <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-soft">
          <input
            type="checkbox"
            name="removeLetter"
            value="true"
            checked={remove}
            onChange={(e) => setRemove(e.target.checked)}
            className="h-3.5 w-3.5 rounded-sm border-rule-strong text-pine focus:ring-pine"
          />
          Remove the attached letter
        </label>
      )}
    </div>
  );
}
