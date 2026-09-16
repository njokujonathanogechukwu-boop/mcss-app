"use client";

import { useActionState, useEffect, useState } from "react";
import { saveMonthlyReports, type ReportsState } from "./actions";
import { DataTable, Th, Td, Notice } from "@/components/shell";
import { SubmitButton, Badge } from "@/components/ui";
import { REPORT_OUTCOMES, REPORT_OUTCOME_LABELS, type ReportOutcome } from "@/lib/format";

export type SheetRow = {
  id: string;
  name: string;
  group: string;
  pioneerStatus: string;
  /** Counts as a pioneer for the month on screen: an auxiliary only for the
   * months their approved application covers. */
  pioneerForMonth: boolean;
  existing: {
    outcome: ReportOutcome;
    bibleStudies: number;
    hours: number | null;
    pioneerStatusUsed: string;
    remarks: string | null;
  } | null;
};

export function ReportSheet({
  rows,
  year,
  month,
  monthLabel,
}: {
  rows: SheetRow[];
  year: number;
  month: number;
  monthLabel: string;
}) {
  const [state, action] = useActionState<ReportsState, FormData>(saveMonthlyReports, {});
  const [saved, setSaved] = useState(0);

  // React resets the form after every action submit, which puts each control
  // back to its defaultValue. Remounting the rows once the save has landed
  // lets them pick up the values that were just written.
  useEffect(() => {
    if (state.ok) setSaved((n) => n + 1);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">{state.ok}</Notice>}
      {state.warnings && (
        <Notice tone="error">
          <p className="mb-1 font-medium">Some rows need another look:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {state.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </Notice>
      )}

      <DataTable>
        <thead>
          <tr>
            <Th className="min-w-[180px]">Publisher</Th>
            <Th align="center" className="min-w-[130px]">Report</Th>
            <Th align="center">Bible studies</Th>
            <Th align="center">Auxiliary</Th>
            <Th align="center">Hours</Th>
            <Th>Remarks</Th>
          </tr>
        </thead>
        <tbody key={saved}>
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </tbody>
      </DataTable>

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-rule bg-paper/95 py-3 backdrop-blur">
        <SubmitButton pendingLabel="Saving…">Save {monthLabel} reports</SubmitButton>
        <p className="text-xs text-ink-soft">
          Rows left on “Not recorded” are skipped, and any report already on file for that
          publisher is removed.
        </p>
      </div>
    </form>
  );
}

function Row({ row }: { row: SheetRow }) {
  const isPioneer = row.pioneerForMonth;
  const [outcome, setOutcome] = useState<ReportOutcome | "">(row.existing?.outcome ?? "");
  const [aux, setAux] = useState(row.existing?.pioneerStatusUsed === "AUXILIARY");
  const shared = outcome === "SHARED";
  const hoursEnabled = shared && (isPioneer || aux);

  return (
    <tr className={outcome ? "" : "bg-paper/50"}>
      <input type="hidden" name="publisherId" value={row.id} />
      <input type="hidden" name={`touched.${row.id}`} value={row.existing ? "true" : "false"} />

      <Td>
        <span className="block text-sm text-ink">{row.name}</span>
        <span className="text-xxs text-ink-faint">
          {row.group}
          {isPioneer && <> · <Badge tone="good">Pioneer</Badge></>}
        </span>
      </Td>

      <Td align="center">
        {/* React resets the form on every action submit, which restores each
            control to its defaultValue, so this stays uncontrolled and the
            tbody remounts after a save instead. */}
        <select
          name={`outcome.${row.id}`}
          defaultValue={outcome}
          onChange={(e) => setOutcome(e.target.value as ReportOutcome | "")}
          aria-label={`${row.name} report`}
          className="w-full rounded border border-rule-strong bg-surface px-1.5 py-1 text-xs"
        >
          <option value="">Not recorded</option>
          {REPORT_OUTCOMES.map((o) => (
            <option key={o} value={o}>{REPORT_OUTCOME_LABELS[o]}</option>
          ))}
        </select>
      </Td>

      <Td align="center">
        <input
          type="number"
          name={`studies.${row.id}`}
          min={0}
          max={99}
          defaultValue={row.existing?.bibleStudies || ""}
          disabled={!shared}
          aria-label={`${row.name} Bible studies`}
          className="w-16 rounded border border-rule-strong bg-surface px-2 py-1 text-center text-sm disabled:bg-paper disabled:text-ink-faint"
        />
      </Td>

      <Td align="center">
        {row.pioneerStatus === "NONE" || row.pioneerStatus === "AUXILIARY" ? (
          <input
            type="checkbox"
            name={`aux.${row.id}`}
            value="true"
            defaultChecked={aux}
            onChange={(e) => setAux(e.target.checked)}
            disabled={!shared}
            aria-label={`${row.name} served as an auxiliary pioneer`}
            className="h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
          />
        ) : (
          <span className="text-xxs text-ink-faint">regular</span>
        )}
      </Td>

      <Td align="center">
        <input
          type="number"
          name={`hours.${row.id}`}
          min={0}
          max={744}
          defaultValue={row.existing?.hours ?? ""}
          disabled={!hoursEnabled}
          aria-label={`${row.name} hours`}
          title={hoursEnabled ? undefined : "Hours apply to pioneers only"}
          className="w-16 rounded border border-rule-strong bg-surface px-2 py-1 text-center text-sm disabled:bg-paper disabled:text-ink-faint"
        />
      </Td>

      <Td>
        <input
          type="text"
          name={`remarks.${row.id}`}
          defaultValue={row.existing?.remarks ?? ""}
          maxLength={120}
          placeholder={
            outcome === "NO_REPORT" ? "Why no report came in"
            : outcome === "DID_NOT_PREACH" ? "Reason (optional)"
            : undefined
          }
          aria-label={`${row.name} remarks`}
          className="w-full min-w-[140px] rounded border border-rule-strong bg-surface px-2 py-1 text-sm"
        />
      </Td>
    </tr>
  );
}
