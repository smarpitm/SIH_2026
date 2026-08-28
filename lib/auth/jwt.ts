import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { Role } from "@/packages/shared/constants";

const ACCESS_TTL = "15m"; // book MA1 item 1
const REFRESH_TTL = "7d";

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  district: string | null;
}

export interface RefreshTokenClaims {
  sub: string;
  familyId: string;
  /** Rotation generation inside the family (0 = issued at login).
   *  Needed by MA1 item 5's reuse detection: "reuse of an older refresh" is only
   *  detectable if rotations are distinguishable inside one family. */
  gen: number;
}

function getSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): Uint8Array {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env ${name}`);
  return new TextEncoder().encode(value);
}

/** HS256, 15 min, claims { sub, role, district } signed with JWT_SECRET. */
export async function signAccessToken(user: {
  id: string;
  role: Role;
  district?: string | null;
}): Promise<string> {
  return new SignJWT({ role: user.role, district: user.district ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getSecret("JWT_SECRET"));
}

/** HS256, 7 days, claims { sub, familyId } signed with JWT_REFRESH_SECRET.
 *  A fresh login starts a new family (gen 0); rotation reuses the familyId. */
export async function signRefreshToken(
  user: { id: string },
  familyId: string = randomUUID(),
  gen = 0
): Promise<string> {
  return new SignJWT({ familyId, gen })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(getSecret("JWT_REFRESH_SECRET"));
}

/** Returns the verified access-token payload or null (expired/invalid/missing). */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret("JWT_SECRET"));
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return {
      sub: payload.sub,
      role: payload.role as Role,
      district: typeof payload.district === "string" ? payload.district : null,
    };
  } catch {
    return null;
  }
}

/** Returns the verified refresh-token payload or null (expired/invalid/missing). */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret("JWT_REFRESH_SECRET"));
    if (
      typeof payload.sub !== "string" ||
      typeof payload.familyId !== "string" ||
      typeof payload.gen !== "number" ||
      !Number.isInteger(payload.gen) ||
      payload.gen < 0
    ) {
      return null;
    }
    return { sub: payload.sub, familyId: payload.familyId, gen: payload.gen };
  } catch {
    return null;
  }
}
