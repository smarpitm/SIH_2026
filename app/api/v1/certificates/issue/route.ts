import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { issueCertificate } from "@/lib/crypto/issue";

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
      inspection: { select: { id: true, inspectorId: true, result: true } },
      schedules: { select: { assigneeId: true, assigneeKind: true }, take: 1 },
    },
  });
  if (!application) return jsonErr("NOT_FOUND", "Application not found");

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

  const assignedOfficer =
    session!.role === "ADMIN" || application.schedules[0]?.assigneeId === session!.userId;
  if (!assignedOfficer) {
    return jsonErr("AUTH_FORBIDDEN", "Not the assigned officer for this application");
  }

  const cert = await issueCertificate({
    applicationId: application.id,
    instrumentId: application.instrumentId,
    reportId: application.inspection.id,
    inspectorId: application.inspection.inspectorId,
    inspectorKind: (application.schedules[0]?.assigneeKind as "LMO" | "GATC") ?? "LMO",
  });
  if (!cert) return jsonErr("INTERNAL", "Certificate issuance failed");

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


