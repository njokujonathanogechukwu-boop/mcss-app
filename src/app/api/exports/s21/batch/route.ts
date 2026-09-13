import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildS21Batch, buildS21Zip, type S21Category } from "@/lib/pdf/s21";
import { currentServiceYear } from "@/lib/service-year";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Every publisher's S-21 as its own card in a ZIP. ?sy= service year,
 * ?group= one group only, ?format=pdf for the old single merged document.
 */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const url = new URL(request.url);
  const sy = Number(url.searchParams.get("sy")) || currentServiceYear();
  const groupId = url.searchParams.get("group") || null;
  const rawCategory = url.searchParams.get("category");
  const category: S21Category | null =
    rawCategory === "pioneers" || rawCategory === "auxiliary" || rawCategory === "others"
      ? rawCategory
      : null;

  let suffix = category ? `combined_${category}` : "all_publishers";
  if (groupId) {
    const group = await prisma.serviceGroup.findUnique({ where: { id: groupId }, select: { number: true } });
    if (!group) return new NextResponse("No such group.", { status: 404 });
    suffix = category ? `group_${group.number}_${category}` : `group_${group.number}`;
  }

  if (url.searchParams.get("format") === "pdf") {
    const { pdf, count } = await buildS21Batch(sy, groupId, category);
    if (count === 0) return new NextResponse("No active publishers to print.", { status: 404 });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="S-21_${suffix}_${sy}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const { zip, count } = await buildS21Zip(sy, groupId, category);
  if (count === 0) return new NextResponse("No active publishers to print.", { status: 404 });

  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="S-21_cards_${suffix}_${sy}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
