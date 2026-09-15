import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildCaseFolder } from "@/lib/case-folder";

export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "standing:read")) {
    return new NextResponse("Only elders can open a case file.", { status: 403 });
  }

  const { id } = await params;
  const built = await buildCaseFolder(id);
  if (!built) return new NextResponse("That entry is no longer on file.", { status: 404 });

  return new NextResponse(Buffer.from(built.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${built.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
