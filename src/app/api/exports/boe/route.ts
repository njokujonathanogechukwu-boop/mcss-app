import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildBoeSummary } from "@/lib/pdf/boe";

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return new NextResponse("Give the meeting date: ?date=YYYY-MM-DD.", { status: 400 });
  }

  const pdf = await buildBoeSummary(date);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="BOE_meeting_${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
