import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// server remains authority; middleware is UX.
// pm_ui_session_hint is a client-set PRESENCE hint and pm_ui_role_hint a role
// hint (AUDIT FINDING #23: renamed from pm_session/pm_role so nobody mistakes
// this for a security boundary) — real auth (JWT Bearer) and RBAC are enforced
// server-side by the API routes (MA1).
const ROLE_PREFIXES: Record<string, string[]> = {
  "/admin": ["ADMIN"],
  "/officer": ["LMO", "GATC"],
  "/trader": ["TRADER"],
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("pm_ui_session_hint")?.value);
  const role = request.cookies.get("pm_ui_role_hint")?.value;

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
