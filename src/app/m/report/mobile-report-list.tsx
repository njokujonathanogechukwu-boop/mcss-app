"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Search, Check, Minus, Ban, CircleDashed } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { REPORT_OUTCOME_LABELS, type ReportOutcome } from "@/lib/format";
import { submitMobileReport, type MobileReportState } from "../actions";

export type ReportRow = {
  id: string;
  name: string;
  group: string | null;
  isPioneer: boolean;
  outcome: ReportOutcome | null;
  studies: number | null;
  hours: number | null;
  aux: boolean;
  remarks: string | null;
};

const HINTS: Record<ReportOutcome, string> = {
  SHARED: "Reported and shared in the ministry",
  DID_NOT_PREACH: "Reported, but had no share this month",
  NO_REPORT: "No report came in from them",
};

/** Did the publisher actually report? A noted "no report" is not a report. */
function hasReported(outcome: ReportOutcome | null) {
  return outcome === "SHARED" || outcome === "DID_NOT_PREACH";
}

function OutcomeOption({
  value,
  current,
  onPick,
  label,
  hint,
  icon,
}: {
  value: ReportOutcome | "";
  current: ReportOutcome | "";
  onPick: (v: ReportOutcome | "") => void;
  label: string;
  hint: string;
  icon: React.ReactNode;
}) {
  const chosen = current === value;
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
        chosen ? "border-pine bg-pine-light" : "border-rule bg-surface"
      }`}
    >
      {/* React resets the form after a submit, so the choice stays
          uncontrolled and the form remounts once the save has landed. */}
      <input
        type="radio"
        name="outcome"
        value={value}
        defaultChecked={chosen}
        onChange={() => onPick(value)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
          chosen ? "bg-pine text-white" : "bg-paper text-ink-faint"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-soft">{hint}</span>
      </span>
    </label>
  );
}

function ReportForm({ row, month }: { row: ReportRow; month: { year: number; month: number } }) {
  const [state, formAction] = useActionState<MobileReportState, FormData>(submitMobileReport, {});
  const [outcome, setOutcome] = useState<ReportOutcome | "">(row.outcome ?? "");
  const [aux, setAux] = useState(row.aux);
  const [revision, setRevision] = useState(0);
  const shared = outcome === "SHARED";

  // React resets the form after a submit, which would snap the choice back to
  // the one the form mounted with. Remounting it lets the row show what was
  // actually saved.
  useEffect(() => {
    if (state.ok) setRevision((n) => n + 1);
  }, [state]);

  return (
    <form key={revision} action={formAction} className="space-y-4 border-t border-rule bg-paper px-4 py-4">
      <input type="hidden" name="publisherId" value={row.id} />
      <input type="hidden" name="year" value={month.year} />
      <input type="hidden" name="month" value={month.month} />
      <input type="hidden" name="aux" value={aux ? "true" : "false"} />

      {state.error && state.publisherId === row.id && (
        <p className="rounded bg-clay/10 px-3 py-2 text-xs text-clay">{state.error}</p>
      )}
      {state.ok && state.publisherId === row.id && (
        <p className="rounded bg-pine-light px-3 py-2 text-xs text-pine">{state.message}</p>
      )}

      <div className="space-y-2">
        <OutcomeOption
          value="SHARED"
          current={outcome}
          onPick={setOutcome}
          label={REPORT_OUTCOME_LABELS.SHARED}
          hint={HINTS.SHARED}
          icon={<Check size={14} />}
        />
        <OutcomeOption
          value="DID_NOT_PREACH"
          current={outcome}
          onPick={setOutcome}
          label={REPORT_OUTCOME_LABELS.DID_NOT_PREACH}
          hint={HINTS.DID_NOT_PREACH}
          icon={<Minus size={14} />}
        />
        <OutcomeOption
          value="NO_REPORT"
          current={outcome}
          onPick={setOutcome}
          label={REPORT_OUTCOME_LABELS.NO_REPORT}
          hint={HINTS.NO_REPORT}
          icon={<Ban size={14} />}
        />
      </div>

      {shared && (
        <div className="space-y-4">
          {!row.isPioneer && (
            <button
              type="button"
              onClick={() => setAux((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                aux ? "border-pine bg-pine-light text-ink" : "border-rule bg-surface text-ink-soft"
              }`}
            >
              <span className="font-medium">Auxiliary pioneered this month</span>
              <span
                aria-hidden
                className={`grid h-6 w-6 place-items-center rounded-full ${aux ? "bg-pine text-white" : "bg-paper text-ink-faint"}`}
              >
                <Check size={15} />
              </span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Bible studies</span>
              <input
                name="studies"
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                defaultValue={row.studies ?? ""}
                className="field-input text-center text-lg"
                placeholder="0"
              />
            </label>
            {(row.isPioneer || aux) && (
              <label className="block">
                <span className="field-label">Hours</span>
                <input
                  name="hours"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={744}
                  defaultValue={row.hours ?? ""}
                  className="field-input text-center text-lg"
                  placeholder="0"
                />
              </label>
            )}
          </div>
        </div>
      )}

      <label className="block">
        <span className="field-label">
          {shared ? "Remarks (optional)" : outcome ? "Why (optional)" : "Remarks (optional)"}
        </span>
        <input
          name="remarks"
          defaultValue={row.remarks ?? ""}
          className="field-input"
          placeholder={
            outcome === "NO_REPORT" ? "Illness, away, no contact…"
            : outcome === "DID_NOT_PREACH" ? "Illness, caring for family…"
            : "Notes for this month"
          }
        />
      </label>

      <SubmitButton pendingLabel="Saving…" className="w-full">Save report</SubmitButton>

      {row.outcome && (
        <button
          type="submit"
          name="clear"
          value="true"
          className="w-full py-1 text-center text-xs text-ink-faint underline-offset-2 hover:text-clay hover:underline"
        >
          Clear this month
        </button>
      )}
    </form>
  );
}

