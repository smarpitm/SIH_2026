import { jsonOk } from "@/packages/shared/api";
import { getStats } from "@/lib/public/badge";

// GET /api/v1/public/stats — aggregate public counters, 60s in-memory cache.
export async function GET() {
  return jsonOk(await getStats());
}