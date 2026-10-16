import "server-only";
import { prisma } from "@/lib/prisma";

export type Clash = {
  id: string;
  requestingBody: string;
  eventType: string;
  startTime: Date;
  endTime: Date;
};

/**
 * Finds approved bookings that overlap the requested window for the same
 * resource. Two intervals overlap when each starts before the other ends.
 * The comparison runs in the database so the check stays correct and fast
 * as the calendar fills up.
 */
export async function findClashes(
  resourceId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string,
): Promise<Clash[]> {
  return prisma.hallBooking.findMany({
    where: {
      resourceId,
      status: "APPROVED",
      startTime: { lt: end },
      endTime: { gt: start },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: {
      id: true,
      requestingBody: true,
      eventType: true,
      startTime: true,
      endTime: true,
    },
    orderBy: { startTime: "asc" },
  });
}

// ------------------------------------------------------- events using both halls

/**
 * An event that uses more than one part of the hall is kept as one booking a
 * part, so every part is checked for clashes on its own, and the bookings are
 * linked as one event: approved, declined, changed and cancelled together, and
 * shown once. The links are held as one congregation setting mapping each
 * booking to its event, so no database change is needed.
 */
const LINKS_KEY = "bookings:linked";

export async function loadBookingLinks(): Promise<Record<string, string>> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: LINKS_KEY } });
  if (!row) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function writeBookingLinks(links: Record<string, string>) {
  const value = JSON.stringify(links);
  await prisma.congregationSetting.upsert({
    where: { key: LINKS_KEY },
    update: { value },
    create: { key: LINKS_KEY, value },
  });
}

/** Ties the bookings into one event, or frees a lone booking of any tie. */
export async function setBookingGroup(ids: string[], release: string[] = []) {
  const links = await loadBookingLinks();
  for (const id of [...ids, ...release]) delete links[id];
  if (ids.length > 1) {
    const group = ids[0];
    for (const id of ids) links[id] = group;
  }
  await writeBookingLinks(links);
}

/** Every booking in the same event as this one, itself included. */
export function eventIds(id: string, links: Record<string, string>): string[] {
  const group = links[id];
  if (!group) return [id];
  return Object.keys(links).filter((k) => links[k] === group);
}

/**
 * Folds the bookings of one event into a single row, in the order given: the
 * first row stands for the event, `ids` lists every booking in it, and the
 * parts of the hall are named together ("Hall A + Hall B").
 */
export function mergeEvents<T extends { id: string; resource: { name: string } }>(
  rows: T[],
  links: Record<string, string>,
): (T & { ids: string[]; resourceIds: string[] })[] {
  const out: (T & { ids: string[]; resourceIds: string[] })[] = [];
  const byGroup = new Map<string, T & { ids: string[]; resourceIds: string[] }>();
  for (const row of rows) {
    const rid = (row as unknown as { resourceId?: string }).resourceId;
    const group = links[row.id];
    const existing = group ? byGroup.get(group) : undefined;
    if (existing) {
      existing.ids.push(row.id);
      if (rid) existing.resourceIds.push(rid);
      existing.resource = { name: `${existing.resource.name} + ${row.resource.name}` };
      continue;
    }
    const merged = { ...row, resource: { ...row.resource }, ids: [row.id], resourceIds: rid ? [rid] : [] };
    if (group) byGroup.set(group, merged);
    out.push(merged);
  }
  return out;
}
