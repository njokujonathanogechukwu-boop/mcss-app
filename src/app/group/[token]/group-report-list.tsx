"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Minus, Ban, CircleDashed } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import {
  PIONEER_LABELS,
  REPORT_OUTCOME_LABELS,
  type ReportOutcome,
} from "@/lib/format";
import type { GroupMonthRow, GroupReportRecord } from "@/lib/group-reports";
import { submitGroupReport, type GroupReportState } from "./actions";

const HINTS: Record<ReportOutcome, string> = {
  SHARED: "Took a share in the ministry this month",
  DID_NOT_PREACH: "Sent a report, but had no share this month",
  NO_REPORT: "You could not reach them this month",
};

/** One recorded month in words, for a row that can no longer be changed here. */
function describe(record: GroupReportRecord): string {
  const parts = [REPORT_OUTCOME_LABELS[record.outcome]];
  if (record.outcome === "SHARED") {
    parts.push(`${record.studies} Bible stud${record.studies === 1 ? "y" : "ies"}`);
    if (record.hours !== null) parts.push(`${record.hours} hours`);
    if (record.pioneerUsed === "AUXILIARY") parts.push("auxiliary pioneering");
    else if (record.pioneerUsed !== "NONE") parts.push(PIONEER_LABELS[record.pioneerUsed].toLowerCase());
  }
  if (record.remarks) parts.push(`“${record.remarks}”`);
  return parts.join(" · ");
}

function ChangeButton({ onChange }: { onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="mt-2 rounded border border-rule-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper"
    >
      Change this report
    </button>
  );
}

