import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { analyse, analysisCsv, defaultWindow, parsePeriod, periodKey } from "@/lib/analysis";
import { buildAnalysisPdf } from "@/lib/pdf/analysis";

export const dynamic = "force-dynamic";

/** ?from=YYYY-MM&to=YYYY-MM&group=<id>&format=csv|pdf */
export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return new NextResponse("Sign in first.", { status: 401 });
  if (!can(session.role, "export:run")) {
    return new NextResponse("Your account cannot download records.", { status: 403 });
  }

  const url = new URL(request.url);
  const fallback = defaultWindow();
  let from = parsePeriod(url.searchParams.get("from") ?? undefined) ?? fallback.from;
  let to = parsePeriod(url.searchParams.get("to") ?? undefined) ?? fallback.to;
  if (from.year > to.year || (from.year === to.year && from.month > to.month)) [from, to] = [to, from];
  const groupId = url.searchParams.get("group") || null;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";

  const a = await analyse(from, to, groupId);
  const stem = `Field_service_${periodKey(from)}_to_${periodKey(to)}${groupId ? "_group" : ""}`;

  if (format === "csv") {
    // Byte-order mark so Excel opens it as UTF-8.
    return new NextResponse("﻿" + analysisCsv(a), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${stem}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdf = await buildAnalysisPdf(a, groupId);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${stem}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
