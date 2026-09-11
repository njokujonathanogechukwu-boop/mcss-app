import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildGroupAnalysis } from "@/lib/pdf/group";
import { currentServiceYear } from "@/lib/service-year";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const { id } = await params;
  const sy = Number(new URL(request.url).searchParams.get("sy")) || currentServiceYear();

  const group = await prisma.serviceGroup.findUnique({
    where: { id },
    select: { number: true },
  });
  if (!group) return new NextResponse("No such group.", { status: 404 });

  const pdf = await buildGroupAnalysis(id, sy);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Group_${group.number}_analysis_${sy}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
