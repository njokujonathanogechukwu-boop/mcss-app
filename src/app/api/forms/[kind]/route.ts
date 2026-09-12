import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { testFill } from "@/lib/pdf/fill";
import type { FormKind } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * ?mode=test  the uploaded form with every field labelled by its own name,
 *             to check what the app can see.
 * otherwise   the uploaded form as it was received.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "forms:manage")) {
    return new NextResponse("Your account cannot manage forms.", { status: 403 });
  }

  const { kind } = await params;
  if (!["S21", "S1", "S88"].includes(kind)) return new NextResponse("Unknown form.", { status: 404 });

  const template = await prisma.formTemplate.findUnique({ where: { kind: kind as FormKind } });
  if (!template) return new NextResponse("No form uploaded.", { status: 404 });

  const mode = new URL(request.url).searchParams.get("mode");
  const bytes = mode === "test" ? await testFill(Buffer.from(template.data)) : template.data;
  const name = mode === "test" ? `${kind}_field_check.pdf` : template.fileName;

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
