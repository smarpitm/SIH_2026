import { db } from "@/lib/db";

// book MA4 item 1 — lib/notify is a Manav-owned path.
export type NotificationKind = "CERT_ISSUED" | "REMINDER_T30" | "REVOKED" | "SLA";

/** Writes one Notification row. CERT_ISSUED is written DIRECTLY by Smarpit's
 *  cert-issue hook (lib/crypto/issue.ts) — do NOT double-write it from here. */
export async function notify(
  userId: string,
  kind: NotificationKind,
  title: string,
  body: string
) {
  return db.notification.create({ data: { userId, kind, title, body } });
}