import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";

// AUDIT FINDING #40: first-class per-user notification preferences. Absent row
// = all groups enabled (default-on). The GET shape doubles as the PUT body.
// Kinds map to groups in lib/notify/notifications.ts (CERT_ISSUED ->
// certIssued, REVOKED -> revocation, REMINDER_T30/EXPIRED/EXPIRING_SOON ->
// expiryReminder, SLA -> sla).

const DEFAULTS = {
  certIssued: true,
  revocation: true,
  expiryReminder: true,
  sla: true,
} as const;

const prefsSchema = z.object({
  certIssued: z.boolean().optional(),
  revocation: z.boolean().optional(),
  expiryReminder: z.boolean().optional(),
  sla: z.boolean().optional(),
});

type Prefs = z.infer<typeof prefsSchema>;

async function readPrefs(userId: string): Promise<Required<Prefs>> {
  const row = await db.notificationPreference.findUnique({ where: { userId } });
  return row
    ? {
        certIssued: row.certIssued,
        revocation: row.revocation,
        expiryReminder: row.expiryReminder,
        sla: row.sla,
      }
    : { ...DEFAULTS };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;
  return jsonOk(await readPrefs(session!.userId));
}

export async function PUT(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session);
  if (guard) return guard;

  const parsed = prefsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonErr("VALIDATION_ERROR", "Invalid preferences payload", parsed.error.flatten());
  }

  const merged = { ...(await readPrefs(session!.userId)), ...parsed.data };
  await db.notificationPreference.upsert({
    where: { userId: session!.userId },
    create: { userId: session!.userId, ...merged },
    update: merged,
  });
  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "notifications.preferences_updated",
    entity: "user",
    entityId: session!.userId,
    meta: merged,
  });
  return jsonOk(merged);
}
