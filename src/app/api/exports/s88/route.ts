import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildS88 } from "@/lib/pdf/s88";
import { currentServiceYear } from "@/lib/service-year";

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const sy = Number(new URL(request.url).searchParams.get("sy")) || currentServiceYear();
  const pdf = await buildS88(sy);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="S-88_${sy}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
