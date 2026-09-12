"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import {
  previewImport, commitImport, previewReportImport, commitReportImport,
  previewCardImport, commitCardImport,
  type ImportState, type ReportImportState, type CardImportState,
} from "./actions";
import { DataTable, Th, Td, Notice } from "@/components/shell";
import { SubmitButton, Badge } from "@/components/ui";
import { APPOINTMENT_LABELS, PIONEER_LABELS, formatDate } from "@/lib/format";
import { MONTH_SHORT, serviceYearLabel } from "@/lib/service-year";

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,.xls";

const PUBLISHER_SAMPLE = `Name,Sex,Date of Baptism,Service Group,Appointment,Pioneer,Phone
Adebayo, Samuel,M,12/03/2011,Group 2,Elder,Regular,+234 802 000 0001
Chukwu, Grace,F,04/08/2016,3,,Auxiliary,+234 803 000 0002
Ibrahim Musa,Male,,Group 1,Ministerial Servant,,`;

const REPORT_SAMPLE = `Name,Sep 2025,Oct 2025,Nov 2025,Dec 2025
Adebayo, Samuel,52 (3),50 (3),55 (4),
Chukwu, Grace,✓,✓,30 AP,✓
Ibrahim Musa,✓,,✓ (1),✓`;

type Publisher = { id: string; name: string };

