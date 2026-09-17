"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Minus, Ban, CircleDashed } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { REPORT_OUTCOME_LABELS, type ReportOutcome } from "@/lib/format";
import { submitGroupReport, type GroupReportState } from "./actions";

export type GroupRow = {
  id: string;
  name: string;
  isPioneer: boolean;
  /** The secretary noted that no report came, rather than nothing at all. */
  noted: boolean;
};

const HINTS: Record<ReportOutcome, string> = {
  SHARED: "Took a share in the ministry this month",
  DID_NOT_PREACH: "Sent a report, but had no share this month",
  NO_REPORT: "You could not reach them this month",
};

function OutcomeOption({
  value,
  current,
  onPick,
  label,
  hint,
  icon,
}: {
  value: ReportOutcome;
  current: ReportOutcome | "";
  onPick: (v: ReportOutcome) => void;
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
      {/* React resets the form after a submit, so the choice stays uncontrolled
          and the row is remounted once the save has landed. */}
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

function PublisherReport({
  row,
  token,
  year,
  month,
  onSent,
}: {
  row: GroupRow;
  token: string;
  year: number;
  month: number;
  onSent: () => void;
}) {
  const [state, formAction] = useActionState<GroupReportState, FormData>(
    submitGroupReport.bind(null, token),
    {},
  );
  const [outcome, setOutcome] = useState<ReportOutcome | "">("");
  const [aux, setAux] = useState(false);
  const shared = outcome === "SHARED";

  // A save that landed swaps this form for the parent's "recorded" panel; only a
  // refusal leaves the form on screen with its reason.
  useEffect(() => {
    if (state.message) onSent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4 border-t border-rule bg-paper px-4 py-4">
      <input type="hidden" name="publisherId" value={row.id} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="aux" value={aux ? "true" : "false"} />

      {state.error && (
        <p className="rounded bg-clay/10 px-3 py-2 text-xs text-clay">{state.error}</p>
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
                  className="field-input text-center text-lg"
                  placeholder="0"
                />
              </label>
            )}
          </div>
        </div>
      )}

      <label className="block">
        <span className="field-label">Remarks (optional)</span>
        <input
          name="remarks"
          maxLength={120}
          className="field-input"
          placeholder={
            outcome === "NO_REPORT" ? "Illness, away, no contact…"
            : outcome === "DID_NOT_PREACH" ? "Illness, caring for family…"
            : "Anything the secretary should know"
          }
        />
      </label>

      <SubmitButton pendingLabel="Sending…" className="w-full">Send this report</SubmitButton>
    </form>
  );
}

export function GroupReportList({
  rows,
  token,
  year,
  month,
  monthLabel,
}: {
  rows: GroupRow[];
  token: string;
  year: number;
  month: number;
  monthLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);

  const sent = new Set(sentIds);
  const left = rows.length - sent.size;

  return (
    <div className="space-y-4">
      <p className="rounded border border-rule bg-surface px-4 py-3 text-sm text-ink-soft">
        <span className="font-medium text-ink">{monthLabel}</span>
        {" · "}
        {left === 0
          ? "everyone below is now recorded. Thank you."
          : `${left} of ${rows.length} still to send.`}
      </p>

      <ul className="space-y-2">
        {rows.map((row) => {
          const isOpen = open === row.id;
          const done = sent.has(row.id);
          return (
            <li key={row.id} className="overflow-hidden rounded-lg border border-rule bg-surface">
              <button
                type="button"
                onClick={() => {
                  setOpen(isOpen ? null : row.id);
                  setRevision((n) => n + 1);
                }}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  aria-hidden
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    done ? "bg-pine text-white" : "bg-paper text-ink-faint"
                  }`}
                >
                  {done ? <Check size={16} /> : <CircleDashed size={16} />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">{row.name}</span>
                  <span className="block text-xs text-ink-soft">
                    {row.isPioneer ? "Pioneer" : "Publisher"}
                    {row.noted ? " · the secretary noted no report" : ""}
                  </span>
                </span>
                <span className="text-xs text-ink-faint">
                  {done ? "Sent" : isOpen ? "Close" : "Send"}
                </span>
              </button>
              {isOpen && done && (
                <p className="border-t border-rule bg-pine-light px-4 py-3 text-xs text-pine-dark">
                  Recorded — thank you. Close this and carry on with the next publisher.
                </p>
              )}
              {isOpen && !done && (
                <PublisherReport
                  key={`${row.id}-${revision}`}
                  row={row}
                  token={token}
                  year={year}
                  month={month}
                  onSent={() => setSentIds((ids) => (ids.includes(row.id) ? ids : [...ids, row.id]))}
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-ink-soft">
        Send one at a time — each is recorded as soon as you press the button, so nothing is lost if
        you close the page. A report the secretary has already entered cannot be changed here.
      </p>
    </div>
  );
}
