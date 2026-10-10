import "server-only";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";

/**
 * What a decision records beyond its own row: whether it was reached at a
 * joint meeting of the bodies of elders sharing the Kingdom Hall, and every
 * brother assigned to carry it out — by name, because at a joint meeting some
 * belong to the other congregations and are not on this roll.
 *
 * Held as one congregation setting, keyed by decision, so it needs no change
 * to the database. The decision's own assignedTo still points at the first
 * of the names who is on this congregation's roll, so the dashboard and the
 * other lists that read it keep working.
 */
export const DECISION_EXTRAS_KEY = "boe:decisionExtras";

export type DecisionExtra = { joint: boolean; assignees: string[] };

export async function loadDecisionExtras(): Promise<Record<string, DecisionExtra>> {
  const row = await prisma.congregationSetting.findUnique({ where: { key: DECISION_EXTRAS_KEY } });
  if (!row) return {};
  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, DecisionExtra> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<DecisionExtra>;
      out[id] = {
        joint: v.joint === true,
        assignees: Array.isArray(v.assignees) ? v.assignees.filter((n): n is string => typeof n === "string") : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

/** Writes the extras for the given decisions, leaving every other one as it was. */
export async function saveDecisionExtras(entries: Record<string, DecisionExtra>) {
  const all = { ...(await loadDecisionExtras()), ...entries };
  const value = JSON.stringify(all);
  await prisma.congregationSetting.upsert({
    where: { key: DECISION_EXTRAS_KEY },
    update: { value },
    create: { key: DECISION_EXTRAS_KEY, value },
  });
}

/** The names assigned to a decision, falling back to its single assignee for one recorded before. */
export function assigneesOf(
  item: { id: string; assignedTo: { firstName: string; lastName: string } | null },
  extras: Record<string, DecisionExtra>,
): string[] {
  const names = extras[item.id]?.assignees ?? [];
  if (names.length) return names;
  return item.assignedTo ? [displayName(item.assignedTo)] : [];
}

/** The names as one line: "Brother A, Brother B and Brother C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Reads the names typed for a decision: trimmed, at most ten, each repeated
 * only once whatever its case. The first who is on this congregation's roll
 * among the brothers offered becomes the decision's own assignee.
 */
export function readAssignees(
  raw: string[],
  roll: { id: string; label: string }[],
): { names: string[]; assignedToId: string | null } {
  // A name from the roll, however it was typed, is kept as the roll spells it.
  const spelled = new Map(roll.map((r) => [r.label.toLowerCase(), r.label]));
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of raw) {
    const typed = value.replace(/\s+/g, " ").trim().slice(0, 80);
    const name = spelled.get(typed.toLowerCase()) ?? typed;
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
    if (names.length === 10) break;
  }
  const byLabel = new Map(roll.map((r) => [r.label.toLowerCase(), r.id]));
  const first = names.find((n) => byLabel.has(n.toLowerCase()));
  return { names, assignedToId: first ? byLabel.get(first.toLowerCase())! : null };
}

/** The brothers suggested as names are typed: this congregation's elders and ministerial servants. */
export async function assigneeRoll(): Promise<{ id: string; label: string }[]> {
  const rows = await prisma.publisher.findMany({
    where: { appointment: { in: ["ELDER", "MINISTERIAL_SERVANT"] }, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
  return rows.map((r) => ({ id: r.id, label: displayName(r) }));
}
