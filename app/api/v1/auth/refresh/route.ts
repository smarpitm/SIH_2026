import { ok, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/auth/jwt";
import { toUserDTO } from "@/lib/auth/dto";
import { audit } from "@/lib/auth/audit";
import { REFRESH_COOKIE, readCookie, refreshCookie } from "@/lib/auth/cookies";
import { rotateFamily } from "@/lib/auth/refresh-store";

export async function POST(req: Request) {
  const token = readCookie(req, REFRESH_COOKIE);
  if (!token) return jsonErr("AUTH_REQUIRED", "Missing refresh token");

  const claims = await verifyRefreshToken(token);
  if (!claims) return jsonErr("AUTH_REQUIRED", "Invalid refresh token");

  // Durable family state (audit finding #2): the CAS rotation lives in
  // Postgres, so replay detection survives restarts and multi-instance deploys.
  const outcome = await rotateFamily(claims.familyId, claims.gen);

  // Reuse detection (book MA1 item 5): a token from an EARLIER rotation of a
  // live family => steal/replay => revoke the whole family.
  if (outcome === "reused") {
    await audit({
      actorId: claims.sub,
      actorKind: "unknown",
      action: "auth.family_revoked",
      entity: "refreshFamily",
      entityId: claims.familyId,
      meta: { presentedGen: claims.gen, outcome },
    });
    return jsonErr("AUTH_REQUIRED", "Refresh token reuse detected — token family revoked");
  }

  // Unknown/expired/future-generation tokens are all just invalid.
  if (outcome !== "rotated") {
    return jsonErr("AUTH_REQUIRED", "Invalid refresh token");
  }

  const user = await db.user.findUnique({ where: { id: claims.sub } });
  if (!user) return jsonErr("AUTH_REQUIRED", "Invalid refresh token");

  const accessToken = await signAccessToken(user);
  const refreshToken = await signRefreshToken(user, claims.familyId, claims.gen + 1);

  await audit({
    actorId: user.id,
    actorKind: user.role,
    action: "auth.refresh",
    entity: "user",
    entityId: user.id,
    meta: { familyId: claims.familyId, gen: claims.gen },
  });

  return Response.json(ok({ accessToken, user: toUserDTO(user) }), {
    headers: { "set-cookie": refreshCookie(refreshToken) },
  });
}

