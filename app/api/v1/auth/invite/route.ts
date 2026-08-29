import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { DISTRICTS } from "@/packages/shared/constants";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { hashPassword } from "@/lib/hash";
import { toUserDTO } from "@/lib/auth/dto";
import { audit } from "@/lib/auth/audit";

// book MA5 item 1 — POST /auth/invite (ADMIN only)
const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["LMO", "GATC"]),
  district: z.enum(DISTRICTS),
  orgName: z.string().min(1),
});

const TEMP_PASSWORD = "Invite@123";

export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "ADMIN");
  if (guard) return guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid invite payload", parsed.error.flatten());
  }
  const { name, email, role, district, orgName } = parsed.data;

  const normalizedEmail = email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return jsonErr("CONFLICT", "Email already registered");

  const passwordHash = await hashPassword(TEMP_PASSWORD);
  const user = await db.user.create({
    data: { name, email: normalizedEmail, passwordHash, role, district, orgName },
  });

  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "auth.invite",
    entity: "user",
    entityId: user.id,
    meta: { invitedRole: role, district },
  });

  // book: temp password is fixed and shared offline by the admin — banner is required
  return jsonOk({
    user: toUserDTO(user),
    tempPassword: TEMP_PASSWORD,
    banner: "share credentials offline",
  });
}