import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildS21Batch } from "@/lib/pdf/s21";
import { currentServiceYear } from "@/lib/service-year";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every publisher's S-21 in one PDF. ?sy= service year, ?group= one group only. */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const url = new URL(request.url);
  const sy = Number(url.searchParams.get("sy")) || currentServiceYear();
  const groupId = url.searchParams.get("group") || null;

  let suffix = "all_publishers";
  if (groupId) {
    const group = await prisma.serviceGroup.findUnique({ where: { id: groupId }, select: { number: true } });
    if (!group) return new NextResponse("No such group.", { status: 404 });
    suffix = `group_${group.number}`;
  }

  const { pdf, count } = await buildS21Batch(sy, groupId);
  if (count === 0) return new NextResponse("No active publishers to print.", { status: 404 });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="S-21_${suffix}_${sy}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
