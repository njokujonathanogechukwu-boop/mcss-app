import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildRosterWorkbook } from "@/lib/rosters";

export const dynamic = "force-dynamic";

/** Every active group's roster as one Excel workbook, one sheet per group. */
export async function GET() {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const bytes = await buildRosterWorkbook(can(session.role, "publisher:readContact"));
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="group-rosters-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
