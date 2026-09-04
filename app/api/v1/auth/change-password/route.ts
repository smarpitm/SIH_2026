import { z } from "zod";
import { Prisma } from "@prisma/client";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/hash";

// POST /api/v1/auth/change-password — authenticated password rotation.
// Completes the invite loop (audit finding #6): invited officers land with a
// one-time credential and User.mustChangePassword=true; this route is the only
// thing that clears the flag.
const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(72)
    .regex(/\d/, "Password must contain at least one digit"),
});

export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid payload", parsed.error.flatten());
  }

  const user = await db.user.findUnique({ where: { id: session!.userId } });
  if (!user) return jsonErr("AUTH_REQUIRED", "Invalid token");

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    // generic failure — do not reveal which half failed
    return jsonErr("AUTH_REQUIRED", "Invalid email or password");
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  try {
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      }),
      // audit inside the same transaction as the credential update
      db.auditLog.create({
        data: {
          actorId: user.id,
          actorKind: user.role,
          action: "auth.password_changed",
          entity: "user",
          entityId: user.id,
        },
      }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonErr("INTERNAL", "Password update failed");
    }
    throw e;
  }

  return jsonOk({ changed: true });
}
