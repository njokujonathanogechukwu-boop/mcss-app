import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Every record in one JSON file, for safe keeping. Password hashes and the
 * uploaded form files are left out; everything the congregation entered is
 * included.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "user:manage")) {
    return new NextResponse("Only the secretary or coordinator can download a backup.", { status: 403 });
  }

  const [publishers, groups, reports, attendance, memorials, resources, bookings, decisions, transfers, privileges, assignments, users, audit] =
    await Promise.all([
      prisma.publisher.findMany(),
      prisma.serviceGroup.findMany(),
      prisma.serviceReport.findMany(),
      prisma.meetingAttendance.findMany(),
      prisma.memorialRecord.findMany(),
      prisma.hallResource.findMany(),
      prisma.hallBooking.findMany(),
      prisma.boeDecision.findMany(),
      prisma.transferLog.findMany(),
      prisma.privilege.findMany(),
      prisma.publisherPrivilege.findMany(),
      prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, active: true, publisherId: true, createdAt: true } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } }),
    ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    exportedBy: session.email,
    application: "Maitama Congregation Secretary System",
    publishers, groups, reports, attendance, memorials, resources, bookings, decisions, transfers, privileges, assignments, users, audit,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mcss-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
