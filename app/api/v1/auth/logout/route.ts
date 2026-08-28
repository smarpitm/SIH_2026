import { ok } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import { audit } from "@/lib/auth/audit";
import { REFRESH_COOKIE, readCookie, clearRefreshCookie } from "@/lib/auth/cookies";

export async function POST(req: Request) {
  let actorId: string | null = null;
  let actorKind = "anonymous";

  const session = await getSession(req);
  if (session) {
    actorId = session.userId;
    actorKind = session.role;
  } else {
    // no access token — identify from the refresh cookie being cleared
    const token = readCookie(req, REFRESH_COOKIE);
    const claims = token ? await verifyRefreshToken(token) : null;
    if (claims) {
      const user = await db.user.findUnique({ where: { id: claims.sub } });
      actorId = claims.sub;
      actorKind = user?.role ?? "unknown";
    }
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
