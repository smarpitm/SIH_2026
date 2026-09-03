import { jsonOk } from "@/packages/shared/api";
import { getSession, requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { runExpirySweep } from "@/workers/expiry-scan";

// book S6 item 3 — POST /api/v1/certificates/expiry/scan (ADMIN only).
// Manual trigger for the nightly expiry ladder: runs ONE sweep inline
// (same code path as the BullMQ job) and reports the counts. Idempotent —
// reruns converge to { flipped: 0, reminders: 0 }.
export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "ADMIN");
  if (guard) return guard;

  const result = await runExpirySweep();

  // State-changing route ⇒ one audit row (book DoD rule 6); the flips
  // themselves are already audited with actorKind "system:bullmq".
  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "certificates.expiry_scan",
    entity: "certificate",
    entityId: "manual",
    meta: { flipped: result.flipped, reminders: result.reminders },
  });

  return jsonOk({ flipped: result.flipped, reminders: result.reminders });
}