import { z } from "zod";
import { Prisma } from "@prisma/client";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { ROLES, DISTRICTS } from "@/packages/shared/constants";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/hash";
import { getSession } from "@/lib/auth/session";
import { toUserDTO } from "@/lib/auth/dto";
import { audit } from "@/lib/auth/audit";

// book MA1 item 3 — public registration. AUDIT FINDING #56: trader-only.
// LMO/GATC accounts are created exclusively via admin invite (unique one-time
// credentials, POST /auth/invite); ADMIN accounts via an existing ADMIN.
const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(72) // audit finding #9: cap length (long passphrases fine, DoS-length not)
    .regex(/\d/, "Password must contain at least one digit"),
  role: z.enum(ROLES),
  orgName: z.string().min(1).optional(),
  // promptbook_phone: mandatory 10-digit Indian mobile (starts 6-9, digits only).
  // Trimmed before validation so " 9876543210 " registers cleanly. The DB column
  // stays nullable — legacy/seed users keep working (no migration, no backfill).
  phone: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.string().regex(/^[6-9]\d{9}$/, "Phone must be a valid 10-digit Indian mobile number")
  ),
  district: z.enum(DISTRICTS).optional(),
}).superRefine((val, ctx) => {
  // AUDIT FINDING #94: a TRADER without a district has session.district ===
  // null, which disables the district-lock check in POST /api/v1/instruments
  // and lets them register instruments in ANY jurisdiction. District is
  // therefore mandatory on public trader registration.
  if (val.role === "TRADER" && !val.district) {
    ctx.addIssue({
      code: "custom",
      path: ["district"],
      message: "District is required for trader registration",
    });
  }
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid registration payload", parsed.error.flatten());
  }
  const { name, email, password, role, orgName, phone, district } = parsed.data;

  // AUDIT FINDING #56: officer roles can NEVER be self-registered — role and
  // district claims drive the whole RBAC/jurisdiction model, so an open path
  // to LMO/GATC would be a full authorization bypass. Use POST /auth/invite.
  if (role === "LMO" || role === "GATC") {
    return jsonErr("AUTH_FORBIDDEN", "Officer accounts are created via admin invite only");
  }

  // role ADMIN rejected with AUTH_FORBIDDEN unless an ADMIN token calls it
  // (admin creates admins via MA5 invite). (book MA1 item 3)
  if (role === "ADMIN") {
    const session = await getSession(req);
    if (!session || session.role !== "ADMIN") {
      return jsonErr("AUTH_FORBIDDEN", "ADMIN accounts can only be created by an ADMIN");
    }
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return jsonErr("CONFLICT", "Email already registered");

  const passwordHash = await hashPassword(password); // frozen scrypt (lib/hash.ts)
  try {
    const user = await db.user.create({
      data: { name, email: normalizedEmail, passwordHash, role, orgName, phone, district },
    });
    await audit({
      actorId: user.id,
      actorKind: user.role,
      action: "auth.register",
      entity: "user",
      entityId: user.id,
    });
    return jsonOk(toUserDTO(user));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonErr("CONFLICT", "Email already registered");
    }
    throw e;
  }
}
