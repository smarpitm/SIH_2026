import { ok } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { audit } from "@/lib/auth/audit";
import { REFRESH_COOKIE, readCookie, clearRefreshCookie } from "@/lib/auth/cookies";
import { revokeFamily } from "@/lib/auth/refresh-store";

export async function POST(req: Request) {
  let actorId: string | null = null;
  let actorKind = "anonymous";

  // AUDIT FINDING #93: revoking only the cookie is not enough — a stolen
  // refresh token would keep minting access tokens for up to 7 days. Identify
  // the family from the refresh cookie and revoke it in Postgres (idempotent).
  const refreshToken = readCookie(req, REFRESH_COOKIE);
  const claims = refreshToken ? await verifyRefreshToken(refreshToken) : null;
  if (claims) await revokeFamily(claims.familyId);

  const session = await getSession(req);
  if (session) {
    actorId = session.userId;
    actorKind = session.role;
  } else if (claims) {
    // no access token — identify from the refresh cookie being cleared
    const user = await db.user.findUnique({ where: { id: claims.sub } });
    actorId = claims.sub;
    actorKind = user?.role ?? "unknown";
  }

  await audit({
    actorId,
    actorKind,
    action: "auth.logout",
    entity: "user",
    entityId: actorId ?? "unknown",
  });

  return Response.json(ok({}), { headers: { "set-cookie": clearRefreshCookie() } });
}
