"use client";

import { useActionState, useState } from "react";
import { saveMonthlyReports, type ReportsState } from "./actions";
import { DataTable, Th, Td, Notice } from "@/components/shell";
import { SubmitButton, Badge } from "@/components/ui";

export type SheetRow = {
  id: string;
  name: string;
  group: string;
  pioneerStatus: string;
  existing: {
    sharedInMinistry: boolean;
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
            <Th align="center">Shared</Th>
            <Th align="center">Bible studies</Th>
            <Th align="center">Auxiliary</Th>
            <Th align="center">Hours</Th>
            <Th>Remarks</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </tbody>
      </DataTable>

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center gap-3 border-t border-rule bg-paper/95 py-3 backdrop-blur">
        <SubmitButton pendingLabel="Saving…">Save {monthLabel} reports</SubmitButton>
        <p className="text-xs text-ink-soft">
          Rows left blank stay marked as not reported. Clearing a saved row removes that report.
        </p>
      </div>
    </form>
  );
}

function Row({ row }: { row: SheetRow }) {
  const isPioneer = row.pioneerStatus !== "NONE";
  const [shared, setShared] = useState(row.existing?.sharedInMinistry ?? false);
  const [aux, setAux] = useState(row.existing?.pioneerStatusUsed === "AUXILIARY");
  const hoursEnabled = shared && (isPioneer || aux);

  return (
    <tr className={shared ? "" : "bg-paper/50"}>
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
        <input
          type="checkbox"
          name={`shared.${row.id}`}
          value="true"
          checked={shared}
          onChange={(e) => setShared(e.target.checked)}
          aria-label={`${row.name} shared in the ministry`}
          className="h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
        />
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
            checked={aux}
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
          aria-label={`${row.name} remarks`}
          className="w-full min-w-[140px] rounded border border-rule-strong bg-surface px-2 py-1 text-sm"
        />
      </Td>
    </tr>
  );
}
