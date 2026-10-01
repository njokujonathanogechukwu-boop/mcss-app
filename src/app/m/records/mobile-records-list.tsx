"use client";

import { useMemo, useState } from "react";
import { Search, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui";
import { RecordFixForm } from "@/app/(app)/records/record-fix-form";
import type { Review } from "@/lib/completeness";

function chips(review: Review): string[] {
  const m = review.missing;
  const out: string[] = [];
  if (m.bio.length) out.push("Bio-data");
  if (m.contact.length) out.push("Contact");
  if (m.group) out.push("No group");
  if (m.thisMonth) out.push("This month");
  if (m.otherMonths.length) out.push(`${m.otherMonths.length} past`);
  return out;
}

export function MobileRecordsList({
  reviews,
  groups,
  month,
  flags,
  summary,
}: {
  reviews: Review[];
  groups: { id: string; number: number; name: string }[];
  month: { year: number; month: number; label: string };
  flags: { canEditPublisher: boolean; canEditContact: boolean; canEditGroup: boolean; canEditReport: boolean };
  summary: { total: number; complete: number };
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const canEdit = flags.canEditPublisher || flags.canEditReport;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter((r) => r.name.toLowerCase().includes(q) || (r.group?.toLowerCase().includes(q) ?? false));
  }, [reviews, query]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-xl text-ink">Records to fix</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          {summary.complete}/{summary.total} files complete · {reviews.length} need attention
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-lg border border-rule bg-surface p-8 text-center">
          <p className="font-serif text-lg text-ink">All caught up</p>
          <p className="mt-1 text-sm text-ink-soft">Every active publisher has a complete file.</p>
        </div>
      ) : (
        <>
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

          <ul className="space-y-2">
            {filtered.map((r) => {
              const isOpen = open === r.id;
              return (
                <li key={r.id} className="overflow-hidden rounded-lg border border-rule bg-surface">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-butter/40 text-clay" aria-hidden>
                      <AlertCircle size={16} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-ink">{r.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {chips(r).map((c) => (
                          <Badge key={c} tone="warn">{c}</Badge>
                        ))}
                      </span>
                    </span>
                    <span className="text-xs text-ink-faint">{isOpen ? "Close" : canEdit ? "Fix" : "View"}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-rule bg-paper px-4 py-4">
                      {canEdit ? (
                        <RecordFixForm review={r} groups={groups} month={month} flags={flags} />
                      ) : (
                        <p className="text-xs text-ink-soft">Your account has read-only access to these records.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-soft">No publishers match that search.</p>
          )}
        </>
      )}
    </div>
  );
}
