import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";

/**
 * One file off the school's archive: a past schedule, a workbook, a letter from
 * the branch. The bytes live in the database, so this is the only way to any of
 * them, and it is open to everyone who may read the school's records.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "school:read")) {
    return new NextResponse("Your account cannot open the school records.", { status: 403 });
  }

  const { id } = await params;
  const doc = await prisma.midweekDocument.findUnique({
    where: { id },
    select: { fileName: true, mimeType: true, bytes: true },
  });
  if (!doc) return new NextResponse("That document is no longer on file.", { status: 404 });

  const name = doc.fileName.replace(/["\\\r\n]/g, "");
  return new NextResponse(Buffer.from(doc.bytes), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