function Recorded({ row, onChange }: { row: GroupMonthRow; onChange?: () => void }) {
  if (!row.record) {
    return (
      <p className="border-t border-rule bg-paper px-4 py-3 text-xs text-ink-soft">
        Nothing was recorded for this publisher this month.
      </p>
    );
  }
  return (
    <div className="border-t border-rule bg-paper px-4 py-3">
      <p className="text-xs text-ink-soft">{describe(row.record)}</p>
      <p className="mt-1 text-xxs text-ink-faint">
        {!row.record.fromLink
          ? "Entered by the secretary — it cannot be changed here."
          : onChange
            ? "Sent through this group's link. You can change it until the secretary sends the month to the branch."
            : "Sent through this group's link."}
      </p>
      {onChange && <ChangeButton onChange={onChange} />}
    </div>
  );
}

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
  row: GroupMonthRow;
  token: string;
  year: number;
  month: number;
  onSent: (outcome: ReportOutcome) => void;
}) {
  const [state, formAction] = useActionState<GroupReportState, FormData>(
    submitGroupReport.bind(null, token),
    {},
  );
  const [outcome, setOutcome] = useState<ReportOutcome | "">(row.record?.outcome ?? "");
  const [aux, setAux] = useState(row.record?.pioneerUsed === "AUXILIARY");
  const shared = outcome === "SHARED";

  // A save that landed swaps this form for the parent's "recorded" panel; only a
  // refusal leaves the form on screen with its reason.
  useEffect(() => {
    if (state.message && outcome) onSent(outcome);
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
                defaultValue={row.record?.studies ?? ""}
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
                  defaultValue={row.record?.hours ?? ""}
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
          defaultValue={row.record?.remarks ?? ""}
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
  editing,
}: {
  rows: GroupMonthRow[];
  token: string;
  year: number;
  month: number;
  monthLabel: string;
  /** True only for the month being collected now and not yet sent to the branch. */
  editing: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [sentOutcomes, setSentOutcomes] = useState<Record<string, ReportOutcome>>({});
  const [revision, setRevision] = useState(0);
  /** The row whose report sent through this link is being corrected. */
  const [changing, setChanging] = useState<string | null>(null);

  // The ones still owed come first, so the month reads as a to-do list.
  const owed = (row: GroupMonthRow) =>
    editing && !(row.id in sentOutcomes) && (!row.record || row.noted);
  const ordered = [...rows.filter((r) => owed(r)), ...rows.filter((r) => !owed(r))];

  const left = rows.filter((r) => owed(r)).length;
  const recorded = rows.length - left;

  return (
    <div className="space-y-4">
      <p className="rounded border border-rule bg-surface px-4 py-3 text-sm text-ink-soft">
        <span className="font-medium text-ink">{monthLabel}</span>
        {" · "}
        {editing
          ? left === 0
            ? "everything is recorded. Thank you."
            : `${left} of ${rows.length} still to send.`
          : `${recorded} of ${rows.length} recorded. This month is for reading only.`}
      </p>

      <ul className="space-y-2">
        {ordered.map((row) => {
          const isOpen = open === row.id;
          const canSend = owed(row);
          const done = row.id in sentOutcomes;
          // Sent through this link, now or before, and the month still open.
          const canChange = editing && (done || Boolean(row.record?.fromLink && !row.noted));
          const formOpen = isOpen && (changing === row.id || (!done && canSend));
          const startChange = () => {
            setChanging(row.id);
            setRevision((n) => n + 1);
          };
          const outcome = done ? sentOutcomes[row.id] : row.record?.outcome;
          const marker =
            outcome === "SHARED"
              ? { box: "bg-pine text-white", icon: <Check size={16} /> }
              : outcome === "DID_NOT_PREACH"
                ? { box: "bg-paper text-ink", icon: <Minus size={16} /> }
                : outcome === "NO_REPORT"
                  ? { box: "bg-clay-light text-clay", icon: <Ban size={16} /> }
                  : { box: "bg-paper text-ink-faint", icon: <CircleDashed size={16} /> };
          return (
            <li key={row.id} className="overflow-hidden rounded-lg border border-rule bg-surface">
              <button
                type="button"
                onClick={() => {
                  setOpen(isOpen ? null : row.id);
                  setChanging(null);
                  setRevision((n) => n + 1);
                }}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${marker.box}`}>
                  {marker.icon}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">{row.name}</span>
                  <span className="block text-xs text-ink-soft">
                    {row.isPioneer ? "Pioneer" : "Publisher"}
                    {row.record && !done
                      ? row.noted
                        ? " · the secretary noted no report"
                        : ` · ${REPORT_OUTCOME_LABELS[row.record.outcome]}`
                      : ""}
                  </span>
                </span>
                <span className="text-xs text-ink-faint">
                  {isOpen ? "Close" : done ? "Sent" : canSend ? "Send" : canChange ? "View or change" : row.record ? "View" : ""}
                </span>
              </button>
              {formOpen && (
                <PublisherReport
                  key={`${row.id}-${revision}`}
                  row={row}
                  token={token}
                  year={year}
                  month={month}
                  onSent={(sent) => {
                    setSentOutcomes((m) => ({ ...m, [row.id]: sent }));
                    setChanging(null);
                  }}
                />
              )}
              {isOpen && !formOpen && done && (
                <div className="border-t border-rule bg-pine-light px-4 py-3 text-xs text-pine-dark">
                  <p>Recorded — thank you. Close this and carry on with the next publisher.</p>
                  {canChange && <ChangeButton onChange={startChange} />}
                </div>
              )}
              {isOpen && !formOpen && !done && (
                <Recorded row={row} onChange={canChange ? startChange : undefined} />
              )}
            </li>
          );
        })}
      </ul>

      {editing ? (
        <p className="text-xs text-ink-soft">
          Send one at a time — each is recorded as soon as you press the button, so nothing is lost
          if you close the page. A report you sent can be changed here until the secretary sends
          the month to the branch; one the secretary entered himself is shown for you to check but
          cannot be changed here.
        </p>
      ) : (
        <p className="text-xs text-ink-soft">
          These reports have already gone to the secretary. If one of them is wrong, please tell
          him — only the month being collected now can be sent from this page.
        </p>
      )}
    </div>
  );
}
