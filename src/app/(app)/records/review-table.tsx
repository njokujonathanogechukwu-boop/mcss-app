"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataTable, Th, Td } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { RecordFixForm } from "./record-fix-form";
import type { Review } from "@/lib/completeness";

type SortKey = "name" | "group" | "issues";
type Sort = { key: SortKey; dir: "asc" | "desc" };

function Issues({ review }: { review: Review }) {
  const m = review.missing;
  // Specific labels, not one lumped "Contact" chip: after a save the row only
  // clears when nothing is left, so the secretary must see exactly what remains.
  const chips: string[] = [...m.bio, ...m.contact];
  if (m.group) chips.push("No group");
  if (m.thisMonth) chips.push("This month");
  if (m.otherMonths.length) chips.push(`${m.otherMonths.length} past month${m.otherMonths.length === 1 ? "" : "s"}`);

  if (chips.length === 0) return <Badge tone="good">Complete</Badge>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <Badge key={c} tone="warn">{c}</Badge>
      ))}
    </div>
  );
}

export function ReviewTable({
  reviews,
  groups,
  month,
  flags,
}: {
  reviews: Review[];
  groups: { id: string; number: number; name: string }[];
  month: { year: number; month: number; label: string };
  flags: { canEditPublisher: boolean; canEditContact: boolean; canEditReport: boolean };
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ key: "issues", dir: "desc" });
  const canEdit = flags.canEditPublisher || flags.canEditReport;

  const sorted = useMemo(() => {
    const value = (r: Review): string | number =>
      sort.key === "name" ? r.name : sort.key === "group" ? (r.group ?? "") : r.issueCount;
    return [...reviews].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      let c =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      if (c === 0) c = a.name.localeCompare(b.name);
      return sort.dir === "asc" ? c : -c;
    });
  }, [reviews, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "issues" ? "desc" : "asc" },
    );

  const sortTh = (label: string, key: SortKey) => (
    <Th>
      <button
        type="button"
        onClick={() => toggle(key)}
        className="text-xs font-medium text-ink-soft hover:text-ink"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </Th>
  );

  return (
    <DataTable>
      <thead>
        <tr>
          {sortTh("Publisher", "name")}
          {sortTh("Group", "group")}
          {sortTh("Missing", "issues")}
          <Th align="right"></Th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const isOpen = open === r.id;
          return (
            <tr key={r.id} className={isOpen ? "bg-paper align-top" : "hover:bg-paper align-top"}>
              <Td>
                <Link href={`/publishers/${r.id}`} className="font-medium text-ink hover:text-pine hover:underline">
                  {r.name}
                </Link>
                {isOpen && canEdit && (
                  <div className="mt-4 max-w-2xl rounded border border-rule bg-surface p-4">
                    <RecordFixForm review={r} groups={groups} month={month} flags={flags} />
                  </div>
                )}
              </Td>
              <Td className="text-ink-soft">{r.group ?? <span className="text-ink-faint">—</span>}</Td>
              <Td><Issues review={r} /></Td>
              <Td align="right">
                {canEdit ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={isOpen ? "secondary" : "ghost"}
                    onClick={() => setOpen(isOpen ? null : r.id)}
                  >
                    {isOpen ? "Close" : "Fix"}
                  </Button>
                ) : (
                  <span className="text-xs text-ink-faint">Read only</span>
                )}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
