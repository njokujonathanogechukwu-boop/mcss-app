import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { displayName } from "@/lib/format";
import { ensureSelfTokens, requestOrigin } from "@/lib/self-service";
import { waHref } from "@/lib/reminders";
import { buildSelfLinksSheet } from "@/lib/pdf/self-links";

export const dynamic = "force-dynamic";

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Every publisher's personal update link as a spreadsheet, ordered by field
 * service group so each group's links sit together and can be filtered or
 * copied out group by group.
 */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "publisher:write")) {
    return new NextResponse("Your account cannot view publisher update links.", { status: 403 });
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (new URL(request.url).searchParams.get("format") === "pdf") {
    const pdf = await buildSelfLinksSheet();
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="publisher-update-links-${stamp}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const origin = await requestOrigin();
  if (!origin) return new NextResponse("Could not work out the site address.", { status: 500 });

  const publishers = await prisma.publisher.findMany({
    where: { status: { in: ["ACTIVE", "IRREGULAR"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      group: { select: { number: true, name: true } },
    },
    orderBy: [{ group: { number: "asc" } }, { lastName: "asc" }, { firstName: "asc" }],
  });
  const tokens = await ensureSelfTokens(publishers.map((p) => p.id));

  const rows: string[][] = [];
  for (const p of publishers) {
    const token = tokens.get(p.id);
    if (!token) continue;
    const link = `${origin}/my/${token}`;
    rows.push([
      p.group ? `${p.group.number} — ${p.group.name}` : "No group",
      displayName(p),
      link,
      waHref(p.phone, `Dear ${p.firstName}, please open this personal page to check and update your details with the congregation: ${link}`) ?? "",
    ]);
  }

  const header = ["Service group", "Publisher", "Update link", "WhatsApp (tap to send)"];
  const csv = "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="publisher-update-links-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
