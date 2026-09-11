"use client";

import { useActionState } from "react";
import { previewImport, commitImport, type ImportState } from "./actions";
import { DataTable, Th, Td, Notice } from "@/components/shell";
import { SubmitButton, Badge } from "@/components/ui";
import { APPOINTMENT_LABELS, PIONEER_LABELS, formatDate } from "@/lib/format";

const SAMPLE = `Name,Sex,Date of Baptism,Service Group,Appointment,Pioneer,Phone
Adebayo, Samuel,M,12/03/2011,Group 2,Elder,Regular,+234 802 000 0001
Chukwu, Grace,F,04/08/2016,3,,Auxiliary,+234 803 000 0002
Ibrahim Musa,Male,,Group 1,Ministerial Servant,,`;

export function ImportTool() {
  const [preview, runPreview] = useActionState<ImportState, FormData>(previewImport, {});
  const [result, runCommit] = useActionState<ImportState, FormData>(commitImport, {});

  const rows = preview.preview?.rows ?? [];
  const duplicates = rows.filter((r) => r.duplicate).length;

  return (
    <div className="space-y-8">
      <form action={runPreview} className="space-y-3">
        <label htmlFor="csv" className="field-label">
          Paste your rows, including the header line
        </label>
        <textarea
          id="csv"
          name="csv"
          rows={10}
          defaultValue={preview.csv}
          placeholder={SAMPLE}
          className="field-input font-mono text-xs"
          spellCheck={false}
        />
        <p className="field-hint">
          Copy the cells straight out of Excel or Google Sheets and paste here, or open a CSV in a
          text editor and paste its contents. Nothing is written until you check the preview.
        </p>
        {preview.error && <Notice tone="error">{preview.error}</Notice>}
        <SubmitButton variant="secondary" pendingLabel="Reading…">Check the rows</SubmitButton>
      </form>

      {preview.preview && rows.length > 0 && (
        <section className="border-t border-rule pt-7">
          <h2 className="mb-1 font-serif text-base">
            {rows.length} record{rows.length === 1 ? "" : "s"} read
          </h2>
          <p className="mb-4 text-sm text-ink-soft">
            Columns matched: {preview.preview.recognised.join(", ") || "none"}.
            {preview.preview.ignored.length > 0 && (
              <> Ignored: {preview.preview.ignored.join(", ")}.</>
            )}
          </p>

          {preview.preview.problems.length > 0 && (
            <Notice tone="error">
              <p className="mb-1 font-medium">
                {preview.preview.problems.length} thing{preview.preview.problems.length === 1 ? "" : "s"} to
                check. These rows will still import, but fix them afterwards.
              </p>
              <ul className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto">
                {preview.preview.problems.map((p, i) => (
                  <li key={`${p.line}-${i}`}>Line {p.line}: {p.message}</li>
                ))}
              </ul>
            </Notice>
          )}

          {duplicates > 0 && (
            <Notice>
              {duplicates} record{duplicates === 1 ? " matches a name" : "s match names"} already on
              file. They are marked below and skipped unless you say otherwise.
            </Notice>
          )}

          <DataTable>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Sex</Th>
                <Th>Baptized</Th>
                <Th>Group</Th>
                <Th>Appointment</Th>
                <Th>Pioneer</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.line} className={r.duplicate ? "bg-wheat-light/50" : ""}>
                  <Td>{r.lastName}, {r.firstName}</Td>
                  <Td className="text-ink-soft">{r.gender === "MALE" ? "M" : "F"}</Td>
                  <Td className="text-ink-soft">{r.baptismDate ? formatDate(r.baptismDate) : "—"}</Td>
                  <Td className="text-ink-soft">
                    {r.groupLabel ?? "—"}
                    {r.groupLabel && !r.groupResolved && (
                      <span className="ml-1"><Badge tone="warn">no match</Badge></span>
                    )}
                  </Td>
                  <Td className="text-ink-soft">{APPOINTMENT_LABELS[r.appointment]}</Td>
                  <Td className="text-ink-soft">{PIONEER_LABELS[r.pioneerStatus]}</Td>
                  <Td align="right">{r.duplicate && <Badge tone="warn">Already on file</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {rows.length > 100 && (
            <p className="mt-2 text-xs text-ink-faint">
              Showing the first 100. All {rows.length} will import.
            </p>
          )}

          <form action={runCommit} className="mt-5 space-y-3 border-t border-rule pt-5">
            <input type="hidden" name="csv" value={preview.csv} />
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                name="skipDuplicates"
                value="true"
                defaultChecked
                className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
              />
              <span className="text-sm text-ink">
                Skip names already on file
                <span className="block text-xs text-ink-faint">
                  Uncheck only if the congregation genuinely has two people with the same name.
                </span>
              </span>
            </label>

            {result.error && <Notice tone="error">{result.error}</Notice>}
            {result.ok && <Notice tone="success">{result.ok}</Notice>}

            <SubmitButton pendingLabel="Importing…">
              Import {duplicates ? rows.length - duplicates : rows.length} records
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
