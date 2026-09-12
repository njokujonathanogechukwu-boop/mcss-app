"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Search, Check, CircleDashed } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { submitMobileReport, type MobileReportState } from "../actions";

export type ReportRow = {
  id: string;
  name: string;
  group: string | null;
  isPioneer: boolean;
  reported: boolean;
  shared: boolean | null;
  studies: number | null;
  hours: number | null;
  aux: boolean;
  remarks: string | null;
};

function ReportForm({ row, month }: { row: ReportRow; month: { year: number; month: number } }) {
  const [state, formAction] = useActionState<MobileReportState, FormData>(submitMobileReport, {});
  const [shared, setShared] = useState(row.shared ?? true);
  const [aux, setAux] = useState(row.aux);

  return (
    <form action={formAction} className="space-y-4 border-t border-rule bg-paper px-4 py-4">
      <input type="hidden" name="publisherId" value={row.id} />
      <input type="hidden" name="year" value={month.year} />
      <input type="hidden" name="month" value={month.month} />
      <input type="hidden" name="shared" value={shared ? "true" : "false"} />
      <input type="hidden" name="aux" value={aux ? "true" : "false"} />

      {state.error && state.publisherId === row.id && (
        <p className="rounded bg-clay/10 px-3 py-2 text-xs text-clay">{state.error}</p>
      )}
      {state.ok && state.publisherId === row.id && (
        <p className="rounded bg-pine-light px-3 py-2 text-xs text-pine">{state.message}</p>
      )}

      <button
        type="button"
        onClick={() => setShared((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
          shared ? "border-pine bg-pine-light text-ink" : "border-rule bg-surface text-ink-soft"
        }`}
      >
        <span className="font-medium">Shared in the ministry</span>
        <span
          aria-hidden
          className={`grid h-6 w-6 place-items-center rounded-full ${shared ? "bg-pine text-white" : "bg-paper text-ink-faint"}`}
        >
          <Check size={15} />
        </span>
      </button>

      {shared && (
        <div className="space-y-4">
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
            {row.isPioneer ? (
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
            ) : (
              <button
                type="button"
                onClick={() => setAux((v) => !v)}
                className={`mt-6 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${
                  aux ? "border-pine bg-pine-light text-pine" : "border-rule bg-surface text-ink-soft"
                }`}
              >
                {aux ? <Check size={14} /> : <CircleDashed size={14} />}
                Auxiliary pioneer
              </button>
            )}
          </div>

          <label className="block">
            <span className="field-label">Remarks (optional)</span>
            <input name="remarks" defaultValue={row.remarks ?? ""} className="field-input" placeholder="Notes for this month" />
          </label>
        </div>
      )}

      {!shared && (
        <p className="text-xs text-ink-soft">
          Saving will record that this publisher did not share in the ministry this month.
        </p>
      )}

      <SubmitButton pendingLabel="Saving…" className="w-full">Save report</SubmitButton>
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
  const [hideReported, setHideReported] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideReported && r.reported) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.group?.toLowerCase().includes(q) ?? false);
    });
  }, [rows, query, hideReported]);

  const reportedCount = rows.filter((r) => r.reported).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-ink">Field service</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          {monthLabel} · {reportedCount}/{rows.length} reported
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
        onClick={() => setHideReported((v) => !v)}
        className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
          hideReported ? "border-pine bg-pine-light text-pine" : "border-rule bg-surface text-ink-soft"
        }`}
      >
        {hideReported ? "Showing only outstanding" : "Show all publishers"}
      </button>

      <ul className="space-y-2">
        {filtered.map((row) => {
          const isOpen = open === row.id;
          return (
            <li key={row.id} className="overflow-hidden rounded-lg border border-rule bg-surface">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : row.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  aria-hidden
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    row.reported ? "bg-pine text-white" : "bg-paper text-ink-faint"
                  }`}
                >
                  {row.reported ? <Check size={16} /> : <CircleDashed size={16} />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-ink">{row.name}</span>
                  <span className="block text-xs text-ink-soft">
                    {row.group ?? "No group"}
                    {row.isPioneer ? " · Pioneer" : ""}
                  </span>
                </span>
                <span className="text-xs text-ink-faint">{isOpen ? "Close" : row.reported ? "Edit" : "Report"}</span>
              </button>
              {isOpen && <ReportForm row={row} month={month} />}
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
