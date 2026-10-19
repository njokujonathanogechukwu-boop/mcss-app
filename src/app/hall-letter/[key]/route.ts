import { NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { letterSignatureOk, readLetter } from "@/lib/booking-letters";

export const dynamic = "force-dynamic";

/**
 * Opens a booking's request letter: for anyone signed in who can see the
 * bookings, or through the signed link in the operating committee's emails,
 * which opens this one letter without an account.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const eventKey = decodeURIComponent(key);
  const sig = new URL(request.url).searchParams.get("sig");

  if (!letterSignatureOk(eventKey, sig)) {
    const session = await readSession();
    if (!session) return new NextResponse("This link is not valid. Ask the secretary for the letter.", { status: 403 });
    if (!can(session.role, "booking:read")) return new NextResponse("Your account cannot open hall bookings.", { status: 403 });
  }

  const letter = await readLetter(eventKey);
  if (!letter) return new NextResponse("No letter is attached to this booking any more.", { status: 404 });

  // Shown in the browser where it can be (a PDF, a photograph), saved otherwise.
  const inline = letter.mimeType === "application/pdf" || letter.mimeType.startsWith("image/");
  return new NextResponse(new Uint8Array(letter.bytes), {
    headers: {
      "Content-Type": letter.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${letter.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
