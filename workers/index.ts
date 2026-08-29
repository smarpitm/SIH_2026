// workers registry (S1 — Smarpit). Shared-file addition announced in chat:
// this is the single consumer entrypoint; routes never import workers directly.
import { registerInspectionPassHandler } from "@/lib/hooks";
import { issueCertificate } from "@/lib/crypto/issue";

let registered = false; // module-level idempotency guard

export function registerWorkers() {
  if (registered) return;
  registered = true;

  registerInspectionPassHandler(async (event) => {
    // never throws upward — issueCertificate swallows + audits its own failures,
    // so an inspection PASS can never fail because issuance failed.
    await issueCertificate(event);
  });

  // TODO(S6): start the expiry queue here when process.env.REDIS_URL is set.
}
