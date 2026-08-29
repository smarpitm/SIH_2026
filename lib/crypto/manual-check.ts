// S2 MANUAL CHECK (run: npx tsx lib/crypto/manual-check.ts)
import fs from "node:fs";
(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();
import { db } from "../db";
import { registerWorkers } from "../../workers/index";
registerWorkers(); // standalone script: Next's instrumentation.ts doesn't run here
import { issueCertificate } from "./issue";
import { verifyCredential, signCredential } from "./jws";
import { publicKeyJwk, generateKeyPair } from "./keys";
import { emitInspectionPass } from "../hooks";
import { VALIDITY_DAYS } from "../../packages/shared/constants";

const TAG = "manual" + Date.now().toString(36);
let failed = 0;
const record = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
};

async function main() {
  const officer = await db.user.findUniqueOrThrow({ where: { email: "lmo.guntur@demo.in" } });
  const trader = await db.user.create({
    data: { name: "Manual Trader " + TAG, email: `mc.${TAG}@demo.in`, passwordHash: "x", role: "TRADER", district: "Guntur" },
  });
  const instrument = await db.instrument.create({
    data: { ownerId: trader.id, category: "WEIGHBRIDGE", make: "M", model: "M", serialNumber: "MC-" + TAG, capacity: "40t", district: "Guntur", address: "MC" },
  });
  const application = await db.application.create({
    data: { instrumentId: instrument.id, traderId: trader.id, type: "NEW", status: "PASSED", feePaidAt: new Date(), declarationAccepted: true },
  });

  console.log("== 1. selftest row shape ==");
  const cert = await issueCertificate({
    applicationId: application.id, instrumentId: instrument.id,
    reportId: "rep-" + TAG, inspectorId: officer.id, inspectorKind: "LMO",
  });
  const days = Math.round((cert!.validUntil.getTime() - cert!.validFrom.getTime()) / 86400000);
  record("row ACTIVE + certId PRM-CERT-2026-0000X", cert!.status === "ACTIVE" && /^PRM-CERT-2026-\d{5}$/.test(cert!.certId));
  record(`validUntil = validFrom + ${VALIDITY_DAYS.WEIGHBRIDGE}d (WEIGHBRIDGE)`, days === VALIDITY_DAYS.WEIGHBRIDGE);
  console.log("      certId =", cert!.certId);

  console.log("== 2. signature checks ==");
  const jwk = publicKeyJwk();
  const v = await verifyCredential(cert!.payloadJws, jwk);
  record("verifyCredential(original jws) -> true", v.valid === true);
  const [h, p, s] = cert!.payloadJws.split(".");
  const flip = (x: string) => x.slice(0, 8) + (x[8] === "A" ? "B" : "A") + x.slice(9);
  const vf = await verifyCredential(`${h}.${flip(p)}.${s}`, jwk);
  record("flip one char of payloadJws -> false", vf.valid === false);

  // re-sign a MODIFIED payload (validUntil bumped) with a DIFFERENT key -> false
  const alt = generateKeyPair();
  const { createPrivateKey, sign: nodeSign } = await import("node:crypto");
  const claims = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  claims.validUntil = new Date(Date.now() + 99 * 86400000).toISOString();
  const b64u = (o: object) => Buffer.from(JSON.stringify(claims)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hdr = { alg: "EdDSA", kid: "pramanam-2026-08-01", typ: "JWT" };
  const si = `${Buffer.from(JSON.stringify(hdr)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${b64u(claims)}`;
  const sig = nodeSign(null, Buffer.from(si, "utf8"), createPrivateKey(alt.privateKeyPem));
  const foreignJws = si + "." + Buffer.from(sig).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const vx = await verifyCredential(foreignJws, jwk);
  record("modified payload re-signed with DIFFERENT key -> false", vx.valid === false);
  // control: same modified payload re-signed with OUR key -> true (check is meaningful)
  const resign = await signCredential(claims);
  const vr = await verifyCredential(resign, jwk);
  record("control: modified payload re-signed with OUR key -> true", vr.valid === true);

  console.log("== 3. idempotency ==");
  const again = await issueCertificate({
    applicationId: application.id, instrumentId: instrument.id,
    reportId: "rep-" + TAG, inspectorId: officer.id, inspectorKind: "LMO",
  });
  const rowCount = await db.certificate.count({ where: { applicationId: application.id } });
  record("issue twice -> same certId, ONE row", again!.certId === cert!.certId && rowCount === 1);

  console.log("== 4. full hook path (emitInspectionPass) ==");
  const app2 = await db.application.create({
    data: { instrumentId: instrument.id, traderId: trader.id, type: "NEW", status: "PASSED", feePaidAt: new Date(), declarationAccepted: true },
  });
  await emitInspectionPass({
    applicationId: app2.id, instrumentId: instrument.id,
    reportId: "rep2-" + TAG, inspectorId: officer.id, inspectorKind: "LMO",
  });
  const hooked = await db.certificate.findUnique({ where: { applicationId: app2.id } });
  const notif = await db.notification.findFirst({ where: { userId: trader.id, kind: "CERT_ISSUED" }, orderBy: { createdAt: "desc" } });
  record("PASS event -> certificate row appears (hook consumer)", !!hooked && /^PRM-CERT-2026-\d{5}$/.test(hooked.certId));
  record("owner got CERT_ISSUED notification row", !!notif && notif.body.includes(hooked!.certId));

  console.log("== cleanup ==");
  await db.notification.deleteMany({ where: { user: { email: { contains: TAG } } } });
  await db.auditLog.deleteMany({ where: { OR: [{ entityId: cert!.id }, { entityId: hooked!.id }, { entityId: application.id }, { entityId: app2.id }] } });
  await db.certificate.deleteMany({ where: { applicationId: { in: [application.id, app2.id] } } });
  await db.application.deleteMany({ where: { id: { in: [application.id, app2.id] } } });
  await db.instrument.delete({ where: { id: instrument.id } });
  await db.user.deleteMany({ where: { email: { contains: TAG } } });

  console.log(failed === 0 ? "\nMANUAL CHECK: ALL PASS" : `\nMANUAL CHECK: ${failed} FAILURE(S)`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
