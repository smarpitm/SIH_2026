// Run: npx tsx lib/pdf/pdf-selftest.ts
// Self-contained: issues a certificate, renders the A4 sheet + A6 sticker,
// uploads versioned to MinIO, presigns, checks versioning/staleness/negative
// paths. Prints PASS/FAIL, exits 1 on fail.
import fs from "node:fs";

(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { db } from "../db";
import { issueCertificate } from "../crypto/issue";
import { hashPassword } from "../hash";
import { renderCertificateSheet, renderSticker, statusWordOf } from "./certificate";
import { putVersionedPdf, getPresignedGetUrl, headPdfStatus } from "./store";

const TAG = "pdfst" + Date.now().toString(36);

async function main() {
  const results: { name: string; ok: boolean }[] = [];
  const record = (name: string, ok: boolean) => results.push({ name, ok });

  // -- fixture ---------------------------------------------------------------
  const hash = await hashPassword("Passw0rd!selftest");
  const trader = await db.user.create({
    data: { name: "Pdf Trader " + TAG, email: `pt.${TAG}@demo.in`, passwordHash: hash, role: "TRADER", district: "Guntur" },
  });
  const officer = await db.user.create({
    data: { name: "Pdf Officer " + TAG, email: `po.${TAG}@demo.in`, passwordHash: hash, role: "LMO", district: "Guntur" },
  });
  const instrument = await db.instrument.create({
    data: {
      ownerId: trader.id, category: "COUNTER_SCALE", make: "Cas", model: "ST",
      serialNumber: "PT-" + TAG, capacity: "100kg", district: "Guntur", address: "Pdf Lane",
    },
  });
  const application = await db.application.create({
    data: { instrumentId: instrument.id, traderId: trader.id, type: "NEW", status: "PASSED", feePaidAt: new Date(), declarationAccepted: true },
  });

  const cert = await issueCertificate({
    applicationId: application.id, instrumentId: instrument.id,
    reportId: "report-" + TAG, inspectorId: officer.id, inspectorKind: "LMO" as const,
  });
  if (!cert) throw new Error("issuance failed in fixture");

  // -- 1. status words ---------------------------------------------------------
  record("statusWord: ACTIVE+future -> VALID", statusWordOf("ACTIVE", new Date(Date.now() + 90 * 86400000)) === "VALID");
  record("statusWord: 10d to expiry -> EXPIRING SOON", statusWordOf("ACTIVE", new Date(Date.now() + 10 * 86400000)) === "EXPIRING SOON");
  record("statusWord: past validUntil -> EXPIRED", statusWordOf("ACTIVE", new Date(Date.now() - 86400000)) === "EXPIRED");
  record("statusWord: REVOKED stays REVOKED even if unexpired", statusWordOf("REVOKED", new Date(Date.now() + 90 * 86400000)) === "REVOKED");

  // -- 2. A4 sheet render ------------------------------------------------------
  const sheet = await renderCertificateSheet({
    certId: cert.certId, status: "ACTIVE", validFrom: cert.validFrom,
    validUntil: cert.validUntil, payloadJws: cert.payloadJws, qrPayload: cert.qrPayload,
  });
  record("sheet: A4 PDF bytes, %PDF header, sane size", sheet.length > 3000 && sheet[0] === 0x25 && sheet[1] === 0x50);

  // unverifiable payload refused
  let refused = false;
  try {
    await renderCertificateSheet({
      certId: cert.certId, status: "ACTIVE", validFrom: cert.validFrom, validUntil: cert.validUntil,
      payloadJws: cert.payloadJws.slice(0, -4) + "AAAA", qrPayload: cert.qrPayload,
    });
  } catch {
    refused = true;
  }
  record("sheet: tampered JWS refused at render", refused);

  // -- 3. versioned MinIO storage ---------------------------------------------
  const key1 = await putVersionedPdf(cert.certId, sheet, { status: "ACTIVE" });
  const n1 = parseInt(key1.match(/v(\d+)\.pdf$/)![1], 10);
  record("store: vN key shape certs/<certId>/vN.pdf", /^certs\/[^/]+\/v\d+\.pdf$/.test(key1));

  const key2 = await putVersionedPdf(cert.certId, sheet, { status: "EXPIRED" });
  const n2 = parseInt(key2.match(/v(\d+)\.pdf$/)![1], 10);
  record("store: regeneration increments version (key2 = key1 + 1)", n2 === n1 + 1);

  record("store: v1 metadata carries ACTIVE", (await headPdfStatus(key1)) === "ACTIVE");
  record("store: v2 metadata carries EXPIRED", (await headPdfStatus(key2)) === "EXPIRED");

  const url = await getPresignedGetUrl(key1, 300);
  record("presign: url has 300s expiry + points at the stored key", url.includes("X-Amz-Expires=300") && url.includes("/" + key1));

  // presigned url actually serves the PDF
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  record("presign: GET 200 + PDF magic back", res.status === 200 && buf[0] === 0x25 && buf[1] === 0x50);

  // -- 4. sticker ---------------------------------------------------------------
  const sticker = await renderSticker({
    certId: cert.certId, serialNumber: instrument.serialNumber,
    category: instrument.category, validUntil: cert.validUntil, qrPayload: cert.qrPayload,
  });
  record("sticker: A6 PDF bytes render", sticker.length > 2000 && sticker[0] === 0x25 && sticker[1] === 0x50);
  const skey = await putVersionedPdf(cert.certId, sticker, { status: "STICKER:ACTIVE" });
  record("sticker: stored versioned alongside sheet", skey.startsWith(`certs/${cert.certId}/v`));

  // -- 5. cleanup (DB rows; MinIO objects intentionally kept for demo) ---------
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

main()
  .catch((e) => {
    console.error("pdf-selftest crashed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
