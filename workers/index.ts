// workers registry (S1 — Smarpit). Shared-file addition announced in chat:
// this is the single consumer entrypoint; routes never import workers directly.
import { registerInspectionPassHandler } from "@/lib/hooks";
import { issueCertificate } from "@/lib/crypto/issue";
import { applyTransition } from "@/lib/auth/transition";
import { db } from "@/lib/db";
import { startExpiryQueue } from "@/workers/expiry-scan";

let registered = false; // module-level idempotency guard

// SMV1 flip tuning: the /inspections route commits CHECKED_IN -> PASSED only
// AFTER emitInspectionPass resolves, so the CERT_ISSUED flip cannot run inline
// in the handler — it would be overwritten by the route's own PASSED update.
// It therefore runs detached and polls briefly for the PASSED commit.
const FLIP_POLL_MS = 5;
const FLIP_TIMEOUT_MS = 5000;

async function flipToCertIssued(applicationId: string, certId: string) {
  const deadline = Date.now() + FLIP_TIMEOUT_MS;
  for (;;) {
    const app = await db.application.findUnique({
      where: { id: applicationId },
      select: { id: true, status: true },
    });
    if (!app) {
      console.warn("[workers] app not found for CERT_ISSUED flip:", applicationId);
      return;
    }
    // Idempotency: applyTransition only performs PASSED->CERT_ISSUED from
    // exactly PASSED, and an already-CERT_ISSUED app exits here — so a
    // duplicated PASS event is a harmless no-op (never a second audit row).
    if (app.status === "CERT_ISSUED") return;
    if (app.status === "PASSED") {
      const res = await applyTransition(app, "CERT_ISSUED");
      if (res instanceof Response) {
        // Illegal move per the state machine — log it and move on.
        console.warn("[workers] CERT_ISSUED flip skipped for", applicationId);
        return;
      }
      await db.auditLog.create({
        data: {
          actorId: null,
          actorKind: "system",
          action: "app.cert_issued",
          entity: "application",
          entityId: applicationId,
          meta: { certId },
        },
      });
      return;
    }
    if (Date.now() > deadline) {
      console.warn(
        "[workers] CERT_ISSUED flip gave up — app never reached PASSED:",
        applicationId
      );
      return;
    }
    await new Promise((r) => setTimeout(r, FLIP_POLL_MS));
  }
}

export function registerWorkers() {
  if (registered) return;
  registered = true;

  registerInspectionPassHandler(async (event) => {
    // never throws upward — issueCertificate swallows + audits its own failures,
    // so an inspection PASS can never fail because issuance failed.
    const cert = await issueCertificate(event);

    // Issuance failed -> no flip; the application completes CHECKED_IN -> PASSED
    // via the route and stays there. The cert.issue_failed audit row written by
    // lib/crypto/issue.ts is the failure signal.
    if (!cert) return;

    // SMV1: complete the lifecycle PASSED -> CERT_ISSUED after SUCCESSFUL
    // issuance. Detached (void) + caught so an inspection PASS can never fail
    // because of post-issuance steps either ("never throws upward").
    void flipToCertIssued(event.applicationId, cert.certId).catch((err) =>
      console.error("[workers] post-issuance CERT_ISSUED flip failed (non-fatal):", err)
    );
  });

  // S6 / PRD #6+#7: nightly expiry ladder (00:30 IST repeatable BullMQ job).
  // startExpiryQueue() skips itself when REDIS_URL is unset, and the try/catch
  // is a second belt so `npm run dev` without redis can never break here.
  try {
    startExpiryQueue();
  } catch (err) {
    console.error("[workers] expiry-scan registration skipped/failed:", err);
  }
}
