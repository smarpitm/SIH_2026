// POST /api/v1/certificates/[id]/revoke
// Smarpit (M7). Admin OR the cert's issuing officer only.
// Zod: { reason: string, min 20 chars }.
// Transitions the cert status -> REVOKED (+ revokedAt + revokedReason), writes an
// AuditLog row (cert.revoked) and a REVOKED Notification to the instrument owner.
// Already revoked -> 409 CONFLICT { details: { currentReason } }.
import { z } from "zod";
import { jsonOk, jsonErr } from "@/packages/shared/api";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/session";
import { notificationEnabled } from "@/lib/notify/notifications";

const Body = z.object({ reason: z.string().min(20, "Reason must be at least 20 characters") });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  // AUDIT FINDING #68: explicit role gate up front (was a bare requireRole()
  // with a custom check later — same outcome, unclear intent).
  const guard = requireRole(session, "ADMIN", "LMO", "GATC");
  if (guard) return guard;

  const cert = await db.certificate.findFirst({
    where: { OR: [{ certId: params.id }, { id: params.id }] },
    select: {
      id: true,
      certId: true,
      status: true,
      revokedReason: true,
      issuedById: true,
      instrument: { select: { ownerId: true } },
    },
  });
  if (!cert) return jsonErr("NOT_FOUND", `No certificate matching '${params.id}'`);

  const isIssuer = session!.userId === cert.issuedById;
  const isAdmin = session!.role === "ADMIN";
  if (!isIssuer && !isAdmin) {
    return jsonErr("AUTH_FORBIDDEN", "Only the issuing officer or an admin may revoke this certificate");
  }

  if (cert.status === "REVOKED") {
    return jsonErr("CONFLICT", "Certificate already revoked", { currentReason: cert.revokedReason });
  }

  let reason: string;
  try {
    reason = Body.parse(await req.json()).reason;
  } catch (e) {
    return jsonErr("VALIDATION_ERROR", "Invalid body", { issues: (e as z.ZodError).issues });
  }

  const revokedAt = new Date();
  // AUDIT FINDING #19: status update + audit + owner notification commit in ONE
  // transaction — a revoked certificate can never lack its audit evidence or
  // owner notice, and a failed notification cannot strand the revocation.
  await db.$transaction(async (tx) => {
    await tx.certificate.update({
      where: { id: cert.id },
      data: { status: "REVOKED", revokedAt, revokedReason: reason },
    });
    await tx.auditLog.create({
      data: {
        actorId: session!.userId,
        actorKind: session!.role,
        action: "cert.revoked",
        entity: "certificate",
        entityId: cert.id,
        meta: { certId: cert.certId, reason },
      },
    });
    // owner notification — skipped only when the owner disabled revocations (#40)
    if (await notificationEnabled(tx, cert.instrument.ownerId, "REVOKED")) {
      await tx.notification.create({
        data: {
          userId: cert.instrument.ownerId,
          kind: "REVOKED",
          title: "Certificate revoked",
          body: reason,
        },
      });
    }
  });

  return jsonOk({ revoked: true, certId: cert.certId, status: "REVOKED", revokedAt: revokedAt.toISOString() });
}