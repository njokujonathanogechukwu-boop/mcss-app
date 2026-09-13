"use client";

import { useActionState, useMemo, useState } from "react";
import clsx from "clsx";
import {
  previewImport, commitImport, previewReportImport, commitReportImport,
  previewCardImport, commitCardImport,
  previewAttendanceImport, commitAttendanceImport, previewFormImport, commitFormImport,
  type ImportState, type ReportImportState, type CardImportState, type AttendanceImportState,
} from "./actions";
import type { S21Card, S21Month } from "@/lib/import-s21";
import { DataTable, Th, Td, Notice } from "@/components/shell";
import { SubmitButton, Badge } from "@/components/ui";
import { APPOINTMENT_LABELS, PIONEER_LABELS, formatDate } from "@/lib/format";
import { MONTH_NAMES, MONTH_SHORT, WEEKDAY_NAMES, calendarYearOf, serviceYearLabel } from "@/lib/service-year";

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,.xls";

const PUBLISHER_SAMPLE = `Name,Sex,Date of Baptism,Service Group,Appointment,Pioneer,Phone
Adebayo, Samuel,M,12/03/2011,Group 2,Elder,Regular,+234 802 000 0001
Chukwu, Grace,F,04/08/2016,3,,Auxiliary,+234 803 000 0002
Ibrahim Musa,Male,,Group 1,Ministerial Servant,,`;

const REPORT_SAMPLE = `Name,Sep 2025,Oct 2025,Nov 2025,Dec 2025
Adebayo, Samuel,52 (3),50 (3),55 (4),
Chukwu, Grace,✓,✓,30 AP,✓
Ibrahim Musa,✓,,✓ (1),✓`;

const ATTENDANCE_SAMPLE = `Month,Midweek meetings,Midweek total,Midweek average,Weekend meetings,Weekend total,Weekend average
September 2025,4,190,48,4,240,60
October 2025,5,235,47,4,244,61`;

type Publisher = { id: string; name: string };

export function ImportTool({
  publishers,
  serviceYears,
}: {
  publishers: Publisher[];
  serviceYears: number[];
}) {
  const [tab, setTab] = useState<"publishers" | "cards" | "reports" | "attendance">("publishers");

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="What to import" className="flex gap-1 border-b border-rule">
        {[
          ["publishers", "Publisher roster"],
          ["cards", "S-21 cards (PDF)"],
          ["reports", "Field service sheets"],
          ["attendance", "Meeting attendance"],
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
      <div hidden={tab !== "attendance"}>
        <AttendanceImport serviceYears={serviceYears} />
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
                    <Td className="text-xs text-ink-soft">
                      <span className="block max-w-[12rem] truncate" title={r.fileName}>{r.fileName}</span>
                      {r.scanned && <span className="mt-1 inline-block"><Badge tone="warn">scanned</Badge></span>}
                    </Td>
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

          <CardCommit
            key={preview.cards ?? ""}
            cardsJson={preview.cards ?? ""}
            serviceYears={serviceYears}
            fallbackYear={preview.serviceYear ?? serviceYears[0]}
            result={result}
            runCommit={runCommit}
          />
        </section>
      )}
    </div>
  );
}

// ------------------------------------------------------- typing in a card

/** September first: the order the months are printed on the card. */
const CARD_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const APPOINTMENTS = ["PUBLISHER", "MINISTERIAL_SERVANT", "ELDER"] as const;
const STANDING = ["NONE", "REGULAR", "SPECIAL"] as const;

