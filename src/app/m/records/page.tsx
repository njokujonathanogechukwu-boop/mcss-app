import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { reviewPublishers } from "@/lib/completeness";
import { MobileRecordsList } from "./mobile-records-list";

export const dynamic = "force-dynamic";

export default async function MobileRecordsPage() {
  const user = await requirePermission("publisher:read");
  const showContact = can(user.role, "publisher:readContact");

  const [publishers, groups] = await Promise.all([
    prisma.publisher.findMany({
      where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        baptismDate: true,
        isBaptized: true,
        pioneerStatus: true,
        groupId: true,
        createdAt: true,
        group: { select: { number: true, name: true } },
        reports: { select: { year: true, month: true } },
        ...(showContact
          ? { phone: true, email: true, address: true, emergencyContactName: true, emergencyContactPhone: true }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.serviceGroup.findMany({ where: { active: true }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
  ]);

  const { reviews, summary, thisMonth } = reviewPublishers(
    publishers.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      baptismDate: p.baptismDate,
      isBaptized: p.isBaptized,
      pioneerStatus: p.pioneerStatus,
      groupId: p.groupId,
      createdAt: p.createdAt,
      group: p.group,
      reports: p.reports,
      phone: "phone" in p ? (p.phone as string | null) : null,
      email: "email" in p ? (p.email as string | null) : null,
      address: "address" in p ? (p.address as string | null) : null,
      emergencyContactName: "emergencyContactName" in p ? (p.emergencyContactName as string | null) : null,
      emergencyContactPhone: "emergencyContactPhone" in p ? (p.emergencyContactPhone as string | null) : null,
    })),
    { includeContact: showContact },
  );

  const flags = {
    canEditPublisher: can(user.role, "publisher:write"),
    canEditContact: can(user.role, "publisher:write") && showContact,
    canEditReport: can(user.role, "report:write"),
  };

  const incomplete = reviews.filter((r) => r.issueCount > 0);

  return (
    <MobileRecordsList
      reviews={incomplete}
      groups={groups}
      month={thisMonth}
      flags={flags}
      summary={{ total: summary.total, complete: summary.complete }}
    />
  );
}
