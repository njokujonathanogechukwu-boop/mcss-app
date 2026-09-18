import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/school/login", "/api/health", "/api/cron", "/my", "/group/", "/set-password", "/forgot-password"];

/**
 * Presence check only. The cookie's signature is verified in `readSession`,
 * which every protected page and server action calls. Middleware just keeps
 * signed-out visitors away from the record pages.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasSession = request.cookies.has("mcss_session");
  if (!hasSession) {
    const url = request.nextUrl.clone();
    // The school area has a sign-in page of its own, so the overseer never
    // lands on the secretary's door.
    url.pathname = pathname.startsWith("/school") ? "/school/login" : "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // sw.js and the webmanifest carry no congregation data — the worker caches
  // only the two icons — but both must be reachable while signed out, or the
  // phone app can never register its worker or be installed.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:webmanifest|svg|png|jpg|webp|ico)$).*)"],
};
