// Run: npx tsx lib/public/public-selftest.ts
// M7 SELFTEST — exercises the REAL public-surface route handlers (not just the
// lib) with minted session tokens, against live Postgres:
//  1. /.well-known/pramanam-public-key -> kid/alg/fingerprint + Ed25519 JWK.
//  2. GET /public/certificates/[certId] -> BadgeDTO: verdict matrix
//     (VALID / EXPIRING_SOON / EXPIRED / REVOKED), signatureValid honest
//     (tampered payload -> false), exactly 5 anchors matching the JWS claims,
//     history from AuditLog.
//  3. lookup: by serial AND by certId; unknown q -> { found:false } (NOT 404);
//     31st request in a minute from one IP -> RATE_LIMITED.
//  4. revoke: RBAC (issuer or ADMIN only), Zod min-20 reason, CONFLICT on
//     already-revoked with current reason in details, AuditLog + Notification.
//  5. /public/stats shape + 60s cache.
import fs from "node:fs";

(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { db } from "../db";
import { hashPassword } from "../hash";
import { issueCertificate } from "../crypto/issue";
import { signCredential } from "../crypto/jws";
import { signAccessToken } from "../auth/jwt";
import { GET as getWellKnown } from "../../app/api/v1/.well-known/pramanam-public-key/route";
import { GET as getPublicCert } from "../../app/api/v1/public/certificates/[certId]/route";
import { GET as getLookup } from "../../app/api/v1/public/certificates/lookup/route";
import { POST as postRevoke } from "../../app/api/v1/certificates/[id]/revoke/route";
import { GET as getStats } from "../../app/api/v1/public/stats/route";

const TAG = "pubst" + Date.now().toString(36);

type Json = { ok: boolean; data?: Record<string, unknown>; error?: { code?: string; details?: unknown } };
async function body(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}
function req(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

async function main() {
  const results: { name: string; ok: boolean }[] = [];
  const record = (name: string, ok: boolean) => results.push({ name, ok });

  // -- fixture ----------------------------------------------------------------
  const hash = await hashPassword("Passw0rd!selftest");
  const owner = await db.user.create({
    data: { name: "Public Owner " + TAG, email: `po.${TAG}@demo.in`, passwordHash: hash, role: "TRADER", district: "Guntur", orgName: "Public Firm " + TAG },
  });
  const officer = await db.user.create({
    data: { name: "Public Officer " + TAG, email: `pf.${TAG}@demo.in`, passwordHash: hash, role: "LMO", district: "Guntur" },
  });
  const otherOfficer = await db.user.create({
    data: { name: "Public Other " + TAG, email: `px.${TAG}@demo.in`, passwordHash: hash, role: "LMO", district: "Krishna" },
  });
  const instrument = await db.instrument.create({
    data: {
      ownerId: owner.id, category: "COUNTER_SCALE", make: "Cas", model: "PUB",
      serialNumber: "PUB-" + TAG, capacity: "30kg", district: "Guntur", address: "Public Lane",
    },
  });
  const application = await db.application.create({
    data: { instrumentId: instrument.id, traderId: owner.id, type: "NEW", status: "PASSED", feePaidAt: new Date(), declarationAccepted: true },
  });
  const cert = await issueCertificate({
    applicationId: application.id, instrumentId: instrument.id,
    reportId: "rep-" + TAG, inspectorId: officer.id, inspectorKind: "LMO" as const,
  });
  if (!cert) throw new Error("issuance failed in fixture");

  const officerToken = await signAccessToken(officer);
  const otherToken = await signAccessToken(otherOfficer);

  // -- 1. well-known public key -----------------------------------------------
  const wk = await body(await getWellKnown());
  record("wellknown: ok + kty/crv OKP/Ed25519", !!wk.ok && wk.data!.kty === "OKP" && wk.data!.crv === "Ed25519");
  record("wellknown: kid + alg EdDSA + sha256- fingerprint + non-empty x",
    wk.data!.kid === "pramanam-2026-08-01" && wk.data!.alg === "EdDSA" &&
    typeof wk.data!.keyFingerprint === "string" && (wk.data!.keyFingerprint as string).startsWith("sha256-") &&
    typeof wk.data!.x === "string" && (wk.data!.x as string).length > 40);

  // -- 2. public badge (no auth) ------------------------------------------------
  const badge = (await body(await getPublicCert(req("http://x"), { params: { certId: cert.certId } }))).data as Record<string, unknown>;
  record("badge: verdict VALID (fresh cert)", badge.verdict === "VALID");
  record("badge: signatureValid true (honest verify)", badge.signatureValid === true);
  const anchors = badge.anchors as { label: string; value: string }[];
  record("badge: EXACTLY 5 anchors", anchors.length === 5);
  const claims = JSON.parse(Buffer.from(cert.payloadJws.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, string>;
  record("badge: anchors match JWS claims exactly",
    anchors[0].value === claims.instrumentSerial && anchors[1].value === claims.ownerName &&
    anchors[2].value === `${claims.issuedBy} (LMO)` && anchors[3].value.slice(0, 10) === claims.validUntil.slice(0, 10) &&
    anchors[4].value === claims.instrumentCategory);
  record("badge: certId + validUntil + category top-level", badge.certId === cert.certId && typeof badge.validUntil === "string" && badge.category === claims.instrumentCategory);
  const history = badge.history as { at: string; what: string }[];
  record("badge: history from AuditLog (issued entry, ISO at)", history.length >= 1 && history.some((h) => h.what.includes("issued")) && !isNaN(Date.parse(history[0].at)));

  // verdict math is live regardless of the S6 scanner column. The badge reads
  // validUntil from the SIGNED claim (tamper-proof), so the date matrix is
  // tested by re-signing payloads with modified claims:
  const originalJws = cert.payloadJws;
  const mkJws = async (validUntil: string) =>
    signCredential({ ...claims, validUntil });
  await db.certificate.update({ where: { id: cert.id }, data: { payloadJws: await mkJws(new Date(Date.now() - 86400000).toISOString()) } });
  let b2 = (await body(await getPublicCert(req("http://x"), { params: { certId: cert.certId } }))).data as Record<string, unknown>;
  record("verdict: claim validUntil past + status ACTIVE -> EXPIRED (live, no scanner needed)", b2.verdict === "EXPIRED");
  await db.certificate.update({ where: { id: cert.id }, data: { payloadJws: await mkJws(new Date(Date.now() + 10 * 86400000).toISOString()) } });
  b2 = (await body(await getPublicCert(req("http://x"), { params: { certId: cert.certId } }))).data as Record<string, unknown>;
  record("verdict: claim validUntil in 10d -> EXPIRING_SOON (live)", b2.verdict === "EXPIRING_SOON");
  await db.certificate.update({ where: { id: cert.id }, data: { status: "EXPIRED" } });
  b2 = (await body(await getPublicCert(req("http://x"), { params: { certId: cert.certId } }))).data as Record<string, unknown>;
  record("verdict: status EXPIRED (scanner) respected", b2.verdict === "EXPIRED");
  await db.certificate.update({ where: { id: cert.id }, data: { status: "ACTIVE", payloadJws: originalJws } });

  // tampered payload MUST surface signatureValid:false (never fabricated)
  const tampered = originalJws.slice(0, -4) + "AAAA";
  await db.certificate.update({ where: { id: cert.id }, data: { payloadJws: tampered } });
  b2 = (await body(await getPublicCert(req("http://x"), { params: { certId: cert.certId } }))).data as Record<string, unknown>;
  record("badge: tampered payload -> signatureValid FALSE (red CHECK FAILED path)", b2.signatureValid === false);
  record("badge: tampered payload still returns verdict + 5 anchors (DB fallback)", typeof b2.verdict === "string" && (b2.anchors as unknown[]).length === 5);
  await db.certificate.update({ where: { id: cert.id }, data: { payloadJws: originalJws } });

  // unknown cert -> NOT_FOUND (direct certId route keeps 404; only lookup is amber)
  const nf = await body(await getPublicCert(req("http://x"), { params: { certId: "PRM-CERT-0000-99999" } }));
  record("badge: unknown certId -> NOT_FOUND", !nf.ok && nf.error!.code === "NOT_FOUND");

  // -- 3. lookup ----------------------------------------------------------------
  const bySerial = (await body(await getLookup(req("http://x/api?" + new URLSearchParams({ q: instrument.serialNumber }))))).data as Record<string, unknown>;
  record("lookup: by instrument serial -> same badge, signatureValid true", bySerial.certId === cert.certId && bySerial.signatureValid === true);
  const byCertId = (await body(await getLookup(req("http://x/api?" + new URLSearchParams({ q: cert.certId }))))).data as Record<string, unknown>;
  record("lookup: by certId -> found", byCertId.certId === cert.certId);
  const miss = (await body(await getLookup(req("http://x/api?" + new URLSearchParams({ q: "NOSUCH-" + TAG })))));
  record("lookup: unknown q -> 200 { found:false } (amber, NOT 404)", miss.ok && miss.data!.found === false);
  const noQ = await body(await getLookup(req("http://x/api")));
  record("lookup: missing q -> VALIDATION_ERROR", !noQ.ok && noQ.error!.code === "VALIDATION_ERROR");

  // rate limit: 30/min/IP -> 31st is RATE_LIMITED (unique fake IP per run)
  const rlIp = "203.0.113." + ((Date.now() % 200) + 2);
  let limited = false;
  for (let i = 0; i < 31; i++) {
    const r = await body(await getLookup(req("http://x/api?" + new URLSearchParams({ q: cert.certId }), { headers: { "x-forwarded-for": rlIp } })));
    if (!r.ok && r.error!.code === "RATE_LIMITED") { limited = i === 30; break; }
  }
  record("lookup: 30/min/IP then RATE_LIMITED on the 31st", limited);

  // -- 4. revoke ----------------------------------------------------------------
  const noAuth = await body(await postRevoke(req("http://x", { method: "POST" }), { params: { id: cert.certId } }));
  record("revoke: unauthenticated -> AUTH_REQUIRED", !noAuth.ok && noAuth.error!.code === "AUTH_REQUIRED");

  const forbidden = await body(await postRevoke(
    req("http://x", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${otherToken}` }, body: JSON.stringify({ reason: "x".repeat(25) }) }),
    { params: { id: cert.certId } }
  ));
  record("revoke: non-issuer officer -> AUTH_FORBIDDEN", !forbidden.ok && forbidden.error!.code === "AUTH_FORBIDDEN");

  const shortReason = await body(await postRevoke(
    req("http://x", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${officerToken}` }, body: JSON.stringify({ reason: "too short" }) }),
    { params: { id: cert.certId } }
  ));
  record("revoke: reason < 20 chars -> VALIDATION_ERROR", !shortReason.ok && shortReason.error!.code === "VALIDATION_ERROR");

  const reason = "Stamp defaced and seal verification failed on site " + TAG;
  const okRevoke = await body(await postRevoke(
    req("http://x", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${officerToken}` }, body: JSON.stringify({ reason }) }),
    { params: { id: cert.certId } }
  ));
  record("revoke: issuing officer -> 200 { revoked, status REVOKED }", !!okRevoke.ok && okRevoke.data!.status === "REVOKED");
  const row = await db.certificate.findUnique({ where: { id: cert.id } });
  record("revoke: DB row REVOKED + revokedAt + revokedReason", row!.status === "REVOKED" && !!row!.revokedAt && row!.revokedReason === reason);

  const audit = await db.auditLog.findFirst({ where: { entity: "certificate", entityId: cert.id, action: "cert.revoked" } });
  record("revoke: AuditLog cert.revoked written", !!audit);
  const notif = await db.notification.findFirst({ where: { userId: owner.id, kind: "REVOKED" } });
  record("revoke: Notification kind REVOKED to owner", !!notif);

  const conflict = await body(await postRevoke(
    req("http://x", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${officerToken}` }, body: JSON.stringify({ reason: "another valid reason over twenty chars" }) }),
    { params: { id: cert.certId } }
  ));
  record("revoke: already revoked -> CONFLICT with currentReason in details",
    !conflict.ok && conflict.error!.code === "CONFLICT" && (conflict.error!.details as { currentReason?: string })?.currentReason === reason);

  const revokedBadge = (await body(await getPublicCert(req("http://x"), { params: { certId: cert.certId } }))).data as Record<string, unknown>;
  record("badge: after revoke -> verdict REVOKED", revokedBadge.verdict === "REVOKED");

  // -- 5. stats -----------------------------------------------------------------
  const s1 = (await body(await getStats())).data as Record<string, unknown>;
  const s2 = (await body(await getStats())).data as Record<string, unknown>;
  record("stats: shape { totalInstruments, activeCerts, revokedCerts, lastIssuedAt }",
    typeof s1.totalInstruments === "number" && typeof s1.activeCerts === "number" &&
    typeof s1.revokedCerts === "number" && (s1.lastIssuedAt === null || !isNaN(Date.parse(s1.lastIssuedAt as string))));
  record("stats: 60s in-memory cache (identical back-to-back)", JSON.stringify(s1) === JSON.stringify(s2));
  record("stats: revokedCerts counts the revocation made above", (s1.revokedCerts as number) >= 1);

  // -- cleanup (DB rows only) -----------------------------------------------------
  await db.auditLog.deleteMany({ where: { entityId: cert.id } });
  await db.notification.deleteMany({ where: { user: { email: { contains: TAG } } } });
  await db.certificate.delete({ where: { id: cert.id } });
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

main().catch((e) => {
  console.error("public-selftest crashed:", e);
  process.exit(1);
});
