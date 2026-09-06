// Certificate issuance service (S2 — Smarpit). Consumes InspectionPassEvent
// through the frozen lib/hooks.ts interface. Never throws upward: an
// inspection PASS must not fail because issuance failed.
// NOTE (updated SMV1): the Application status flip PASSED -> CERT_ISSUED now
// happens in workers/index.ts AFTER this service returns a non-null certificate
// (consumer side, Smarpit). If issuance fails here (null return) the application
// stays PASSED — the cert.issue_failed audit row below is the failure signal.
// NOTE (audit fixes #3, #4, #67): certId now comes from an atomic CertCounter
// row (no more findFirst+increment race), and every write runs through an
// optional Prisma transaction client so issuance can join the caller's
// transaction (inspection PASS workflow).
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { signCredential } from "./jws";
import { buildQrPayload } from "./qr";
import { publicKeyJwk } from "./keys";
import { VALIDITY_DAYS } from "../../packages/shared/constants";
import { notificationEnabled } from "../notify/notifications";
import type { InspectionPassEvent } from "../hooks";

type Tx = Prisma.TransactionClient;

const CERT_PREFIX = "PRM-CERT-2026-";
const CERT_SEQ_LEN = 5;

/** Atomic, self-initializing sequence (audit finding #3). The guarded INSERT
 *  seeds the counter past any pre-existing certificate (so legacy rows and
 *  seeds can never collide), and the UPDATE ... RETURNING increments exactly
 *  once per row lock — concurrent issuances can never observe the same number. */
async function nextCertId(tx: Tx): Promise<string> {
  // NOTE: ${CERT_SEQ_LEN} binds as a parameter, so it must be cast to int —
  // Postgres has no right(text, bigint), and the missing cast surfaced as
  // error 42883 on every PASS workflow.
  await tx.$executeRaw`
    INSERT INTO "CertCounter" ("id", "lastNumber") VALUES ('cert',
      COALESCE((SELECT MAX(CAST(RIGHT("certId", ${CERT_SEQ_LEN}::int) AS INTEGER)) FROM "Certificate"
        WHERE "certId" ~ '^PRM-CERT-[0-9]{4}-[0-9]{5}$'), 0))
    ON CONFLICT ("id") DO NOTHING`;
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    UPDATE "CertCounter" SET "lastNumber" = "lastNumber" + 1
    WHERE "id" = 'cert' RETURNING "lastNumber"`;
  return CERT_PREFIX + String(rows[0].lastNumber).padStart(CERT_SEQ_LEN, "0");
}

export type IssueResult = Awaited<ReturnType<typeof buildCertificate>> | null;

async function buildCertificate(event: InspectionPassEvent, tx: Tx) {
  const application = await tx.application.findUnique({
    where: { id: event.applicationId },
    include: {
      instrument: { include: { owner: { select: { id: true, name: true } } } },
      inspection: { select: { id: true, result: true } },
    },
  });
  if (!application) throw new Error(`application ${event.applicationId} not found`);
  const instrument = application.instrument;

  // IDEMPOTENT: an existing certificate for this application is returned unchanged.
  // (Certificate.applicationId is UNIQUE — the DB constraint is the backstop.)
  const existing = await tx.certificate.findUnique({
    where: { applicationId: application.id },
  });
  if (existing) return existing;

  const inspector = await tx.user.findUnique({
    where: { id: event.inspectorId },
    select: { id: true, name: true, role: true },
  });
  if (!inspector) throw new Error(`inspector ${event.inspectorId} not found`);

  const validFrom = new Date();
  const days = VALIDITY_DAYS[instrument.category] ?? 365;
  const validUntil = new Date(validFrom.getTime() + days * 86400000);

  const certId = await nextCertId(tx);
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

  const cert = await tx.certificate.create({
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

  await tx.auditLog.create({
    data: {
      actorId: inspector.id,
      actorKind: inspector.role,
      action: "cert.issued",
      entity: "certificate",
      entityId: cert.id,
      meta: { certId, applicationId: application.id, instrumentSerial: instrument.serialNumber },
    },
  });

  // direct Prisma write — deliberately NOT lib/notify (avoid cross-path
  // coupling) but still gated on the owner's notification preference (#40).
  if (await notificationEnabled(tx, instrument.ownerId, "CERT_ISSUED")) {
    await tx.notification.create({
      data: {
        userId: instrument.ownerId,
        kind: "CERT_ISSUED",
        title: "Certificate issued",
        body: `Certificate ${certId} for instrument ${instrument.serialNumber} (${instrument.category}) is valid until ${validUntil.toISOString().slice(0, 10)}.`,
      },
    });
  }

  return cert;
}

/**
 * Issues the certificate for a PASS event. Pass `tx` to run inside the
 * caller's transaction (audit finding #4) — in that case a failure throws so
 * the caller's rollback also undoes the inspection writes, and the failure
 * audit is written OUTSIDE the doomed transaction via the global client.
 */
export async function issueCertificate(event: InspectionPassEvent, tx?: Tx) {
  const client = tx ?? (db as Prisma.TransactionClient);
  try {
    return await buildCertificate(event, client);
  } catch (e) {
    console.error("[cert] issuance failed:", e);
    try {
      // failure evidence must survive even a rolled-back caller transaction
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
    if (tx) throw e; // inside a caller transaction: let the caller roll back
    return null;
  }
}

// re-export so S4's well-known route + demo pages have one import site
export { publicKeyJwk };
