import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildPrivileges } from "@/lib/pdf/privileges";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const pdf = await buildPrivileges();
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Privileges_and_assignments.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
