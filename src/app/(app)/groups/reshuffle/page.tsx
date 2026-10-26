import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { displayName, toDateInput } from "@/lib/format";
import { PageHeader } from "@/components/shell";
import { ReshuffleBoard, type BoardGroup, type BoardPerson } from "./board";

export const dynamic = "force-dynamic";

/**
 * Re-forms the service groups in one sitting: every group side by side, each
 * publisher moved with a click, the overseers set alongside, and the whole
 * reshuffle saved together with one effective date.
 */
export default async function ReshufflePage() {
  await requirePermission("publisher:write");

  const [groups, people, leaders] = await Promise.all([
    prisma.serviceGroup.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true, overseerId: true, assistantId: true },
    }),
    // Everyone a group carries: the roll, and the inactive ones its overseer
    // still looks after.
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR", "INACTIVE"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, groupId: true, status: true, appointment: true },
    }),
    prisma.publisher.findMany({
      where: { appointment: { in: ["ELDER", "MINISTERIAL_SERVANT"] }, status: { in: ["ACTIVE", "IRREGULAR"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const activeGroups = new Set(groups.map((g) => g.id));
  const boardGroups: BoardGroup[] = groups.map((g) => ({
    id: g.id,
    number: g.number,
    // A group named only by its number is not called "Group 9 — Group 9".
    label: g.name.trim().toLowerCase() === `group ${g.number}` ? `Group ${g.number}` : `Group ${g.number} — ${g.name}`,
    overseerId: g.overseerId ?? "",
    assistantId: g.assistantId ?? "",
  }));
  const boardPeople: BoardPerson[] = people.map((p) => ({
    id: p.id,
    name: displayName(p),
    groupId: p.groupId && activeGroups.has(p.groupId) ? p.groupId : "",
    note: [
      p.appointment === "ELDER" ? "Elder" : p.appointment === "MINISTERIAL_SERVANT" ? "Ministerial servant" : null,
      p.status === "INACTIVE" ? "Inactive" : p.status === "IRREGULAR" ? "Irregular" : null,
    ].filter(Boolean).join(" · ") || null,
  }));

  return (
    <>
      <PageHeader
        title="Reshuffle the groups"
        description="Move publishers between groups with the menu on each name, or tick several and move them together. Set each group's overseer and assistant at the top of its column. Nothing changes until you save, and every move is recorded on the publisher's record with the date and reason below."
        back={{ href: "/groups", label: "Service groups" }}
      />
      <ReshuffleBoard
        groups={boardGroups}
        people={boardPeople}
        leaders={leaders.map((l) => ({ id: l.id, name: displayName(l) }))}
        today={toDateInput(new Date())}
      />
    </>
  );
}
