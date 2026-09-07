import { jsonOk } from "@/packages/shared/api";
import { getStats } from "@/lib/public/badge";

// GET /api/v1/public/stats — aggregate public counters, 60s in-memory cache.
// force-dynamic: this route MUST be rendered per-request. Without it Next 14
// statically evaluates it at build time — which (a) makes `next build` fail
// whenever no database is reachable from the build machine (Vercel builds run
// on ephemeral containers) and (b) would freeze the counters into a static
// response. It is also the deployment health-check endpoint.
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk(await getStats());
}