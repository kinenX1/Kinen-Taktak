import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route protection: redirect visitors without a session cookie
 * away from private areas before rendering. The real authentication and
 * authorisation checks happen on the server in `src/lib/auth/dal.ts`.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("movera_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
