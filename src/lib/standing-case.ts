import "server-only";

import type { StandingKind } from "@prisma/client";
import { formatDate } from "@/lib/format";

export type CaseEntry = {
  id: string;
  kind: StandingKind;
  eventDate: Date;
  announcedDate: Date | null;
  liftedDate: Date | null;
  notes: string | null;
};

function announced(entry: CaseEntry): string {
  return entry.announcedDate ? ` (announced ${formatDate(entry.announcedDate)})` : " (not announced)";
}

/** The S-77's own words for each decision the committee can make. */
export function decisionLine(entry: CaseEntry): string {
  switch (entry.kind) {
    case "REPROVED":
      return `Reproof: ${formatDate(entry.eventDate)}${announced(entry)}`;
    case "DISFELLOWSHIPPED":
      return `Removal from the congregation: ${formatDate(entry.eventDate)}${announced(entry)}`;
    case "DISASSOCIATED":
      return `Disassociation: ${formatDate(entry.eventDate)}${announced(entry)}`;
    case "REINSTATED":
      return `Reinstatement: ${formatDate(entry.eventDate)}${announced(entry)}`;
    case "RESTRICTION":
      return entry.liftedDate
        ? `Restrictions imposed ${formatDate(entry.eventDate)}, removed ${formatDate(entry.liftedDate)}`
        : `Restrictions imposed ${formatDate(entry.eventDate)} — still running`;
  }
}

/**
 * What the envelope carrying an S-77 has to state: the decisions made by the
 * committee — removal, reproof, reinstatement, and restrictions imposed or
 * removed — and the dates of those decisions, oldest first.
 */
export function envelopeIndication(name: string, entries: CaseEntry[]): string[] {
  const ordered = [...entries].sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
  const lines = [`Decisions of the committee of elders — ${name}`];
  if (ordered.length === 0) {
    lines.push("No decision recorded.");
    return lines;
  }
  for (const entry of ordered) lines.push(`- ${decisionLine(entry)}`);
  return lines;
}
