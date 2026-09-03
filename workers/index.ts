// workers registry (S1 — Smarpit). Shared-file addition announced in chat:
// this is the single consumer entrypoint; routes never import workers directly.
import { registerInspectionPassHandler } from "@/lib/hooks";
import { issueCertificate } from "@/lib/crypto/issue";
import { startExpiryQueue } from "@/workers/expiry-scan";

let registered = false; // module-level idempotency guard

export function registerWorkers() {
  if (registered) return;
  registered = true;

  registerInspectionPassHandler(async (event) => {
    // never throws upward — issueCertificate swallows + audits its own failures,
    // so an inspection PASS can never fail because issuance failed.
    await issueCertificate(event);
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
