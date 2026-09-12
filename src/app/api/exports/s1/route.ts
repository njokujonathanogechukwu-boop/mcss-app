import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildS1 } from "@/lib/pdf/s1";
import { reportingMonth } from "@/lib/service-year";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const url = new URL(request.url);
  const period = reportingMonth();
  const year = Number(url.searchParams.get("year")) || period.year;
  const month = Number(url.searchParams.get("month")) || period.month;
  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return new NextResponse("That month is not valid.", { status: 400 });
  }

  const pdf = await buildS1(year, month);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="S-1_${year}-${String(month).padStart(2, "0")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