function CardEditor({
  card,
  serviceYears,
  fallbackYear,
  onChange,
}: {
  card: S21Card;
  serviceYears: number[];
  fallbackYear: number;
  onChange: (next: S21Card) => void;
}) {
  const serviceYear = card.serviceYears[0] ?? fallbackYear;
  const patch = (next: Partial<S21Card>) => onChange({ ...card, ...next });
  const rowFor = (month: number) =>
    card.months.find((m) => m.month === month && m.year === calendarYearOf(serviceYear, month));

  const setMonth = (month: number, next: Partial<Omit<S21Month, "year" | "month">>) => {
    const year = calendarYearOf(serviceYear, month);
    const merged: S21Month = {
      year, month, shared: false, studies: 0, hours: null, aux: false, remarks: null,
      ...rowFor(month),
      ...next,
    };
    const blank = !merged.shared && !merged.aux && !merged.studies && merged.hours === null && !merged.remarks;
    patch({
      months: [
        ...card.months.filter((m) => !(m.month === month && m.year === year)),
        ...(blank ? [] : [merged]),
      ],
    });
  };

  const whole = (value: string) => (value.trim() === "" ? null : Math.trunc(Number(value)));
  const box = "h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="sm:col-span-2">
          <span className="field-label">Name on the card</span>
          <input
            value={card.name ?? ""}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Adebayo, Samuel"
            className="field-input"
          />
        </label>
        <label>
          <span className="field-label">Sex</span>
          <select
            value={card.gender ?? ""}
            onChange={(e) =>
              patch({
                gender: e.target.value === "MALE" ? "MALE" : e.target.value === "FEMALE" ? "FEMALE" : null,
              })
            }
            className="field-input"
          >
            <option value="">Not ticked</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
        </label>
        <label>
          <span className="field-label">Date of birth</span>
          <input
            value={card.dateOfBirth ?? ""}
            onChange={(e) => patch({ dateOfBirth: e.target.value || null })}
            placeholder="12/03/1990"
            className="field-input"
          />
        </label>
        <label>
          <span className="field-label">Date of baptism</span>
          <input
            value={card.baptismDate ?? ""}
            onChange={(e) => patch({ baptismDate: e.target.value || null })}
            placeholder="04/08/2011"
            className="field-input"
          />
        </label>
        <label>
          <span className="field-label">Appointment</span>
          <select
            value={card.appointment}
            onChange={(e) => patch({ appointment: e.target.value as S21Card["appointment"] })}
            className="field-input"
          >
            {APPOINTMENTS.map((v) => (
              <option key={v} value={v}>{APPOINTMENT_LABELS[v]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Pioneer standing</span>
          <select
            value={card.pioneerStatus}
            onChange={(e) => patch({ pioneerStatus: e.target.value as S21Card["pioneerStatus"] })}
            className="field-input"
          >
            {STANDING.map((v) => (
              <option key={v} value={v}>{PIONEER_LABELS[v]}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Service year on the card</span>
          <select
            value={serviceYear}
            onChange={(e) => {
              const year = Number(e.target.value);
              patch({
                serviceYears: [year],
                months: card.months.map((m) => ({ ...m, year: calendarYearOf(year, m.month) })),
              });
            }}
            className="field-input"
          >
            {serviceYears.map((y) => (
              <option key={y} value={y}>{serviceYearLabel(y)}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="field-label mb-1.5">The twelve months</p>
        <DataTable>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th>Shared</Th>
              <Th align="right">Studies</Th>
              <Th>Aux</Th>
              <Th align="right">Hours</Th>
              <Th>Remarks</Th>
            </tr>
          </thead>
          <tbody>
            {CARD_MONTHS.map((month) => {
              const row = rowFor(month);
              const name = `${MONTH_NAMES[month - 1]} ${calendarYearOf(serviceYear, month)}`;
              return (
                <tr key={month}>
                  <Td className={row ? "" : "text-ink-soft"}>{name}</Td>
                  <Td>
                    <input
                      type="checkbox"
                      checked={row?.shared ?? false}
                      onChange={(e) => setMonth(month, { shared: e.target.checked })}
                      aria-label={`Shared in ${name}`}
                      className={box}
                    />
                  </Td>
                  <Td align="right">
                    <input
                      inputMode="numeric"
                      value={row?.studies || ""}
                      onChange={(e) => setMonth(month, { studies: whole(e.target.value) ?? 0 })}
                      aria-label={`Bible studies in ${name}`}
                      className="field-input w-16 py-1 text-right"
                    />
                  </Td>
                  <Td>
                    <input
                      type="checkbox"
                      checked={row?.aux ?? false}
                      onChange={(e) => setMonth(month, { aux: e.target.checked })}
                      aria-label={`Auxiliary pioneer in ${name}`}
                      className={box}
                    />
                  </Td>
                  <Td align="right">
                    <input
                      inputMode="numeric"
                      value={row?.hours ?? ""}
                      onChange={(e) => setMonth(month, { hours: whole(e.target.value) })}
                      aria-label={`Hours in ${name}`}
                      className="field-input w-20 py-1 text-right"
                    />
                  </Td>
                  <Td>
                    <input
                      value={row?.remarks ?? ""}
                      onChange={(e) => setMonth(month, { remarks: e.target.value || null })}
                      aria-label={`Remarks for ${name}`}
                      className="field-input py-1"
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
        <p className="mt-2 text-xs text-ink-faint">
          A month with nothing in it is left out. Hours are kept only where the card gives them.
        </p>
      </div>
    </div>
  );
}

function CardCommit({
  cardsJson,
  serviceYears,
  fallbackYear,
  result,
  runCommit,
}: {
  cardsJson: string;
  serviceYears: number[];
  fallbackYear: number;
  result: CardImportState;
  runCommit: (formData: FormData) => void;
}) {
  const read = useMemo(() => JSON.parse(cardsJson || "[]") as S21Card[], [cardsJson]);
  const [cards, setCards] = useState(read);

  // Which cards need typing is settled from what the reader made of them, so
  // that a card does not leave the list while it is being typed in.
  const toType = useMemo(
    () => read.map((c, i) => (c.scanned === true || c.months.length === 0 ? i : -1)).filter((i) => i >= 0),
    [read],
  );

  const usable = cards.filter((c) => (c.name ?? "").trim() && c.months.length > 0);
  const months = usable.reduce((n, c) => n + c.months.length, 0);

  return (
    <form action={runCommit} className="mt-5 space-y-4 border-t border-rule pt-5">
      <input type="hidden" name="cards" value={JSON.stringify(cards)} />

      {toType.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            {toType.length} card{toType.length === 1 ? "" : "s"} could not be read from the file. Type in
            what {toType.length === 1 ? "is on it" : "are on them"} here; it is imported exactly like a
            card that was read.
          </p>
          {toType.map((index) => (
            <details key={index} open={toType.length === 1} className="rounded border border-rule bg-surface">
              <summary className="cursor-pointer px-4 py-2.5 text-sm">
                <span className="font-medium">{cards[index].name?.trim() || cards[index].fileName}</span>
                <span className="ml-2 text-xs text-ink-faint">
                  {cards[index].months.length} month{cards[index].months.length === 1 ? "" : "s"} filled in
                </span>
              </summary>
              <div className="border-t border-rule p-4">
                <CardEditor
                  card={cards[index]}
                  serviceYears={serviceYears}
                  fallbackYear={fallbackYear}
                  onChange={(next) => setCards((prev) => prev.map((c, i) => (i === index ? next : c)))}
                />
              </div>
            </details>
          ))}
        </div>
      )}

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="createMissing"
          value="true"
          defaultChecked
          className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
        />
        <span className="text-sm text-ink">
          Create a publisher record for anyone on a card who is not on file
          <span className="block text-xs text-ink-faint">
            Name, sex, dates of birth and baptism, appointment and pioneer standing come from the
            card. Service group is left blank; set it on the record afterwards.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          name="overwrite"
          value="true"
          className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
        />
        <span className="text-sm text-ink">
          Replace months that are already on file with the cards’ figures
          <span className="block text-xs text-ink-faint">
            Leave unticked to keep what is already recorded and add only the missing months.
          </span>
        </span>
      </label>

      {result.error && <Notice tone="error">{result.error}</Notice>}
      {result.ok && <Notice tone="success">{result.ok}</Notice>}

      <SubmitButton pendingLabel="Importing…" disabled={usable.length === 0}>
        Import {months} report{months === 1 ? "" : "s"} from {usable.length} card{usable.length === 1 ? "" : "s"}
      </SubmitButton>
    </form>
  );
}

// -------------------------------------------------------------- attendance

const ATTENDANCE_LAYOUTS = {
  list: "a list with one row per meeting",
  monthly: "one row per month, spread over the days the congregation met",
  mixed: "meetings and months together",
};

/** The service year and the two meeting days, which both sources need. */
function AttendanceOptions({
  state, serviceYears, yearHint, dayHint, withDefault,
}: {
  state: AttendanceImportState;
  serviceYears: number[];
  yearHint: string;
  dayHint: string;
  /** A sheet may leave out which meeting a row is about; an S-88 never does. */
  withDefault?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className={clsx("grid gap-4", withDefault ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
        <div>
          <label htmlFor="att-year" className="field-label">Service year</label>
          <select id="att-year" name="serviceYear" defaultValue={state.serviceYear} className="field-input">
            {serviceYears.map((y) => (
              <option key={y} value={y}>{serviceYearLabel(y)}</option>
            ))}
          </select>
          <p className="field-hint">{yearHint}</p>
        </div>
        <div>
          <label htmlFor="att-midweek" className="field-label">Midweek meeting is held on</label>
          <select id="att-midweek" name="midweekDay" defaultValue={state.midweekDay ?? 3} className="field-input">
            {WEEKDAY_NAMES.map((name, i) => (
              <option key={name} value={i}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="att-weekend" className="field-label">Weekend meeting is held on</label>
          <select id="att-weekend" name="weekendDay" defaultValue={state.weekendDay ?? 0} className="field-input">
            {WEEKDAY_NAMES.map((name, i) => (
              <option key={name} value={i}>{name}</option>
            ))}
          </select>
        </div>
        {withDefault && (
          <div>
            <label htmlFor="att-default" className="field-label">If a row does not say which</label>
            <select id="att-default" name="defaultType" defaultValue={state.defaultType ?? "MIDWEEK"} className="field-input">
              <option value="MIDWEEK">Midweek meeting</option>
              <option value="WEEKEND">Weekend meeting</option>
            </select>
          </div>
        )}
      </div>
      <p className="text-xs text-ink-faint">{dayHint}</p>
    </div>
  );
}

function AttendanceImport({ serviceYears }: { serviceYears: number[] }) {
  const [source, setSource] = useState<"form" | "sheet">("form");
  const [sheetPreview, runSheetPreview] = useActionState<AttendanceImportState, FormData>(previewAttendanceImport, {});
  const [sheetResult, runSheetCommit] = useActionState<AttendanceImportState, FormData>(commitAttendanceImport, {});
  const [formPreview, runFormPreview] = useActionState<AttendanceImportState, FormData>(previewFormImport, {});
  const [formResult, runFormCommit] = useActionState<AttendanceImportState, FormData>(commitFormImport, {});
  const [fileCount, setFileCount] = useState(0);

  const fromForm = source === "form";
  const state = fromForm ? formPreview : sheetPreview;
  const result = fromForm ? formResult : sheetResult;
  const runCommit = fromForm ? runFormCommit : runSheetCommit;

  return (
    <div className="space-y-8">
      <div role="group" aria-label="Where the attendance is" className="flex flex-wrap gap-2">
        {[
          ["form", "A filled-in S-88 (PDF)"],
          ["sheet", "A spreadsheet"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={source === key}
            onClick={() => setSource(key as typeof source)}
            className={clsx(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              source === key
                ? "border-pine bg-pine-light text-pine-dark"
                : "border-rule-strong text-ink-soft hover:border-pine hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {fromForm ? (
        <form action={runFormPreview} className="space-y-5">
          <div>
            <label htmlFor="att-forms" className="field-label">Choose the S-88 PDF files</label>
            <input
              id="att-forms"
              name="forms"
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={(e) => setFileCount(e.target.files?.length ?? 0)}
              className="block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border file:border-rule-strong file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-paper"
            />
            <p className="field-hint">
              The Congregation Meeting Attendance Record, as saved from the PDF with its boxes filled
              in. One form carries two service years of both meetings, so a single file is usually
              enough; about 5 MB per batch.
              {fileCount > 0 && <> {fileCount} file{fileCount === 1 ? "" : "s"} selected.</>}
            </p>
          </div>

          <AttendanceOptions
            state={state}
            serviceYears={serviceYears}
            yearHint="Used only for a block whose own service-year box was left blank."
            dayHint="An S-88 keeps a month at a time, so each month is spread over the days the congregation actually met. The top half of the form is the midweek meeting and the bottom half the weekend meeting."
          />

          {state.error && <Notice tone="error">{state.error}</Notice>}
          <SubmitButton variant="secondary" pendingLabel="Reading forms…">Read the forms</SubmitButton>
        </form>
      ) : (
        <form action={runSheetPreview} className="space-y-5">
          <SourceInput id="att" sample={ATTENDANCE_SAMPLE} defaultValue={state.csv} />

          <AttendanceOptions
            state={state}
            serviceYears={serviceYears}
            yearHint="Used for a month the sheet names without a year."
            dayHint="The two weekdays matter only for a sheet that gives a month rather than a date: the month’s figures are then spread over the days the congregation actually met."
            withDefault
          />

          {state.error && <Notice tone="error">{state.error}</Notice>}
          <SubmitButton variant="secondary" pendingLabel="Reading…">Check the sheet</SubmitButton>
        </form>
      )}

      <AttendancePreview state={state} result={result} runCommit={runCommit} fromForm={fromForm} />
    </div>
  );
}

function AttendancePreview({
  state,
  result,
  runCommit,
  fromForm,
}: {
  state: AttendanceImportState;
  result: AttendanceImportState;
  runCommit: (formData: FormData) => void;
  fromForm: boolean;
}) {
  const p = state.preview;
  const rows = p?.rows ?? [];
  const read = p?.read ?? [];
  if (!p || (rows.length === 0 && read.length === 0)) return null;

  const existing = p.existingCount;
  const importable = p.meetings - existing;
  const shortDate = (d: Date) => `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
  const monthLabel = (year: number, month: number) => `${MONTH_SHORT[month - 1]} ${year}`;

  return (
    <section className="border-t border-rule pt-7">
      {read.length > 0 && (
        <div className="mb-5 space-y-2">
          {read.map((f) => (
            <div key={f.fileName} className="rounded border border-rule bg-surface px-4 py-3">
              <p className="truncate text-sm text-ink" title={f.fileName}>{f.fileName}</p>
              {f.blocks.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
                  {f.blocks.map((b, i) => (
                    <li key={i}>
                      {serviceYearLabel(b.serviceYear)} {b.half}:{" "}
                      <span className="text-ink">{b.months} month{b.months === 1 ? "" : "s"}</span>
                      {b.months > 0 && <>, {b.total.toLocaleString()} present</>}
                      {!b.yearFromForm && <> <Badge tone="warn">year assumed</Badge></>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-clay">No attendance could be read from it.</p>
              )}
              {f.problems.length > 0 && (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-clay">
                  {f.problems.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="text-xs text-ink-faint">
            An S-88 keeps one attendance figure and does not split it between the hall and video, so
            each meeting is recorded as that many present in the hall. The totals and averages on a
            form exported later come out the same.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <h2 className="mb-1 font-serif text-base">
            {p.meetings} meeting{p.meetings === 1 ? "" : "s"} to record
          </h2>
          <p className="mb-4 text-sm text-ink-soft">
            {fromForm
              ? <>Read from {read.length} S-88 form{read.length === 1 ? "" : "s"}, covering{" "}</>
              : <>Read as {ATTENDANCE_LAYOUTS[p.layout]}, covering{" "}</>}
            {p.months
              .slice()
              .sort((a, b) => a.year - b.year || a.month - b.month)
              .map((m) => monthLabel(m.year, m.month))
              .join(", ")}
            .
            {p.spread > 0 && (
              <> {p.spread} month{p.spread === 1 ? " was" : "s were"} shared out over the meeting days.</>
            )}
          </p>

          {p.problems.length > 0 && (
            <Notice tone="error">
              <p className="mb-1 font-medium">
                {p.problems.length} thing{p.problems.length === 1 ? "" : "s"} to check before importing.
              </p>
              <ul className="max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto">
                {p.problems.map((x, i) => (
                  <li key={`${x.line}-${i}`}>{x.line > 0 ? `Line ${x.line}: ` : ""}{x.message}</li>
                ))}
              </ul>
            </Notice>
          )}

          {existing > 0 && (
            <Notice>
              {existing} of these meeting{existing === 1 ? " is" : "s are"} already on file. They are marked
              below and left untouched unless you tick “replace” before importing.
            </Notice>
          )}

          <DataTable>
            <thead>
              <tr>
                <Th>{fromForm ? "On the form" : "On the sheet"}</Th>
                <Th>Meeting</Th>
                <Th>What it says</Th>
                <Th align="right">Written as</Th>
                <Th>Meeting days</Th>
                <Th align="right"></Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 150).map((r, i) => {
                const total = r.entries.reduce((t, e) => t + e.inPerson + e.zoom, 0);
                const onFile = r.entries.filter((e) => e.onFile).length;
                return (
                  <tr key={`${r.line}-${r.meetingType}-${i}`} className={onFile > 0 ? "bg-wheat-light/50" : ""}>
                    <Td>
                      {r.label}
                      {r.source && (
                        <span className="block max-w-[12rem] truncate text-xxs text-ink-faint" title={r.source}>
                          {r.source}
                        </span>
                      )}
                    </Td>
                    <Td className="text-ink-soft">{r.meetingType === "MIDWEEK" ? "Midweek" : "Weekend"}</Td>
                    <Td className="text-ink-soft">{r.said}</Td>
                    <Td align="right" className="text-ink-soft">
                      {r.entries.length === 1
                        ? `${total} present`
                        : `${r.entries.length} meetings, ${total} present`}
                    </Td>
                    <Td className="text-xs text-ink-soft">
                      {r.entries.length > 1 ? (
                        <span
                          className="block max-w-[15rem] truncate"
                          title={r.entries.map((e) => formatDate(e.date)).join(", ")}
                        >
                          {r.entries.map((e) => shortDate(e.date)).join(", ")}
                        </span>
                      ) : (
                        formatDate(r.entries[0].date)
                      )}
                    </Td>
                    <Td align="right">{onFile > 0 && <Badge tone="warn">{onFile} on file</Badge>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {rows.length > 150 && (
            <p className="mt-2 text-xs text-ink-faint">Showing the first 150 of {rows.length} rows.</p>
          )}

          <form action={runCommit} className="mt-5 space-y-3 border-t border-rule pt-5">
            {fromForm ? (
              <input type="hidden" name="forms" value={state.forms ?? ""} />
            ) : (
              <input type="hidden" name="csv" value={state.csv ?? ""} />
            )}
            <input type="hidden" name="serviceYear" value={state.serviceYear} />
            <input type="hidden" name="midweekDay" value={state.midweekDay ?? 3} />
            <input type="hidden" name="weekendDay" value={state.weekendDay ?? 0} />
            <input type="hidden" name="defaultType" value={state.defaultType ?? "MIDWEEK"} />

            {existing > 0 && (
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  name="overwrite"
                  value="true"
                  className="mt-0.5 h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
                />
                <span className="text-sm text-ink">
                  Replace the {existing} meeting{existing === 1 ? "" : "s"} already on file with the figures from the {fromForm ? "S-88" : "sheet"}
                  <span className="block text-xs text-ink-faint">
                    Leave unticked to keep what is already recorded and add only the missing meetings.
                  </span>
                </span>
              </label>
            )}

            {result.error && <Notice tone="error">{result.error}</Notice>}
            {result.ok && <Notice tone="success">{result.ok}</Notice>}

            <SubmitButton pendingLabel="Importing…">
              Import {importable} meeting{importable === 1 ? "" : "s"}
              {existing > 0 ? ` (${p.meetings} if replacing)` : ""}
            </SubmitButton>
          </form>
        </>
      )}
    </section>
  );
}
