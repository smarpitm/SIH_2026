import { jsonErr } from "@/packages/shared/api";
import type { Role } from "@/packages/shared/constants";
import { verifyAccessToken } from "./jwt";

export interface Session {
  userId: string;
  role: Role;
  district: string | null;
}

/** Read Authorization: Bearer <token> -> verify -> { userId, role, district } or null. (book MA1 item 2) */
export async function getSession(req: Request): Promise<Session | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const claims = await verifyAccessToken(header.slice("Bearer ".length).trim());
  if (!claims) return null;
  return { userId: claims.sub, role: claims.role, district: claims.district };
}

/** Gate helper: returns a jsonErr Response (AUTH_REQUIRED unauthenticated /
 *  AUTH_FORBIDDEN wrong role) or null when the caller may proceed. (book MA1 item 2) */
export function requireRole(session: Session | null, ...roles: Role[]): Response | null {
  if (!session) return jsonErr("AUTH_REQUIRED", "Authentication required");
  if (roles.length > 0 && !roles.includes(session.role)) {
    return jsonErr("AUTH_FORBIDDEN", "Role not permitted for this action");
  }
  return null;
}
