import { db } from "@/lib/db";

// book MA4 item 1 — lib/notify is a Manav-owned path.
// Kinds actually written today: CERT_ISSUED (issue hook), REVOKED (revoke
// route), REMINDER_T30 / EXPIRED (expiry sweep). SLA is reserved for future
// SLA-breach alerts.
export type NotificationKind =
  | "CERT_ISSUED"
  | "REMINDER_T30"
  | "REVOKED"
  | "SLA"
  | "EXPIRED"
  | "EXPIRING_SOON";

/** Minimal structural reader so both `db` and `Prisma.TransactionClient`
 *  callers (cert issue / revoke write inside transactions) can gate. */
export interface PreferenceReader {
  notificationPreference: {
    findUnique(args: {
      where: { userId: string };
    }): Promise<{
      certIssued: boolean;
      revocation: boolean;
      expiryReminder: boolean;
      sla: boolean;
    } | null>;
  };
}

/** AUDIT FINDING #40: per-user notification preferences. Missing row means
 *  every kind is enabled (default-on) — so existing behaviour is unchanged
 *  until a user opts out. Returns false only when the user explicitly disabled
 *  the kind's group. */
export async function notificationEnabled(
  client: PreferenceReader,
  userId: string,
  kind: NotificationKind
): Promise<boolean> {
  const pref = await client.notificationPreference.findUnique({ where: { userId } });
  if (!pref) return true;
  switch (kind) {
    case "CERT_ISSUED":
      return pref.certIssued;
    case "REVOKED":
      return pref.revocation;
    case "REMINDER_T30":
    case "EXPIRED":
    case "EXPIRING_SOON":
      return pref.expiryReminder;
    case "SLA":
      return pref.sla;
    default:
      return true; // unknown kinds are never silently suppressed
  }
}

/** Writes one Notification row after the recipient's preference check.
 *  CERT_ISSUED is written DIRECTLY by Smarpit's cert-issue hook
 *  (lib/crypto/issue.ts) — do NOT double-write it from here. */
export async function notify(
  userId: string,
  kind: NotificationKind,
  title: string,
  body: string
) {
  if (!(await notificationEnabled(db, userId, kind))) return null;
  return db.notification.create({ data: { userId, kind, title, body } });
}