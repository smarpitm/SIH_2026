import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { assertJurisdiction } from "@/lib/auth/rbac";
import { issueCertificate } from "@/lib/crypto/issue";
import { applyTransition } from "@/lib/auth/transition";
import { audit } from "@/lib/auth/audit";

const bodySchema = z.object({
  applicationId: z.string().min(1),
});

// POST /api/v1/certificates/issue - ADMIN or the assigned officer.
// Idempotent demo/reissue entry point: same pipeline as the PASS hook.
export async function POST(req: Request) {
  const session = await getSession(req);
  const guard = requireRole(session, "ADMIN", "LMO", "GATC");
  if (guard) return guard;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonErr("VALIDATION_ERROR", "applicationId required");

  const application = await db.application.findUnique({
    where: { id: parsed.data.applicationId },
    include: {
      instrument: { select: { id: true, district: true } },
      inspection: { select: { id: true, inspectorId: true, result: true } },
      schedules: { select: { assigneeId: true, assigneeKind: true }, take: 1 },
    },
  });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");

  // AUTHORIZATION FIRST (audit findings #1/#28): nothing about this
  // application — least of all an existing certificate's payloadJws/qrPayload —
  // may leave the endpoint before the caller is proven to be ADMIN or the
  // assigned officer in jurisdiction. The idempotent "return existing cert"
  // branch below therefore only runs AFTER this check.
  const jurisdiction = assertJurisdiction(session!, application.instrument.district);
  if (jurisdiction) return jurisdiction;
  const authorized =
    session!.role === "ADMIN" || application.schedules[0]?.assigneeId === session!.userId;
  if (!authorized) {
    return jsonErr("AUTH_FORBIDDEN", "Not the assigned officer for this application");
  }

  // idempotent: already issued -> return the existing certificate unchanged
  const existing = await db.certificate.findUnique({
    where: { applicationId: application.id },
  });
  if (existing) {
    return jsonOk({
      id: existing.id,
      certId: existing.certId,
      status: existing.status,
      validFrom: existing.validFrom.toISOString(),
      validUntil: existing.validUntil.toISOString(),
      payloadJws: existing.payloadJws,
      qrPayload: existing.qrPayload,
    });
  }

  if (application.status !== "PASSED" || !application.inspection) {
    return jsonErr("INVALID_STATE_TRANSITION", "Application has not PASSED inspection", {
      from: application.status,
      to: "CERT_ISSUED",
    });
  }

  const cert = await issueCertificate({
    applicationId: application.id,
    instrumentId: application.instrumentId,
    reportId: application.inspection.id,
    inspectorId: application.inspection.inspectorId,
    inspectorKind: (application.schedules[0]?.assigneeKind as "LMO" | "GATC") ?? "LMO",
  });
  if (!cert) return jsonErr("INTERNAL", "Certificate issuance failed");

  // AUDIT FINDING #107: issuance alone left the application stuck in PASSED —
  // advance the state machine to CERT_ISSUED and write the audit row, exactly
  // like the worker repair sweep does. (Re-running for an already-issued app
  // returns the idempotent existing-cert branch above, so this is safe.)
  const transition = await applyTransition(
    { id: application.id, status: application.status },
    "CERT_ISSUED"
  );
  if (transition instanceof Response) return transition;
  await audit({
    actorId: session!.userId,
    actorKind: session!.role,
    action: "app.cert_issued",
    entity: "application",
    entityId: application.id,
    meta: { certId: cert.certId },
  });

  return jsonOk({
    id: cert.id,
    certId: cert.certId,
    status: cert.status,
    validFrom: cert.validFrom.toISOString(),
    validUntil: cert.validUntil.toISOString(),
    payloadJws: cert.payloadJws,
    qrPayload: cert.qrPayload,
  });
}


