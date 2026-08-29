import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// server remains authority; middleware is UX.
// pm_session is a client-set PRESENCE cookie and pm_role a role hint — real
// auth (JWT Bearer) and RBAC are enforced server-side by the API routes (MA1).
const ROLE_PREFIXES: Record<string, string[]> = {
  "/admin": ["ADMIN"],
  "/officer": ["LMO", "GATC"],
  "/trader": ["TRADER"],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("pm_session")?.value);
  const role = request.cookies.get("pm_role")?.value;

  for (const [prefix, allowed] of Object.entries(ROLE_PREFIXES)) {
    const isProtected = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (!isProtected) continue;

    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // wrong role for this portal → bounce home (presence cookie without a role
    // hint is treated as unknown and bounced too)
    if (!role || !allowed.includes(role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
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
