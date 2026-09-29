export type Neighbour = { href: string; label: string } | null;

/** The records on either side of `id` in an ordered list, or null at the ends. */
export function neighbours<T extends { id: string }>(
  rows: T[], id: string, link: (row: T) => { href: string; label: string },
): { prev: Neighbour; next: Neighbour } {
  const at = rows.findIndex((row) => row.id === id);
  return {
    prev: at > 0 ? link(rows[at - 1]) : null,
    next: at >= 0 && at < rows.length - 1 ? link(rows[at + 1]) : null,
  };
}
