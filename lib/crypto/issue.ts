// Certificate issuance service (S2 — Smarpit). Consumes InspectionPassEvent
// through the frozen lib/hooks.ts interface. Never throws upward: an
// inspection PASS must not fail because issuance failed.
// NOTE: Application status is Manav's state machine — this service flips ONLY
// Certificate rows (book item: PASSED -> CERT_ISSUED app flip stays with MA-suite).
import { db } from "../db";
import { signCredential } from "./jws";
import { buildQrPayload } from "./qr";
import { publicKeyJwk } from "./keys";
import { VALIDITY_DAYS } from "../../packages/shared/constants";
import type { InspectionPassEvent } from "../hooks";

const CERT_PREFIX = "PRM-CERT-2026-";

async function nextCertId(): Promise<string> {
  const last = await db.certificate.findFirst({
    orderBy: { certId: "desc" },
    select: { certId: true },
  });
  const lastSeq = last ? parseInt(last.certId.slice(CERT_PREFIX.length), 10) : 0;
  return CERT_PREFIX + String(lastSeq + 1).padStart(5, "0");
}

export type IssueResult = Awaited<ReturnType<typeof buildCertificate>> | null;

async function buildCertificate(event: InspectionPassEvent) {
  const application = await db.application.findUnique({
    where: { id: event.applicationId },
    include: {
      instrument: { include: { owner: { select: { id: true, name: true } } } },
      inspection: { select: { id: true, result: true } },
    },
  });
  if (!application) throw new Error(`application ${event.applicationId} not found`);
  const instrument = application.instrument;

  // IDEMPOTENT: an existing certificate for this application is returned unchanged.
  const existing = await db.certificate.findUnique({
    where: { applicationId: application.id },
  });
  if (existing) return existing;

  const inspector = await db.user.findUnique({
    where: { id: event.inspectorId },
    select: { id: true, name: true, role: true },
  });
  if (!inspector) throw new Error(`inspector ${event.inspectorId} not found`);

  const validFrom = new Date();
  const days = VALIDITY_DAYS[instrument.category] ?? 365;
  const validUntil = new Date(validFrom.getTime() + days * 86400000);

  const certId = await nextCertId();
  const claims = {
    sub: certId,
    applicationId: application.id,
    type: application.type,
    instrumentSerial: instrument.serialNumber,
    instrumentCategory: instrument.category,
    ownerName: instrument.owner.name,
    issuedBy: inspector.name,
    issuedByKind: event.inspectorKind,
    district: instrument.district,
    validFrom: validFrom.toISOString(),
    validUntil: validUntil.toISOString(),
  };

  const payloadJws = await signCredential(claims);
  const qrPayload = buildQrPayload(payloadJws);

  const cert = await db.certificate.create({
    data: {
      certId,
      applicationId: application.id,
      instrumentId: instrument.id,
      issuedById: inspector.id,
      issuedByKind: event.inspectorKind,
      payloadJws,
      qrPayload,
      status: "ACTIVE",
      validFrom,
      validUntil,
    },
  });

  await db.auditLog.create({
    data: {
      actorId: inspector.id,
      actorKind: inspector.role,
      action: "cert.issued",
      entity: "certificate",
      entityId: cert.id,
      meta: { certId, applicationId: application.id, instrumentSerial: instrument.serialNumber },
    },
  });

  // direct Prisma write — deliberately NOT lib/notify (avoid cross-path coupling)
  await db.notification.create({
    data: {
      userId: instrument.ownerId,
      kind: "CERT_ISSUED",
      title: "Certificate issued",
      body: `Certificate ${certId} for instrument ${instrument.serialNumber} (${instrument.category}) is valid until ${validUntil.toISOString().slice(0, 10)}.`,
    },
  });

  return cert;
}

export async function issueCertificate(event: InspectionPassEvent) {
  try {
    return await buildCertificate(event);
  } catch (e) {
    console.error("[cert] issuance failed:", e);
    try {
      await db.auditLog.create({
        data: {
          actorId: event.inspectorId ?? null,
          actorKind: "system",
          action: "cert.issue_failed",
          entity: "application",
          entityId: event.applicationId,
          meta: { reason: e instanceof Error ? e.message : String(e) },
        },
      });
    } catch (auditErr) {
      console.error("[cert] issue_failed audit write also failed:", auditErr);
    }
    return null;
  }
}

// re-export so S4's well-known route + demo pages have one import site
export { publicKeyJwk };
