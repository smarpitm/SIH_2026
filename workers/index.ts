// workers registry (S1 — Smarpit). AUDIT FINDINGS #4/#5: the web request path
// no longer emits PASS events through the hook — inspections issue inline and
// transactionally. This module is now worker-process-only and must be imported
// exclusively behind ENABLE_WORKERS=true (instrumentation.ts does the gating),
// so `next build` and worker-less deployments never touch Redis/BullMQ.
import { issueCertificate } from "@/lib/crypto/issue";
import { applyTransition } from "@/lib/auth/transition";
import { db } from "@/lib/db";
import { startExpiryQueue } from "@/workers/expiry-scan";

let registered = false; // module-level idempotency guard

export function registerWorkers() {
  if (registered) return;
  registered = true;

  // S6 / PRD #6+#7: nightly expiry ladder (00:30 IST repeatable BullMQ job).
  // startExpiryQueue() skips itself when REDIS_URL is unset, and the try/catch
  // is a second belt so `npm run dev` without redis can never break here.
  try {
    startExpiryQueue();
  } catch (err) {
    console.error("[workers] expiry-scan registration skipped/failed:", err);
  }
}

// Repair sweep (audit finding #4): flips applications stranded in PASSED
// without a certificate (rows written by pre-fix deployments, or issuances
// that failed for transient reasons before the inline-transaction fix).
// Runs ONLY in the worker process (ENABLE_WORKERS=true) — never in the web
// request path. Safe to re-run: issuance is idempotent per application and
// applyTransition only performs PASSED -> CERT_ISSUED from exactly PASSED.
export async function repairStrandedPasses(): Promise<number> {
  const stranded = await db.application.findMany({
    where: { status: "PASSED", certificates: { none: {} } },
    include: {
      inspection: { select: { id: true, inspectorId: true } },
      schedules: { select: { assigneeKind: true }, take: 1 },
    },
    take: 50,
  });
  let repaired = 0;
  for (const app of stranded) {
    if (!app.inspection) continue;
    try {
      const cert = await issueCertificate({
        applicationId: app.id,
        instrumentId: app.instrumentId,
        reportId: app.inspection.id,
        inspectorId: app.inspection.inspectorId,
        inspectorKind: (app.schedules[0]?.assigneeKind as "LMO" | "GATC") ?? "LMO",
      });
      if (!cert) continue;
      const res = await applyTransition(app, "CERT_ISSUED");
      if (res instanceof Response) {
        console.warn("[workers] CERT_ISSUED flip skipped for", app.id);
        continue;
      }
      await db.auditLog.create({
        data: {
          actorId: null,
          actorKind: "system",
          action: "app.cert_issued",
          entity: "application",
          entityId: app.id,
          meta: { certId: cert.certId, repaired: true },
        },
      });
      repaired++;
    } catch (err) {
      console.error("[workers] repair failed for", app.id, err);
    }
  }
  return repaired;
}
