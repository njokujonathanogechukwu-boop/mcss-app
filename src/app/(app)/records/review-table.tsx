"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, Th, Td } from "@/components/shell";
import { Badge, Button } from "@/components/ui";
import { RecordFixForm } from "./record-fix-form";
import type { Review } from "@/lib/completeness";

function Issues({ review }: { review: Review }) {
  const m = review.missing;
  const chips: string[] = [];
  if (m.bio.length) chips.push("Bio-data");
  if (m.contact.length) chips.push("Contact");
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
  const canEdit = flags.canEditPublisher || flags.canEditReport;

  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Publisher</Th>
          <Th>Group</Th>
          <Th>Missing</Th>
          <Th align="right"></Th>
        </tr>
      </thead>
      <tbody>
        {reviews.map((r) => {
          const isOpen = open === r.id;
          return (
            <tr key={r.id} className={isOpen ? "bg-paper align-top" : "hover:bg-paper align-top"}>
              <Td>
                <Link href={`/publishers/${r.id}`} className="font-medium text-ink hover:text-pine hover:underline">
                  {r.name}
                </Link>
                {isOpen && canEdit && (
                  <div className="mt-4 max-w-2xl rounded border border-rule bg-surface p-4">
                    {r.missing.otherMonths.length > 0 && (
                      <p className="mb-3 text-xs text-ink-soft">
                        Also missing reports for{" "}
                        {r.missing.otherMonths.map((mo) => mo.label).join(", ")}. Enter those from the
                        report sheet or the phone app.
                      </p>
                    )}
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
