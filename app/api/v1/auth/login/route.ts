import { z } from "zod";
import { ok, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/hash";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import { toUserDTO } from "@/lib/auth/dto";
import { audit } from "@/lib/auth/audit";
import { refreshCookie } from "@/lib/auth/cookies";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
  if (!user || !valid) return jsonErr("AUTH_REQUIRED", "Invalid email or password");

  const accessToken = await signAccessToken(user);
  const refreshToken = await signRefreshToken(user); // new family, gen 0

  await audit({
    actorId: user.id,
    actorKind: user.role,
    action: "auth.login",
    entity: "user",
    entityId: user.id,
  });

  // shape EXACTLY as the stub: { accessToken, user }. (book MA1 item 10)
  return Response.json(ok({ accessToken, user: toUserDTO(user) }), {
    headers: { "set-cookie": refreshCookie(refreshToken) },
  });
}
