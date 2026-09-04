import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";

// book MA2 item 7 — POST /applications/[id]/pay
// AUDIT FINDING #13 (hardened): payment mode is explicit.
//   PAYMENT_MODE=demo  (default): mock payment. Idempotent (DRAFT only; a paid
//     application returns the existing receipt instead of re-marking), audited
//     with meta.mockPayment=true, and every response carries demo:true so no
//     consumer can mistake it for a real gateway charge. The client can never
//     spoof server state — feePaidAt is set by THIS route alone.
//   anything else      : refused. Marking an application paid without a
//     verified gateway intent would be a free-payment bypass in production, so
//     until a real payment-intent/webhook adapter is integrated (out of the
//     sprint scope) the route answers INTERNAL instead of recording payment.
//     lib/security/env.ts additionally refuses a production boot that is not
//     running with PAYMENT_MODE=demo + ALLOW_DEMO_PAYMENT=true.
const isDemoPayment = () => (process.env.PAYMENT_MODE ?? "demo") === "demo";
// The future live path will validate a gateway { paymentId } here before
// marking payment; until a gateway adapter exists the route refuses instead.

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  const guard = requireRole(session, "TRADER");
  if (guard) return guard;

  const application = await db.application.findUnique({ where: { id: params.id } });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");
  if (application.traderId !== session!.userId) {
    return jsonErr("AUTH_FORBIDDEN", "Not your application");
  }
  if (application.status !== "DRAFT") {
    return jsonErr("INVALID_STATE_TRANSITION", "Payment only applies to DRAFT applications", {
      from: application.status,
      to: "DRAFT",
    });
  }
  // idempotent: already paid -> return the existing receipt
  if (application.feePaidAt) {
    return jsonOk({
      receiptId: "RCP-" + application.id.slice(-6),
      feePaidAt: application.feePaidAt.toISOString(),
      ...(isDemoPayment() ? { demo: true } : {}),
    });
  }

  if (!isDemoPayment()) {
    // Non-demo deployments must not record payment without a gateway — see the
    // header comment. This is a hard stop, not a fallthrough.
    return jsonErr(
      "INTERNAL",
      "PAYMENT_MODE is not 'demo' but no payment gateway is integrated — payment cannot be recorded. Set PAYMENT_MODE=demo for local demos only."
    );
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
    meta: { receiptId, feeAmount: application.feeAmount, mockPayment: true, paymentMode: "demo" },
  });
  return jsonOk({ receiptId, feePaidAt: feePaidAt.toISOString(), demo: true });
}
