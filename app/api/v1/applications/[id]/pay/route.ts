import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";

// book MA2 item 7 — POST /applications/[id]/pay
// // ponytail: mock payment — real gateway is out of scope for the sprint.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;

  const application = await db.application.findUnique({ where: { id: params.id } });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");
  if (application.traderId !== session!.userId) {
    return jsonErr("AUTH_FORBIDDEN", "Not your application");
  }

  const feePaidAt = new Date();
  await db.application.update({
    where: { id: application.id },
    data: { feePaidAt },
  });
  const receiptId = "RCP-" + application.id.slice(-6);
  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "application.pay",
    entity: "application",
    entityId: application.id,
    meta: { receiptId, feeAmount: application.feeAmount },
  });
  return jsonOk({ receiptId, feePaidAt: feePaidAt.toISOString() });
}
