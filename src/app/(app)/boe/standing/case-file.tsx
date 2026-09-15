"use client";

import { useActionState, useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/ui";
import { uploadCaseDocuments, deleteCaseDocument, type DocumentState } from "./actions";

export type CaseDocument = { id: string; fileName: string; size: number; createdAt: Date };

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older phones and non-https previews have no async clipboard API.
    const box = document.createElement("textarea");
    box.value = text;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(box);
    return ok;
  }
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The wording the envelope has to carry: the decisions the committee made and
 * the dates of those decisions. Kept here so it can be copied onto the envelope
 * or into a letter of introduction.
 */
export function EnvelopeIndication({ lines }: { lines: string[] }) {
  const [label, setLabel] = useState("Copy");

  const onCopy = async () => {
    const ok = await copyText(lines.join("\n"));
    setLabel(ok ? "Copied" : "Select it instead");
    window.setTimeout(() => setLabel("Copy"), 2000);
  };

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-ink-soft hover:text-pine">
        What the envelope must state
      </summary>
      <div className="mt-2 rounded border border-rule bg-paper p-3">
        <pre className="whitespace-pre-wrap font-mono text-xs text-ink">{lines.join("\n")}</pre>
        <button
          type="button"
          onClick={onCopy}
          className="mt-2 rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
        >
          {label}
        </button>
      </div>
    </details>
  );
}

/** Adds scans of letters, the signed S-77 and anything else kept with the case. */
function UploadForm({ recordId }: { recordId: string }) {
  const [state, action] = useActionState<DocumentState, FormData>(uploadCaseDocuments, {});
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form key={saved} action={action} className="mt-3 space-y-2">
      <input type="hidden" name="recordId" value={recordId} />
      <label htmlFor={`doc-${recordId}`} className="field-label">Add documents to this case</label>
      <input
        id={`doc-${recordId}`}
        name="documents"
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.txt,.rtf,.msg,.eml"
        className="field-input text-xs"
      />
      {state.errors?.documents && <p className="field-error">{state.errors.documents}</p>}
      {state.error && <p className="field-error">{state.error}</p>}
      {state.ok && <p className="text-xs text-pine-dark">{state.ok}</p>}
      <SubmitButton variant="secondary" size="sm" pendingLabel="Uploading…">Upload</SubmitButton>
      <p className="field-hint">Scans, photos and letters up to 10 MB each. They travel with the folder export.</p>
    </form>
  );
}

function RemoveDocumentButton({ id, fileName }: { id: string; fileName: string }) {
  const [state, action] = useActionState<DocumentState, FormData>(deleteCaseDocument, {});
  return (
    <form action={action}>
      <input type="hidden" name="documentId" value={id} />
      <button
        type="submit"
        className="rounded border border-rule-strong px-2 py-0.5 text-xxs text-ink-soft hover:border-clay hover:text-clay"
        onClick={(e) => {
          if (!window.confirm(`Take ${fileName} off this case file?`)) e.preventDefault();
        }}
      >
        Remove
      </button>
      {state.error && <span className="ml-2 text-xxs text-clay">{state.error}</span>}
    </form>
  );
}

/** The S-77 record, the envelope wording and every document kept with a case. */
export function CaseFile({
  recordId, documents, canWrite,
}: {
  recordId: string;
  documents: CaseDocument[];
  canWrite: boolean;
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-ink-soft hover:text-pine">
        Case file{documents.length > 0 ? ` · ${documents.length} document${documents.length === 1 ? "" : "s"}` : ""}
      </summary>

      <div className="mt-2 rounded border border-rule bg-paper p-3">
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/exports/s77/${recordId}`}
            className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
          >
            S-77 record (PDF)
          </a>
          <a
            href={`/api/exports/s77/${recordId}/folder`}
            className="rounded border border-rule-strong px-2 py-1 text-xs text-ink-soft hover:border-pine hover:text-pine"
          >
            Whole folder (ZIP)
          </a>
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          The folder holds the S-77 record, the envelope wording and everything uploaded below.
        </p>

        {documents.length > 0 && (
          <ul className="mt-3 divide-y divide-rule border-t border-rule">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <a
                  href={`/api/standing/documents/${d.id}`}
                  className="text-xs text-ink hover:text-pine hover:underline"
                >
                  {d.fileName}
                </a>
                <span className="text-xxs text-ink-faint">
                  {sizeLabel(d.size)} · added {formatDate(d.createdAt)}
                </span>
                {canWrite && (
                  <span className="ml-auto">
                    <RemoveDocumentButton id={d.id} fileName={d.fileName} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {documents.length === 0 && (
          <p className="mt-3 text-xs text-ink-faint">No documents on file for this entry yet.</p>
        )}

        {canWrite && <UploadForm recordId={recordId} />}
        {!canWrite && <p className="mt-3 text-xs text-ink-faint">Only the secretary and elders can add to a case file.</p>}
      </div>
    </details>
  );
}
