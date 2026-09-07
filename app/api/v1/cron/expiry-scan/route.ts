import { jsonOk, jsonErr } from "@/packages/shared/api";
import { runExpirySweep } from "@/workers/expiry-scan";
import { repairStrandedPasses } from "@/workers";
import { audit } from "@/lib/auth/audit";

// GET /api/v1/cron/expiry-scan — Vercel Cron entrypoint for the nightly expiry
// ladder (00:30 IST = 19:00 UTC, see vercel.json `crons`).
//
// WHY THIS EXISTS: on serverless hosting (Vercel) there is no long-running
// worker process, so the BullMQ worker (`npm run worker`) cannot run. This
// route runs the SAME code paths inline instead:
//   - runExpirySweep()       — the expiry ladder (identical to the BullMQ job)
//   - repairStrandedPasses() — one-shot repair for PASSED apps without certs
//     (imported from the worker registry WITHOUT calling registerWorkers(), so
//     no Redis/BullMQ connection is ever opened from this route).
// Both sweeps are idempotent by design (guarded updates + dedupe keys), so a
// retry or manual re-hit converges to { flipped: 0, reminders: 0, repaired: 0 }.
//
// AUTH: Vercel Cron automatically attaches `Authorization: Bearer $CRON_SECRET`
// when the CRON_SECRET env var is set on the project. Requests without the
// exact secret are rejected — this endpoint is the only unauthenticated-caller
// surface and it must never be open.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: a deployment without CRON_SECRET must not expose the sweep.
    return jsonErr("INTERNAL", "CRON_SECRET is not configured on this deployment", undefined, 503);
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || token !== secret) {
    return jsonErr("AUTH_REQUIRED", "Invalid or missing cron secret", undefined, 401);
  }

  const sweep = await runExpirySweep();
  const repaired = await repairStrandedPasses();

  // State-changing route ⇒ one audit row (book DoD rule 6). The flips/repairs
  // themselves are already audited (actorKind "system:bullmq" / "system").
  await audit({
    actorId: null,
    actorKind: "system:cron",
    action: "certificates.cron_expiry_scan",
    entity: "certificate",
    entityId: "cron",
    meta: {
      scanned: sweep.scanned,
      flipped: sweep.flipped,
      reminders: sweep.reminders,
      repaired,
    },
  });

  return jsonOk({ scanned: sweep.scanned, flipped: sweep.flipped, reminders: sweep.reminders, repaired });
}