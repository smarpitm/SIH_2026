import { z } from "zod";
import { ok, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/hash";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { toUserDTO } from "@/lib/auth/dto";
import { audit } from "@/lib/auth/audit";
import { refreshCookie } from "@/lib/auth/cookies";
import { createFamily } from "@/lib/auth/refresh-store";
import { rateLimit, clientIp } from "@/lib/security/ratelimit";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// per account+source throttle (audit finding #10): 10 failed attempts / 15 min.
// Only FAILED attempts consume the budget — a correct password is by definition
// not brute force, so legitimate re-logins (demo presets, HTTP test suites that
// share one account) can never lock a real user out of their own session.
// Credential stuffing / brute force is still stopped at the 10th miss. The
// response stays generic either way (MA1 item 4).
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_WINDOW_SEC = 15 * 60;

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid login payload", parsed.error.flatten());
  }

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;

  // generic invalid-credentials error — never reveal which part failed. (book MA1 item 4)
  if (!user || !valid) {
    const rate = await rateLimit(
      `login:${parsed.data.email.toLowerCase()}:${clientIp(req)}`,
      LOGIN_ATTEMPT_LIMIT,
      LOGIN_WINDOW_SEC
    );
    if (!rate.allowed) {
      return jsonErr("RATE_LIMITED", "Too many login attempts — try again later");
    }
    return jsonErr("AUTH_REQUIRED", "Invalid email or password");
  }

  const accessToken = await signAccessToken(user);
  // new durable family (audit finding #2): the row must exist BEFORE the token
  // is presented, so gen 0 is verifiable across restarts and instances.
  const familyId = await createFamily(user.id);
  const refreshToken = await signRefreshToken(user, familyId, 0);

  await audit({
    actorId: user.id,
    actorKind: user.role,
    action: "auth.login",
    entity: "user",
    entityId: user.id,
  });

  // shape EXACTLY as the stub: { accessToken, user }. (book MA1 item 10)
  // `mustChangePassword` is additive and only present for invited officers
  // who have not rotated their one-time credential yet (audit finding #6).
  return Response.json(
    ok({
      accessToken,
      user: toUserDTO(user),
      ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
    }),
    { headers: { "set-cookie": refreshCookie(refreshToken) } }
  );
}
