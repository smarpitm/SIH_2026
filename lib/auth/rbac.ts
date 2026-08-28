import { jsonErr } from "@/packages/shared/api";
import type { Session } from "./session";

/** (book MA1 item 8)
 *  ADMIN passes anywhere. TRADER/LMO/GATC must match the resource district —
 *  for TRADER this is the district half of the guard; route-level OWNERSHIP is
 *  additionally checked per-route by the caller (MA2+).
 *  Details shape is EXACT — integration checks depend on it:
 *    { required: "district:<X>", have: "district:<Y>" }
 */
export function assertJurisdiction(
  session: Session,
  district: string | null | undefined
): Response | null {
  if (session.role === "ADMIN") return null;
  if (district && session.district === district) return null;
  return jsonErr("JURISDICTION_FORBIDDEN", "Resource is outside your jurisdiction", {
    required: `district:${district ?? "unknown"}`,
    have: `district:${session.district ?? "unknown"}`,
  });
}
