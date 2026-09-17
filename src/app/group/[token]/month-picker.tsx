"use client";

import { useRouter } from "next/navigation";

/**
 * The month the overseer is looking at. Choosing one only changes the address,
 * so the page is read again from the server with that month's records.
 */
export function MonthPicker({
  token,
  months,
  year,
  month,
  currentLabel,
}: {
  token: string;
  months: { year: number; month: number; label: string }[];
  year: number;
  month: number;
  /** The month reports are being collected for, labelled as such in the list. */
  currentLabel: string;
}) {
  const router = useRouter();

  return (
    <label className="block">
      <span className="field-label">Month</span>
      <select
        value={`${year}-${month}`}
        onChange={(e) => router.replace(`/group/${token}?period=${e.target.value}`, { scroll: false })}
        className="field-input"
      >
        {months.map((m) => (
          <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
            {m.label}
            {m.label === currentLabel ? " — being collected now" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