export function ImportTool({
  publishers,
  serviceYears,
}: {
  publishers: Publisher[];
  serviceYears: number[];
}) {
  const [tab, setTab] = useState<"publishers" | "cards" | "reports">("publishers");

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="What to import" className="flex gap-1 border-b border-rule">
        {[
          ["publishers", "Publisher roster"],
          ["cards", "S-21 cards (PDF)"],
          ["reports", "Field service sheets"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key as typeof tab)}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              tab === key
                ? "border-pine font-medium text-pine-dark"
                : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div hidden={tab !== "publishers"}>
        <PublisherImport />
      </div>
      <div hidden={tab !== "cards"}>
        <CardImport serviceYears={serviceYears} />
      </div>
      <div hidden={tab !== "reports"}>
        <ReportImport publishers={publishers} serviceYears={serviceYears} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ source

/** Paste box plus file picker. Whichever is filled is used; a file wins. */
function SourceInput({ id, sample, defaultValue }: { id: string; sample: string; defaultValue?: string }) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-file`} className="field-label">
          Choose a spreadsheet
        </label>
        <input
          id={`${id}-file`}
          name="file"
          type="file"
          accept={ACCEPT}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border file:border-rule-strong file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-paper"
        />
        <p className="field-hint">
          Excel (.xlsx) or CSV. The first worksheet is read.
          {fileName && <> Selected: <span className="text-ink">{fileName}</span>.</>}
        </p>
      </div>

      <p className="text-xs text-ink-faint">— or —</p>

      <div>
        <label htmlFor={`${id}-csv`} className="field-label">
          Paste your rows, including the header line
        </label>
        <textarea
          id={`${id}-csv`}
          name="csv"
          rows={8}
          defaultValue={defaultValue}
          placeholder={sample}
          className="field-input font-mono text-xs"
          spellCheck={false}
        />
        <p className="field-hint">
          Copy the cells straight out of Excel or Google Sheets and paste here. Nothing is written
          until you check the preview.
        </p>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- publishers

function PublisherImport() {
  const [preview, runPreview] = useActionState<ImportState, FormData>(previewImport, {});
  const [result, runCommit] = useActionState<ImportState, FormData>(commitImport, {});

  const rows = preview.preview?.rows ?? [];
  const duplicates = rows.filter((r) => r.duplicate).length;

  return (
    <div className="space-y-8">
      <form action={runPreview} className="space-y-3">
        <SourceInput id="pub" sample={PUBLISHER_SAMPLE} defaultValue={preview.csv} />
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

// ----------------------------------------------------------------- reports

const LAYOUT_LABELS = {
  grid: "a grid with months across the top",
  long: "a list with one row per report",
  card: "a single publisher's card",
};

function ReportImport({ publishers, serviceYears }: { publishers: Publisher[]; serviceYears: number[] }) {
  const [preview, runPreview] = useActionState<ReportImportState, FormData>(previewReportImport, {});
  const [result, runCommit] = useActionState<ReportImportState, FormData>(commitReportImport, {});

  const p = preview.preview;
  const rows = p?.rows ?? [];
  const matched = rows.filter((r) => r.publisherId);
  const importable = matched.filter((r) => !r.existing).length;
  const existing = p?.existingCount ?? 0;

  const monthLabel = (year: number, month: number) => `${MONTH_SHORT[month - 1]} ${year}`;

  return (
    <div className="space-y-8">
      <form action={runPreview} className="space-y-5">
        <SourceInput id="rep" sample={REPORT_SAMPLE} defaultValue={preview.csv} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="rep-year" className="field-label">Service year</label>
            <select id="rep-year" name="serviceYear" defaultValue={preview.serviceYear} className="field-input">
              {serviceYears.map((y) => (
                <option key={y} value={y}>{serviceYearLabel(y)}</option>
              ))}
            </select>
            <p className="field-hint">Used when the sheet names months without a year.</p>
          </div>
          <div>
            <label htmlFor="rep-meaning" className="field-label">Numbers in the cells are</label>
            <select id="rep-meaning" name="cellMeaning" defaultValue={preview.cellMeaning ?? "hours"} className="field-input">
              <option value="hours">Hours</option>
              <option value="studies">Bible studies</option>
              <option value="tick">Just a tick for “shared”</option>
            </select>
            <p className="field-hint">For grid sheets. Lists with their own columns ignore this.</p>
          </div>
          <div>
            <label htmlFor="rep-card" className="field-label">Whose card is this?</label>
            <select id="rep-card" name="cardPublisherId" defaultValue={preview.cardPublisherId ?? ""} className="field-input">
              <option value="">Not a single card</option>
              {publishers.map((pub) => (
                <option key={pub.id} value={pub.id}>{pub.name}</option>
              ))}
            </select>
            <p className="field-hint">Only for an S-21 sheet with no name column.</p>
          </div>
        </div>

        {preview.error && <Notice tone="error">{preview.error}</Notice>}
        <SubmitButton variant="secondary" pendingLabel="Reading…">Check the sheet</SubmitButton>
      </form>

      {p && rows.length > 0 && (
        <section className="border-t border-rule pt-7">
          <h2 className="mb-1 font-serif text-base">
            {rows.length} report{rows.length === 1 ? "" : "s"} read
          </h2>
          <p className="mb-4 text-sm text-ink-soft">
            Read as {LAYOUT_LABELS[p.layout]}, covering{" "}
            {p.months
              .slice()
              .sort((a, b) => a.year - b.year || a.month - b.month)
              .map((m) => monthLabel(m.year, m.month))
              .join(", ")}
            . {matched.length} matched to publishers on file.
          </p>

          {p.problems.length > 0 && (
            <Notice tone="error">
              <p className="mb-1 font-medium">
                {p.problems.length} cell{p.problems.length === 1 ? "" : "s"} could not be read and will be left out.
              </p>
              <ul className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto">
                {p.problems.map((x, i) => (
                  <li key={`${x.line}-${i}`}>Line {x.line}: {x.message}</li>
                ))}
              </ul>
            </Notice>
          )}

          {p.unmatched.length > 0 && (
            <Notice tone="error">
              <p className="mb-1 font-medium">
                {p.unmatched.length} name{p.unmatched.length === 1 ? " is" : "s are"} not on file, so their
                reports will be left out:
              </p>
              <p className="text-xs">{p.unmatched.join(" · ")}</p>
              <p className="mt-1 text-xs">
                Import those publishers first, or correct the spelling on the sheet to match their record.
              </p>
            </Notice>
          )}

          {existing > 0 && (
            <Notice>
              {existing} of these month{existing === 1 ? " is" : "s are"} already on file. They are marked
              below and left untouched unless you tick “replace” before importing.
            </Notice>
          )}

          <DataTable>
            <thead>
              <tr>
                <Th>On the sheet</Th>
                <Th>Publisher</Th>
                <Th>Month</Th>
                <Th>Shared</Th>
                <Th align="right">Studies</Th>
                <Th align="right">Hours</Th>
                <Th>Pioneer</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 150).map((r, i) => (
                <tr
                  key={`${r.line}-${r.year}-${r.month}-${i}`}
                  className={clsx(!r.publisherId && "bg-clay-light/40", r.existing && "bg-wheat-light/50")}
                >
                  <Td className="text-ink-soft">{r.name ?? "—"}</Td>
                  <Td>
                    {r.publisherName ?? (
                      <Badge tone="bad">{r.ambiguous ? "More than one match" : "Not on file"}</Badge>
                    )}
                  </Td>
                  <Td className="text-ink-soft">{monthLabel(r.year, r.month)}</Td>
                  <Td className="text-ink-soft">{r.shared ? "Yes" : "No"}</Td>
                  <Td align="right" className="text-ink-soft">{r.shared ? r.studies : "—"}</Td>
                  <Td align="right" className="text-ink-soft">{r.shared && r.hours !== null ? r.hours : "—"}</Td>
                  <Td className="text-ink-soft">{r.aux ? "Auxiliary" : "—"}</Td>
                  <Td align="right">{r.existing && <Badge tone="warn">On file</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {rows.length > 150 && (
            <p className="mt-2 text-xs text-ink-faint">
              Showing the first 150 of {rows.length}.
            </p>
          )}

          <form action={runCommit} className="mt-5 space-y-3 border-t border-rule pt-5">
            <input type="hidden" name="csv" value={preview.csv} />
            <input type="hidden" name="serviceYear" value={preview.serviceYear} />
            <input type="hidden" name="cellMeaning" value={preview.cellMeaning} />
            <input type="hidden" name="cardPublisherId" value={preview.cardPublisherId ?? ""} />

            {existing > 0 && (
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="overwrite"
                  value="true"
                  className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
                />
                <span className="text-sm text-ink">
                  Replace the {existing} month{existing === 1 ? "" : "s"} already on file with the sheet’s figures
                  <span className="block text-xs text-ink-faint">
                    Leave unticked to keep what is already recorded and add only the missing months.
                  </span>
                </span>
              </label>
            )}

            {result.error && <Notice tone="error">{result.error}</Notice>}
            {result.ok && <Notice tone="success">{result.ok}</Notice>}

            <SubmitButton pendingLabel="Importing…" disabled={matched.length === 0}>
              Import {importable} report{importable === 1 ? "" : "s"}
              {existing > 0 ? ` (${matched.length} if replacing)` : ""}
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- cards

function CardImport({ serviceYears }: { serviceYears: number[] }) {
  const [preview, runPreview] = useActionState<CardImportState, FormData>(previewCardImport, {});
  const [result, runCommit] = useActionState<CardImportState, FormData>(commitCardImport, {});
  const [count, setCount] = useState(0);

  const p = preview.preview;
  const rows = p?.rows ?? [];
  const usable = rows.filter((r) => r.name && r.months.length > 0 && !r.ambiguous);
  const importable = p ? p.totalMonths - p.existingMonths : 0;

  return (
    <div className="space-y-8">
      <form action={runPreview} className="space-y-5">
        <div>
          <label htmlFor="cards-files" className="field-label">
            Choose the S-21 PDF files
          </label>
          <input
            id="cards-files"
            name="files"
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={(e) => setCount(e.target.files?.length ?? 0)}
            className="block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border file:border-rule-strong file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-paper"
          />
          <p className="field-hint">
            The filled-in Congregation’s Publisher Record forms, as saved from the PDF. You can select
            many at once; about 3 MB per batch.
            {count > 0 && <> {count} file{count === 1 ? "" : "s"} selected.</>}
          </p>
        </div>

        <div className="max-w-xs">
          <label htmlFor="cards-year" className="field-label">If a card has no service year filled in</label>
          <select id="cards-year" name="serviceYear" defaultValue={preview.serviceYear} className="field-input">
            {serviceYears.map((y) => (
              <option key={y} value={y}>{serviceYearLabel(y)}</option>
            ))}
          </select>
          <p className="field-hint">Normally the year is read from the card. This is only a fallback.</p>
        </div>

        {preview.error && <Notice tone="error">{preview.error}</Notice>}
        <SubmitButton variant="secondary" pendingLabel="Reading cards…">Read the cards</SubmitButton>
      </form>

      {p && rows.length > 0 && (
        <section className="border-t border-rule pt-7">
          <h2 className="mb-1 font-serif text-base">
            {rows.length} card{rows.length === 1 ? "" : "s"} read
          </h2>
          <p className="mb-4 text-sm text-ink-soft">
            {p.totalMonths} month{p.totalMonths === 1 ? "" : "s"} of reports across {usable.length} usable card
            {usable.length === 1 ? "" : "s"}.
            {p.newPublishers > 0 && (
              <> {p.newPublishers} {p.newPublishers === 1 ? "person is" : "people are"} not on file yet and will get a new record from the card.</>
            )}
            {p.existingMonths > 0 && (
              <> {p.existingMonths} month{p.existingMonths === 1 ? " is" : "s are"} already on file and will be left alone unless you tick “replace”.</>
            )}
          </p>

          <DataTable>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Name on card</Th>
                <Th>Record</Th>
                <Th>Sex</Th>
                <Th>Baptized</Th>
                <Th>Standing</Th>
                <Th>Service year</Th>
                <Th align="right">Months</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bad = !r.name || r.months.length === 0 || r.ambiguous;
                return (
                  <tr key={r.fileName} className={bad ? "bg-clay-light/40" : r.publisherId ? "" : "bg-pine-light/30"}>
                    <Td className="text-xs text-ink-soft"><span className="block max-w-[12rem] truncate" title={r.fileName}>{r.fileName}</span></Td>
                    <Td>
                      {r.name ?? <Badge tone="bad">No name</Badge>}
                      {r.problems.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xxs text-clay">
                          {r.problems.map((x, i) => <li key={i}>{x}</li>)}
                        </ul>
                      )}
                    </Td>
                    <Td>
                      {r.ambiguous ? (
                        <Badge tone="bad">More than one match</Badge>
                      ) : r.publisherId ? (
                        <span className="text-ink-soft">{r.publisherName}</span>
                      ) : r.name ? (
                        <Badge tone="good">New record</Badge>
                      ) : "—"}
                    </Td>
                    <Td className="text-ink-soft">{r.gender ? (r.gender === "MALE" ? "M" : "F") : <Badge tone="warn">not ticked</Badge>}</Td>
                    <Td className="text-ink-soft">{r.baptismDate ?? "—"}</Td>
                    <Td className="text-ink-soft">
                      {[
                        r.appointment !== "PUBLISHER" && APPOINTMENT_LABELS[r.appointment],
                        r.pioneerStatus !== "NONE" && PIONEER_LABELS[r.pioneerStatus],
                      ].filter(Boolean).join(" · ") || "Publisher"}
                    </Td>
                    <Td className="text-ink-soft">{r.serviceYears.map(serviceYearLabel).join(", ") || "—"}</Td>
                    <Td align="right" className="text-ink-soft">
                      {r.months.length}
                      {r.existingMonths > 0 && <span className="ml-1"><Badge tone="warn">{r.existingMonths} on file</Badge></span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          <form action={runCommit} className="mt-5 space-y-3 border-t border-rule pt-5">
            <input type="hidden" name="cards" value={preview.cards ?? ""} />

            {p.newPublishers > 0 && (
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="createMissing"
                  value="true"
                  defaultChecked
                  className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
                />
                <span className="text-sm text-ink">
                  Create publisher records for the {p.newPublishers} {p.newPublishers === 1 ? "person" : "people"} not on file
                  <span className="block text-xs text-ink-faint">
                    Name, sex, dates of birth and baptism, appointment and pioneer standing are taken from the card.
                    Service group is left blank; set it on the record afterwards.
                  </span>
                </span>
              </label>
            )}

            {p.existingMonths > 0 && (
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="overwrite"
                  value="true"
                  className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
                />
                <span className="text-sm text-ink">
                  Replace the {p.existingMonths} month{p.existingMonths === 1 ? "" : "s"} already on file with the cards’ figures
                  <span className="block text-xs text-ink-faint">
                    Leave unticked to keep what is already recorded and add only the missing months.
                  </span>
                </span>
              </label>
            )}

            {result.error && <Notice tone="error">{result.error}</Notice>}
            {result.ok && <Notice tone="success">{result.ok}</Notice>}

            <SubmitButton pendingLabel="Importing…" disabled={usable.length === 0}>
              Import {importable} report{importable === 1 ? "" : "s"}
              {p.existingMonths > 0 ? ` (${p.totalMonths} if replacing)` : ""}
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
