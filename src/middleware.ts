import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/health", "/api/cron"];

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
    url.pathname = "/login";
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
