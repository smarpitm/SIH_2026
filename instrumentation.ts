// instrumentation — Next.js 14 hook (named export `register`).
// Worker registration must run in the Node.js runtime only. The EDGE variant of
// this bundle cannot handle node: builtins (lib/crypto uses node:crypto), so we
// gate on NEXT_RUNTIME — webpack tree-shakes the import out of the edge bundle.
// (Fixes `next dev` UnhandledSchemeError after MG2; Smarpit's registry unchanged.)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { registerWorkers } = await import("./workers/index");
      registerWorkers();
    } catch (err) {
      console.error("[instrumentation] worker registration failed:", err);
    }
  }
}
