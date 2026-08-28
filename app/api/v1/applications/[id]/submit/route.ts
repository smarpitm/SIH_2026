import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { applyTransition } from "@/lib/auth/transition";
import { audit } from "@/lib/auth/audit";

const bodySchema = z.object({
  declarationAccepted: z.boolean(),
});

// book MA2 item 8 — POST /applications/[id]/submit
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;

  const application = await db.application.findUnique({ where: { id: params.id } });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");
  if (application.traderId !== session!.userId) {
    return jsonErr("AUTH_FORBIDDEN", "Not your application");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !application.feePaidAt || parsed.data.declarationAccepted !== true) {
    return jsonErr("VALIDATION_ERROR", "declaration and payment required");
  }

  // DRAFT -> SUBMITTED; second submit hits applyTransition(SUBMITTED -> SUBMITTED)
  // → INVALID_STATE_TRANSITION { details: { from, to } } EXACT shape. (book MA2 item 8)
  const res = await applyTransition(application, "SUBMITTED");
  if (res instanceof Response) return res;

  await db.application.update({
    where: { id: application.id },
    data: { declarationAccepted: true },
  });

  // TODO AUTO-ALLOCATE-MA3 (auto-allocation lives in MA3, not here)
  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "application.submit",
    entity: "application",
    entityId: application.id,
    meta: { from: application.status, to: "SUBMITTED" },
  });
  return jsonOk({ status: "SUBMITTED" });
}