export function MobileReportList({
  rows,
  month,
  monthLabel,
}: {
  rows: ReportRow[];
  month: { year: number; month: number };
  monthLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [savedFor, setSavedFor] = useState(0);
  const [hideDone, setHideDone] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideDone && r.outcome !== null) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.group?.toLowerCase().includes(q) ?? false);
    });
  }, [rows, query, hideDone]);

  const reportedCount = rows.filter((r) => hasReported(r.outcome)).length;
  const noReportCount = rows.filter((r) => r.outcome === "NO_REPORT").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-ink">Field service</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          {monthLabel} · {reportedCount}/{rows.length} reported
          {noReportCount ? ` · ${noReportCount} no report` : ""}
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a publisher"
          className="field-input pl-9"
          aria-label="Search publishers"
        />
      </div>

      <button
        type="button"
        onClick={() => setHideDone((v) => !v)}
        className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
          hideDone ? "border-pine bg-pine-light text-pine" : "border-rule bg-surface text-ink-soft"
        }`}
      >
        {hideDone ? "Showing only outstanding" : "Show all publishers"}
      </button>

      <ul className="space-y-2">
        {filtered.map((row) => {
          const isOpen = open === row.id;
          const reported = hasReported(row.outcome);
          return (
            <li key={row.id} className="overflow-hidden rounded-lg border border-rule bg-surface">
              <button
                type="button"
                onClick={() => { setOpen(isOpen ? null : row.id); setSavedFor((n) => n + 1); }}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  aria-hidden
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    reported ? "bg-pine text-white"
                    : row.outcome === "NO_REPORT" ? "bg-clay-light text-clay"
                    : "bg-paper text-ink-faint"
                  }`}
                >
                  {reported ? <Check size={16} /> : row.outcome === "NO_REPORT" ? <Ban size={16} /> : <CircleDashed size={16} />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">{row.name}</span>
                  <span className="block text-xs text-ink-soft">
                    {row.group ?? "No group"}
                    {row.isPioneer ? " · Pioneer" : ""}
                    {row.outcome === "DID_NOT_PREACH" ? " · Did not preach" : ""}
                    {row.outcome === "NO_REPORT" ? " · No report" : ""}
                  </span>
                </span>
                <span className="text-xs text-ink-faint">
                  {isOpen ? "Close" : reported ? "Edit" : row.outcome ? "Change" : "Report"}
                </span>
              </button>
              {isOpen && <ReportForm key={savedFor} row={row} month={month} />}
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-soft">No publishers match that search.</p>
      )}
    </div>
  );
}
