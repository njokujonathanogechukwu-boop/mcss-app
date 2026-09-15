import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { displayName } from "@/lib/format";
import { isEmailAddress, splitAddresses } from "@/lib/mail-addresses";

/**
 * Turns a choice on the compose form into a list of real addresses. Mail to a
 * group or to the whole congregation goes out as one message per person, so no
 * address is ever handed to a recipient who does not own it.
 */

export type Recipient = { name: string; email: string };

export type Audience = {
  recipients: Recipient[];
  /** People in scope who have no email on file, so they will not get the mail. */
  withoutEmail: number;
  /** Typed addresses that are not shaped like an address at all. */
  invalid: string[];
};

function unique(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const key = r.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Publishers who are on the roll and have an address, newest records included. */
async function publishersWithMail(groupId?: string | null) {
  const where: Prisma.PublisherWhereInput = {
    status: { in: ["ACTIVE", "IRREGULAR"] },
    ...(groupId ? { groupId } : {}),
  };
  const [withEmail, withoutEmail] = await Promise.all([
    prisma.publisher.findMany({
      where: { ...where, email: { not: null } },
      select: { firstName: true, lastName: true, email: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.publisher.count({ where: { ...where, email: null } }),
  ]);
  return {
    recipients: withEmail.map((p) => ({ name: displayName(p), email: p.email as string })),
    withoutEmail,
  };
}

export async function resolveAudience(input: {
  audience: "manual" | "group" | "all";
  addresses?: string;
  groupId?: string | null;
}): Promise<Audience> {
  if (input.audience === "manual") {
    const typed = splitAddresses(input.addresses ?? "");
    const invalid = typed.filter((a) => !isEmailAddress(a));
    const valid = typed.filter((a) => isEmailAddress(a));
    return {
      recipients: unique(valid.map((email) => ({ name: "", email }))),
      withoutEmail: 0,
      invalid,
    };
  }

  const { recipients, withoutEmail } = await publishersWithMail(
    input.audience === "group" ? input.groupId : undefined,
  );
  return { recipients: unique(recipients), withoutEmail, invalid: [] };
}

/** What the compose form needs to describe each choice before anything is sent. */
export async function audienceOptions() {
  const [groups, withEmail, withoutEmail] = await Promise.all([
    prisma.serviceGroup.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        name: true,
        _count: { select: { members: { where: { status: { in: ["ACTIVE", "IRREGULAR"] }, email: { not: null } } } } },
      },
    }),
    prisma.publisher.count({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] }, email: { not: null } },
    }),
    prisma.publisher.count({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] }, email: null },
    }),
  ]);

  return {
    groups: groups.map((g) => ({
      value: g.id,
      label: `${g.number} — ${g.name}`,
      members: g._count.members,
    })),
    congregation: withEmail,
    withoutEmail,
  };
}
