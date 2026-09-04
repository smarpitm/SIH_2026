// workers/worker-entry.ts — SEPARATE worker process entrypoint (audit #5/#21).
// Run as its own process:  npm run worker
// Loads env (standalone), registers BullMQ expiry scheduler + worker, and runs
// the repair sweep for any applications stranded in PASSED by pre-fix writes.
// Deliberately NOT imported by any Next.js route/instrumentation, so the web
// bundle stays free of ioredis/node builtins.
import "./expiry-scan"; // standalone .env loader + queue/worker definitions
import { registerWorkers, repairStrandedPasses } from "./index";

registerWorkers();

repairStrandedPasses()
  .then((n) => {
    if (n > 0) console.log(`[worker] repaired ${n} stranded PASSED application(s)`);
  })
  .catch((err) => console.error("[worker] repair sweep failed:", err));

console.log("[worker] PRAMANAM worker process started (expiry scan + repair).");

// keep the process alive (BullMQ worker holds its own handles; this guard is
// for stop-loops during dev)
setInterval(() => {}, 1 << 30);