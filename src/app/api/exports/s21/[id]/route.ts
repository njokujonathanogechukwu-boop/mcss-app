import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildS21 } from "@/lib/pdf/s21";
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

  const publisher = await prisma.publisher.findUnique({
    where: { id },
    select: { firstName: true, lastName: true },
  });
  if (!publisher) return new NextResponse("No such publisher.", { status: 404 });

  const pdf = await buildS21(id, sy);
  const filename = `S-21 ${publisher.lastName} ${publisher.firstName} ${sy}.pdf`.replace(/\s+/g, "_");

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
