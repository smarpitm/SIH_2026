// instrumentation — Next.js 14 hook (named export `register`).
//
// AUDIT FINDINGS #5/#21: workers are a SEPARATE process and are deliberately
// NOT part of the Next.js bundle. This module therefore never imports
// worker/queue code (importing it would pull ioredis + node builtins into the
// webpack graph and fail `next build`). Workers are started by their own
// process entry: `npm run worker` (tsx workers/worker-entry.ts). The web app
// only performs production-env validation here.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // build phase + static page-data collection: zero side effects
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { assertProductionEnv } = await import("./lib/security/env");
    assertProductionEnv();
  } catch (err) {
    throw err; // fail fast on a misconfigured production boot
  }
}
