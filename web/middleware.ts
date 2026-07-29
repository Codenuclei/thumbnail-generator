import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The app shell ("/") is a single-page client dashboard, not marketing
 * content — it gains nothing from long-lived edge caching, and a stale
 * cached copy makes every deploy look "stuck" on old code. Next.js's own
 * Cache-Control header for statically-optimized pages can't be overridden
 * via next.config.js headers(), so we do it here in middleware instead.
 * Static assets under /_next/static are already content-hashed and remain
 * safe to cache forever — this only touches the root document.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (request.nextUrl.pathname === "/") {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
  }
  return response;
}

export const config = {
  matcher: "/",
};
