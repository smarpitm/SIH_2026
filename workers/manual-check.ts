// workers/manual-check.ts
// Verification script for S6 expiry scanner and validity tracking.
// Covers all 4 user requirements:
//  1. Seed validUntil = now - 1 day -> scan -> EXPIRED, /verify badge red without redeploying
//  2. Seed validUntil = now + 20d -> scan -> EXPIRING_SOON + 1 REMINDER_T30 row
//  3. Run scan twice back-to-back -> zero duplicate audit rows, zero duplicate reminders (visible in row diff)
//  4. NEGATIVE: future-dated boundary cert unaffected (prints daysTo); forced SQL flip ACTIVE->EXPIRED
//     on T-20 cert is corrected to EXPIRING_SOON only by scanner logic, never silently by reads.
import fs from "node:fs";

(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { db } from "@/lib/db";
import { signAccessToken } from "@/lib/auth/jwt";
import { signCredential } from "@/lib/crypto/jws";
import { buildQrPayload } from "@/lib/crypto/qr";
import { runExpirySweep } from "@/workers/expiry-scan";
import { POST as postScanRoute } from "@/app/api/v1/certificates/expiry/scan/route";
import { GET as getPublicCertRoute } from "@/app/api/v1/public/certificates/[certId]/route";

const DAY_MS = 86_400_000;
const TAG = "s6chk" + Date.now().toString(36);

interface CheckResult {
  gate: string;
  ok: boolean;
  details?: unknown;
}

const results: CheckResult[] = [];
function record(gate: string, ok: boolean, details?: unknown) {
  results.push({ gate, ok, details });
  const mark = ok ? "✓ PASS" : "✗ FAIL";
  console.log(`${mark}: ${gate}`);
  if (details !== undefined) {
    console.log("   ", typeof details === "object" ? JSON.stringify(details, null, 2) : details);
  }
}

async function cleanPriorFixtures() {
  // Purge prior test fixtures
  await db.notification.deleteMany({
    where: { title: { contains: "PRM-TEST-S6-" } },
  });
  await db.auditLog.deleteMany({
    where: { entityId: { contains: "PRM-TEST-S6-" } },
  });
  await db.certificate.deleteMany({
    where: { certId: { startsWith: "PRM-TEST-S6-" } },
  });
  await db.application.deleteMany({
    where: { id: { startsWith: "app-" + TAG } },
  });
  await db.instrument.deleteMany({
    where: { serialNumber: { startsWith: "SR-" + TAG } },
  });
}

async function createSeedCert(params: {
  certId: string;
  validUntil: Date;
  status: "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";
  trader: { id: string; name: string };
  // district is string|null on the User row (schema has no NOT NULL) — callers
  // pass the row straight from db.user.findFirst; coalesced below.
  inspector: { id: string; name: string; role: string; district: string | null };
  category?: string;
}) {
  const serialNumber = `SR-${TAG}-${params.certId.slice(-5)}`;
  const instrument = await db.instrument.create({
    data: {
      ownerId: params.trader.id,
      category: params.category ?? "COUNTER_SCALE",
      make: "Essae",
      model: "DS-852",
      serialNumber,
      capacity: "50kg",
      district: params.inspector.district ?? "Guntur",
      address: "Industrial Area, Phase 1",
    },
  });

  const application = await db.application.create({
    data: {
      id: `app-${TAG}-${params.certId.slice(-5)}`,
      instrumentId: instrument.id,
      traderId: params.trader.id,
      type: "NEW",
      status: "PASSED",
      feePaidAt: new Date(),
      declarationAccepted: true,
    },
  });

  const validFrom = new Date(params.validUntil.getTime() - 365 * DAY_MS);
  const claims = {
    sub: params.certId,
    applicationId: application.id,
    type: application.type,
    instrumentSerial: instrument.serialNumber,
    instrumentCategory: instrument.category,
    ownerName: params.trader.name,
    issuedBy: params.inspector.name,
    issuedByKind: params.inspector.role,
    district: params.inspector.district ?? "Guntur",
    validFrom: validFrom.toISOString(),
    validUntil: params.validUntil.toISOString(),
  };

  const payloadJws = await signCredential(claims);
  const qrPayload = buildQrPayload(payloadJws);

  const cert = await db.certificate.create({
    data: {
      certId: params.certId,
      applicationId: application.id,
      instrumentId: instrument.id,
      issuedById: params.inspector.id,
      issuedByKind: params.inspector.role,
      payloadJws,
      qrPayload,
      status: params.status,
      validFrom,
      validUntil: params.validUntil,
    },
  });

  return { cert, instrument, application };
}

async function main() {
  console.log("================================================================");
  console.log("PRAMANAM S6 EXPIRY SCANNER & MANUAL-CHECK SUITE");
  console.log("================================================================");

  await cleanPriorFixtures();

  // Find admin, trader, inspector
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  const trader = await db.user.findFirst({ where: { role: "TRADER" } });
  const inspector = await db.user.findFirst({ where: { role: "LMO" } });

  if (!admin || !trader || !inspector) {
    throw new Error("Missing required seed users (admin, trader, inspector)");
  }

  const adminToken = await signAccessToken({
    id: admin.id,
    role: "ADMIN",
    district: admin.district ?? "Guntur",
  });

  // -------------------------------------------------------------------------
  // GATE 1: validUntil = now - 1 day -> manual scan -> EXPIRED + /verify badge red
  // -------------------------------------------------------------------------
  console.log("\n[GATE 1] Past-due certificate (validUntil = now - 1d)...");
  const now = new Date();
  const pastValidUntil = new Date(now.getTime() - 1 * DAY_MS);
  const certId1 = "PRM-TEST-S6-00001";

  const { cert: cert1 } = await createSeedCert({
    certId: certId1,
    validUntil: pastValidUntil,
    status: "ACTIVE",
    trader,
    inspector,
  });

  record("G1.1 Seeded cert with status ACTIVE and validUntil = now - 1d", cert1.status === "ACTIVE", {
    certId: cert1.certId,
    status: cert1.status,
    validUntil: cert1.validUntil.toISOString(),
  });

  // Trigger manual scan via the real POST /api/v1/certificates/expiry/scan route
  const scanReq = new Request("http://localhost:3000/api/v1/certificates/expiry/scan", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const scanRes = await postScanRoute(scanReq);
  const scanJson = await scanRes.json();

  record("G1.2 Manual scan route (POST /certificates/expiry/scan) returned 200 OK", scanRes.status === 200 && scanJson.ok === true, scanJson);

  // Check DB status
  const refreshedCert1 = await db.certificate.findUnique({ where: { certId: certId1 } });
  record("G1.3 Certificate status flipped to EXPIRED in database", refreshedCert1?.status === "EXPIRED", {
    certId: certId1,
    status: refreshedCert1?.status,
  });

  // Verify public badge endpoint returns verdict EXPIRED and signatureValid true
  const badgeReq = new Request(`http://localhost:3000/api/v1/public/certificates/${certId1}`);
  const badgeRes = await getPublicCertRoute(badgeReq, { params: { certId: certId1 } });
  const badgeJson = await badgeRes.json();

  record("G1.4 Public verify endpoint returns verdict: EXPIRED and signatureValid: true", badgeJson.ok && badgeJson.data.verdict === "EXPIRED" && badgeJson.data.signatureValid === true, {
    verdict: badgeJson.data?.verdict,
    signatureValid: badgeJson.data?.signatureValid,
    anchors: badgeJson.data?.anchors,
  });

  // Check AuditLog entry
  const audit1 = await db.auditLog.findFirst({
    where: { entity: "certificate", entityId: certId1, action: "certificate.expiry_flip" },
  });
  const meta1 = audit1?.meta as { to?: string } | null;
  record("G1.5 System audit log recorded expiry_flip with actorKind system:bullmq", audit1?.actorKind === "system:bullmq" && meta1?.to === "EXPIRED", audit1?.meta);

  // -------------------------------------------------------------------------
  // GATE 2: validUntil = now + 20d -> scan -> EXPIRING_SOON + 1 REMINDER_T30 row
  // -------------------------------------------------------------------------
  console.log("\n[GATE 2] Expiring-soon certificate (validUntil = now + 20d)...");
  const t20ValidUntil = new Date(now.getTime() + 20 * DAY_MS);
  const certId2 = "PRM-TEST-S6-00002";

  await createSeedCert({
    certId: certId2,
    validUntil: t20ValidUntil,
    status: "ACTIVE",
    trader,
    inspector,
  });

  // Run scan
  const sweep2 = await runExpirySweep();
  record("G2.1 Scanner processed T-20 cert", sweep2.flipped >= 1 && sweep2.reminders >= 1, sweep2);

  const refreshedCert2 = await db.certificate.findUnique({ where: { certId: certId2 } });
  record("G2.2 Certificate status flipped to EXPIRING_SOON in database", refreshedCert2?.status === "EXPIRING_SOON", {
    certId: certId2,
    status: refreshedCert2?.status,
  });

  // Exactly one REMINDER_T30 row
  const reminders2 = await db.notification.findMany({
    where: {
      userId: trader.id,
      kind: "REMINDER_T30",
      title: { contains: certId2 },
    },
  });
  record("G2.3 Exactly ONE REMINDER_T30 notification row inserted for owner", reminders2.length === 1, {
    count: reminders2.length,
    notification: reminders2[0],
  });

  // -------------------------------------------------------------------------
  // GATE 3: Run scan twice back-to-back -> zero duplicate audit rows, zero duplicate reminders
  // -------------------------------------------------------------------------
  console.log("\n[GATE 3] Idempotency: Run scan twice back-to-back (row diff verification)...");
  const auditBefore = await db.auditLog.count({
    where: { entityId: certId2, action: "certificate.expiry_flip" },
  });
  const notifBefore = await db.notification.count({
    where: { userId: trader.id, kind: "REMINDER_T30", title: { contains: certId2 } },
  });

  console.log(`Initial counts for ${certId2}: AuditLog = ${auditBefore}, Notification = ${notifBefore}`);

  // Back-to-back sweep #1
  const sweepB2B1 = await runExpirySweep();
  console.log("Back-to-back sweep #1 result:", sweepB2B1);

  // Back-to-back sweep #2
  const sweepB2B2 = await runExpirySweep();
  console.log("Back-to-back sweep #2 result:", sweepB2B2);

  const auditAfter = await db.auditLog.count({
    where: { entityId: certId2, action: "certificate.expiry_flip" },
  });
  const notifAfter = await db.notification.count({
    where: { userId: trader.id, kind: "REMINDER_T30", title: { contains: certId2 } },
  });

  const auditDiff = auditAfter - auditBefore;
  const notifDiff = notifAfter - notifBefore;

  record("G3.1 Back-to-back sweep reports zero flips and zero reminders", sweepB2B1.flipped === 0 && sweepB2B1.reminders === 0 && sweepB2B2.flipped === 0 && sweepB2B2.reminders === 0, {
    sweep1: sweepB2B1,
    sweep2: sweepB2B2,
  });

  record("G3.2 Row diff: Exactly ZERO duplicate audit rows (diff = 0)", auditDiff === 0, {
    auditBefore,
    auditAfter,
    auditDiff,
  });

  record("G3.3 Row diff: Exactly ZERO duplicate reminders (diff = 0)", notifDiff === 0, {
    notifBefore,
    notifAfter,
    notifDiff,
  });

  // -------------------------------------------------------------------------
  // GATE 4: NEGATIVE checks
  // 4A: future-dated cert unaffected (TZ boundary check — print daysTo)
  // 4B: forced SQL flip attempt of ACTIVE->EXPIRED on T-20 cert is corrected to
  //     EXPIRING_SOON only by scanner logic, never silently by reads.
  // -------------------------------------------------------------------------
  console.log("\n[GATE 4] Negative checks: TZ boundary + forced SQL flip correction...");

  // 4A: Future-dated boundary cert (e.g. 30 days + 2 hours ahead)
  const boundaryValidUntil = new Date(now.getTime() + 30 * DAY_MS + 2 * 3600_000);
  const boundaryDaysTo = Math.ceil((boundaryValidUntil.getTime() - now.getTime()) / DAY_MS);
  const certId3 = "PRM-TEST-S6-00003";

  await createSeedCert({
    certId: certId3,
    validUntil: boundaryValidUntil,
    status: "ACTIVE",
    trader,
    inspector,
  });

  console.log(`Boundary cert ${certId3}: validUntil=${boundaryValidUntil.toISOString()}, calculated daysTo=${boundaryDaysTo}`);

  await runExpirySweep();
  const refreshedCert3 = await db.certificate.findUnique({ where: { certId: certId3 } });

  record("G4.1 Future-dated boundary cert unaffected (remains ACTIVE, daysTo > 30)", refreshedCert3?.status === "ACTIVE" && boundaryDaysTo > 30, {
    certId: certId3,
    status: refreshedCert3?.status,
    daysTo: boundaryDaysTo,
  });

  // 4B: Forced SQL flip of ACTIVE->EXPIRED on a T-20 cert
  const certId4 = "PRM-TEST-S6-00004";
  const { cert: cert4 } = await createSeedCert({
    certId: certId4,
    validUntil: t20ValidUntil,
    status: "ACTIVE",
    trader,
    inspector,
  });

  // Force SQL flip attempt: directly set status = 'EXPIRED' in DB
  await db.certificate.update({
    where: { id: cert4.id },
    data: { status: "EXPIRED" },
  });

  const forcedCert = await db.certificate.findUnique({ where: { certId: certId4 } });
  record("G4.2 Forced SQL flip simulated: status manually set to EXPIRED in database", forcedCert?.status === "EXPIRED", {
    certId: certId4,
    status: forcedCert?.status,
  });

  // READ ATTEMPT: GET /api/v1/public/certificates/[certId]
  const readReq = new Request(`http://localhost:3000/api/v1/public/certificates/${certId4}`);
  await getPublicCertRoute(readReq, { params: { certId: certId4 } });

  // Verify that the read did NOT mutate the database row silently!
  const postReadCert = await db.certificate.findUnique({ where: { certId: certId4 } });
  record("G4.3 DB status NOT silently healed by read query (remains EXPIRED)", postReadCert?.status === "EXPIRED", {
    certId: certId4,
    status: postReadCert?.status,
  });

  // SCANNER RUN: The scanner runs its own logic
  const sweepCorrection = await runExpirySweep();
  console.log("Scanner correction sweep result:", sweepCorrection);

  const correctedCert = await db.certificate.findUnique({ where: { certId: certId4 } });
  record("G4.4 Scanner's own logic corrects premature EXPIRED to EXPIRING_SOON", correctedCert?.status === "EXPIRING_SOON", {
    certId: certId4,
    status: correctedCert?.status,
  });

  const correctionAudit = await db.auditLog.findFirst({
    where: { entityId: certId4, action: "certificate.expiry_flip" },
    orderBy: { createdAt: "desc" },
  });
  const correctionMeta = correctionAudit?.meta as { from?: string; to?: string } | null;
  record("G4.5 Audit log captured correction from EXPIRED to EXPIRING_SOON", correctionMeta?.from === "EXPIRED" && correctionMeta?.to === "EXPIRING_SOON", correctionAudit?.meta);

  // Summary
  console.log("\n================================================================");
  const allPass = results.every((r) => r.ok);
  console.log(`TOTAL GATES: ${results.length} | PASSED: ${results.filter((r) => r.ok).length} | FAILED: ${results.filter((r) => !r.ok).length}`);
  console.log(allPass ? "ALL GATES PASS (exit 0)" : "SOME GATES FAILED (exit 1)");
  console.log("================================================================");

  if (!allPass) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
