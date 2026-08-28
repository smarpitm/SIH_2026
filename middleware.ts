import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ponytail: cookie-presence guard only; server-side RBAC enforced by API routes (MA1).
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get("pm_session")?.value;
  const { pathname } = request.nextUrl;

  const protectedPrefixes = ["/trader", "/officer", "/admin"];
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/trader/:path*",
    "/officer/:path*",
    "/admin/:path*",
  ],
};
