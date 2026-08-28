import { jsonErr } from "@/packages/shared/api";
import { TRANSITIONS, type AppStatus } from "@/packages/shared/constants";
import { Prisma, type Application } from "@prisma/client";
import { db } from "@/lib/db";

/** (book MA3 item 2 — required already by MA2 item 8.)
 *  Looks up TRANSITIONS from frozen packages/shared/constants. Illegal move →
 *  jsonErr INVALID_STATE_TRANSITION with details { from, to } — EXACT shape,
 *  other streams assert on it. Legal move persists the new status.
 *  Returns { ok: true, app } or the error Response; routes do:
 *    const res = await applyTransition(app, "SUBMITTED");
 *    if (res instanceof Response) return res;
 */
export async function applyTransition(
  app: Pick<Application, "id" | "status">,
  next: AppStatus,
  tx: Prisma.TransactionClient = db as Prisma.TransactionClient
): Promise<{ ok: true; app: Application } | Response> {
  if (!TRANSITIONS[app.status].includes(next)) {
    return jsonErr("INVALID_STATE_TRANSITION", "Illegal state transition", {
      from: app.status,
      to: next,
    });
  }
  const updated = await tx.application.update({
    where: { id: app.id },
    data: { status: next },
  });
  return { ok: true, app: updated };
}
