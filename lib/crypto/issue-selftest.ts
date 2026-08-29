// Run: npx tsx lib/crypto/issue-selftest.ts
// Self-contained: builds its own mock trader/officer/instrument/application in
// the DB, calls issueCertificate (twice for idempotency), verifies the JWS with
// WebCrypto, and round-trips the QR payload. Prints PASS/FAIL, exits 1 on fail.
import fs from "node:fs";

(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { db } from "../db";
import { issueCertificate } from "./issue";
import { verifyCredential } from "./jws";
import { publicKeyJwk } from "./keys";
import { parseQrPayload } from "./qr";
import { hashPassword } from "../hash";

const TAG = "selftest" + Date.now().toString(36);

async function main() {
  const results: { name: string; ok: boolean }[] = [];
  const record = (name: string, ok: boolean) => results.push({ name, ok });

  // -- fixture -------------------------------------------------------------
  const hash = await hashPassword("Passw0rd!selftest");
  const trader = await db.user.create({
    data: { name: "Selftest Trader " + TAG, email: `st.trader.${TAG}@demo.in`, passwordHash: hash, role: "TRADER", district: "Guntur" },
  });
  const officer = await db.user.create({
    data: { name: "Selftest Officer " + TAG, email: `st.officer.${TAG}@demo.in`, passwordHash: hash, role: "LMO", district: "Guntur" },
  });
  const instrument = await db.instrument.create({
    data: {
      ownerId: trader.id,
      category: "COUNTER_SCALE",
      make: "Cas",
      model: "ST",
      serialNumber: "ST-" + TAG,
      capacity: "100kg",
      district: "Guntur",
      address: "Selftest Lane",
    },
  });
  const application = await db.application.create({
    data: { instrumentId: instrument.id, traderId: trader.id, type: "NEW", status: "PASSED", feePaidAt: new Date(), declarationAccepted: true },
  });

  // -- run -----------------------------------------------------------------
  const event = {
    applicationId: application.id,
    instrumentId: instrument.id,
    reportId: "report-" + TAG,
    inspectorId: officer.id,
    inspectorKind: "LMO" as const,
  };

  const cert1 = await issueCertificate(event);
  record("issue: certificate created, status ACTIVE", !!cert1 && cert1.status === "ACTIVE" && cert1.certId.startsWith("PRM-CERT-2026-"));

  const cert2 = await issueCertificate(event);
  record("issue: idempotent (second call returns same cert)", !!cert2 && cert2.id === cert1!.id && cert2.certId === cert1!.certId);

  const jwk = publicKeyJwk();
  const v = await verifyCredential(cert1!.payloadJws, jwk);
  record("verify: JWS valid via WebCrypto, sub = certId", v.valid === true && (v as { payload?: { sub?: string } }).payload?.sub === cert1!.certId);

  const claims = (v as { payload?: Record<string, unknown> }).payload ?? {};
  record(
    "claims: serial/category/owner/issuer/district present",
    claims.instrumentSerial === instrument.serialNumber &&
      claims.instrumentCategory === "COUNTER_SCALE" &&
      claims.ownerName === trader.name &&
      claims.issuedBy === officer.name &&
      claims.district === "Guntur"
  );

  const parsed = parseQrPayload(cert1!.qrPayload);
  record("qr: parseQrPayload round-trips the JWS", parsed !== null && parsed.jws === cert1!.payloadJws);

  // tamper check on the issued token
  const [h, p, s] = cert1!.payloadJws.split(".");
  const flip = (x: string) => x.slice(0, 5) + (x[5] === "A" ? "B" : "A") + x.slice(6);
  const vt = await verifyCredential(`${h}.${flip(p)}.${s}`, jwk);
  record("tamper: flipped payload -> valid:false", vt.valid === false && vt.reason === "BAD_SIGNATURE");

  // QR envelope shape: pmnm.v1 header present, carries b64url(json) with v/alg/kid/s
  const enc = cert1!.qrPayload.split("#pmnm.v1=")[1] ?? "";
  const env = JSON.parse(Buffer.from(enc.replace(/-/g, "+").replace(/_/g, "/") + "===", "base64").toString("utf8"));
  record("qr envelope: v/alg/kid/s fields", env.v === "pmnm.v1" && env.alg === "EdDSA" && env.kid === "pramanam-2026-08-01" && typeof env.s === "string");

  // validity window
  const vd = (new Date(cert1!.validUntil).getTime() - new Date(cert1!.validFrom).getTime()) / 86400000;
  record("validity: 365 days for COUNTER_SCALE (frozen VALIDITY_DAYS)", Math.round(vd) === 365);

  // notification written directly (no lib/notify import)
  const notif = await db.notification.findFirst({ where: { userId: trader.id, kind: "CERT_ISSUED" } });
  record("notification: CERT_ISSUED row for owner", !!notif);

  // -- cleanup (keep rows that other streams might inspect? no — selftest cleans up) --
  await db.notification.deleteMany({ where: { user: { email: { contains: TAG } } } });
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: cert1!.id }, { entityId: application.id }] } });
  await db.certificate.delete({ where: { id: cert1!.id } });
  await db.application.delete({ where: { id: application.id } });
  await db.instrument.delete({ where: { id: instrument.id } });
  await db.user.deleteMany({ where: { email: { contains: TAG } } });

  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    if (!r.ok) failed++;
  }
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error("issue-selftest crashed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
