import { z } from "zod";
import { randomBytes } from "node:crypto";
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

// AUDIT FINDING #6: unique one-time temporary credentials per invite — never a
// shared fixed password. ~64 bits of entropy from crypto RNG (lookalike chars
// removed), two trailing digits so the credential also satisfies the register
// password policy. Shown ONCE to the inviting admin; only the hash is stored,
// and the account is forced to change it (User.mustChangePassword).
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = randomBytes(10);
  let pw = "";
  for (let i = 0; i < bytes.length; i++) pw += alphabet[bytes[i] % alphabet.length];
  pw += String(randomBytes(2).readUInt16BE(0) % 100).padStart(2, "0");
  return pw;
}

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

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const user = await db.user.create({
    data: { name, email: normalizedEmail, passwordHash, role, district, orgName, mustChangePassword: true },
  });

  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "auth.invite",
    entity: "user",
    entityId: user.id,
    meta: { invitedRole: role, district },
  });

  // The temp password is unique per invite and shown exactly once here — the
  // admin shares it offline; the invited user must change it before the
  // password can be considered settled (login response carries
  // mustChangePassword until /auth/change-password clears it).
  return jsonOk({
    user: toUserDTO(user),
    tempPassword,
    banner: "share credentials offline; user must change password on first login",
  });
}