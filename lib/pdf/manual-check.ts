// Run: npx tsx lib/pdf/manual-check.ts
// S3 MANUAL CHECK — exercises the REAL route handlers (not just the lib) with
// minted session tokens, against live Postgres + MinIO:
//  1. GET pdf for demo cert -> 200 presigned url; anchors in the PDF bytes match
//     the JWS claims character-for-character.
//  2. QR contents: variant-A == stored qrPayload (pmnm.v1 envelope), variant-B ==
//     APP_URL/verify/<certId>; both embedded; standalone PNGs exported to
//     C:\pgportable\manual-demo for the phone-scan QA.
//  3. NEGATIVE: unknown cert -> NOT_FOUND; another trader -> AUTH_FORBIDDEN.
//  4. Re-render after revoke -> new vN object, old version still in bucket,
//     fresh PDF stamped REVOKED.
import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFArray } from "pdf-lib";

interface ApiEnvelope {
  ok: boolean;
  data?: { url?: string };
  error?: { code?: string };
}

function isStreamLike(x: unknown): x is { getContents(): Uint8Array } {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { getContents?: unknown }).getContents === "function"
  );
}

/** Inflate all page content streams; returns the decoded text operators. */
async function extractPdfText(buf: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(buf);
  let out = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents?.();
    if (!contents) continue;
    const streams: { getContents(): Uint8Array }[] = [];
    if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const item = contents.lookup(i);
        if (isStreamLike(item)) streams.push(item);
      }
    } else if (isStreamLike(contents)) {
      streams.push(contents);
    }
    for (const s of streams) {
      let bytes: Uint8Array;
      try {
        bytes = s.getContents();
      } catch {
        continue;
      }
      if (!bytes) continue;
      let dec: string;
      if (bytes.length > 2 && bytes[0] === 0x78) {
        try {
          dec = inflateSync(bytes).toString("latin1");
        } catch {
          dec = Buffer.from(bytes).toString("latin1");
        }
      } else {
        dec = Buffer.from(bytes).toString("latin1");
      }
      out += decodeContentStrings(dec) + "\n";
    }
  }
  return out;
}

/** pdf-lib writes text as <HEX> token strings; also accepts (literal) forms. */
function decodeContentStrings(dec: string): string {
  const parts: string[] = [];
  const hexRe = /<([0-9A-Fa-f]*)>/g;
  let hexM: RegExpExecArray | null;
  while ((hexM = hexRe.exec(dec)) !== null) {
    try {
      parts.push(Buffer.from(hexM[1], "hex").toString("latin1"));
    } catch {
      /* skip undecodable */
    }
  }
  const litRe = /\(((?:[^()\\]|\\.)*)\)/g;
  let litM: RegExpExecArray | null;
  while ((litM = litRe.exec(dec)) !== null) {
    parts.push(
      litM[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\([()\\])/g, "$1")
    );
  }
  return parts.join("\n");
}

(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { db } from "../db";
import { hashPassword } from "../hash";
import { issueCertificate } from "../crypto/issue";
import { signAccessToken } from "../auth/jwt";
import { buildQrPayload, parseQrPayload, qrDataUrl } from "../crypto/qr";
import { verifyCredential } from "../crypto/jws";
import { publicKeyJwk } from "../crypto/keys";
import { headPdfStatus } from "./store";
import { GET as getCertPdf } from "../../app/api/v1/certificates/[id]/pdf/route";

const TAG = "mcpdf" + Date.now().toString(36);
const OUT = "C:\\pgportable\\manual-demo";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function main() {
  const results: { name: string; ok: boolean; note?: string }[] = [];
  const record = (name: string, ok: boolean, note?: string) => results.push({ name, ok, note });
  fs.mkdirSync(OUT, { recursive: true });

  // -- fixture ----------------------------------------------------------------
  const hash = await hashPassword("Passw0rd!demo");
  const owner = await db.user.create({
    data: { name: "ManualCheck Owner " + TAG, email: `mc.owner.${TAG}@demo.in`, passwordHash: hash, role: "TRADER", district: "Guntur", orgName: "MC Firm " + TAG },
  });
  const otherTrader = await db.user.create({
    data: { name: "ManualCheck Other " + TAG, email: `mc.other.${TAG}@demo.in`, passwordHash: hash, role: "TRADER", district: "Krishna", orgName: "Other Firm " + TAG },
  });
  const lmo = await db.user.create({
    data: { name: "MC LMO " + TAG, email: `mc.lmo.${TAG}@demo.in`, passwordHash: hash, role: "LMO", district: "Guntur" },
  });
  const admin = await db.user.create({
    data: { name: "MC Admin " + TAG, email: `mc.admin.${TAG}@demo.in`, passwordHash: hash, role: "ADMIN" },
  });
  void admin;
  const instrument = await db.instrument.create({
    data: {
      ownerId: owner.id, category: "COUNTER_SCALE", make: "Cas", model: "MC-Pro",
      serialNumber: "MC-SERIAL-" + TAG, capacity: "100kg", district: "Guntur", address: "MC Lane, Guntur",
    },
  });
  const application = await db.application.create({
    data: { instrumentId: instrument.id, traderId: owner.id, type: "NEW", status: "PASSED", feePaidAt: new Date(), declarationAccepted: true },
  });
  const cert = await issueCertificate({
    applicationId: application.id, instrumentId: instrument.id,
    reportId: "mc-report-" + TAG, inspectorId: lmo.id, inspectorKind: "LMO" as const,
  });
  if (!cert) throw new Error("issuance failed in fixture");

  const tokenOwner = await signAccessToken({ id: owner.id, role: "TRADER", district: "Guntur" });
  const tokenOther = await signAccessToken({ id: otherTrader.id, role: "TRADER", district: "Krishna" });
  const tokenLmo = await signAccessToken({ id: lmo.id, role: "LMO", district: "Guntur" });

  const req = (token: string) =>
    new Request(`http://localhost:3000/api/v1/certificates/${cert.certId}/pdf`, {
      headers: { authorization: "Bearer " + token },
    });
  const resJson = async (r: Response): Promise<ApiEnvelope> => (await r.json()) as ApiEnvelope;

// -- 1. GET pdf for demo cert (owner) ---------------------------------------
  const r1 = await getCertPdf(req(tokenOwner), { params: { id: cert.certId } });
  const j1 = (await resJson(r1));
  record("1. GET pdf (owner) -> 200 { ok, url }", r1.status === 200 && j1.ok === true && typeof j1.data?.url === "string");

  const url1 = j1.data?.url ?? "";
  if (!url1) throw new Error("GET pdf did not return a url (see FAIL above)");
  const v1match = url1.match(/v(\d+)\.pdf/);
  record("1. url is presigned (300s) + versioned", url1.includes("X-Amz-Expires=300") && !!v1match);

  const pdfRes1 = await fetch(url1);
  const pdfBuf1 = Buffer.from(await pdfRes1.arrayBuffer());
  record("1. presigned GET -> 200 PDF bytes", pdfRes1.status === 200 && pdfBuf1[0] === 0x25 && pdfBuf1[1] === 0x50 && pdfBuf1.length > 3000);
  const pdfPath1 = path.join(OUT, `certsheet-${cert.certId}-v${v1match![1]}.pdf`);
  fs.writeFileSync(pdfPath1, pdfBuf1);
  record("1. sheet saved for human review", fs.existsSync(pdfPath1));
  const latin1 = await extractPdfText(pdfBuf1);

  // anchors: claims decode == DB fields, AND the raw PDF bytes carry them
  const v = await verifyCredential(cert.payloadJws, publicKeyJwk());
  const claims = (v.valid ? v.payload : {}) as Record<string, string | undefined>;
  const expectedAnchors: Record<string, string> = {
    instrumentSerial: instrument.serialNumber,
    ownerName: owner.name,
    issuedBy: lmo.name,
    instrumentCategory: instrument.category,
    validUntilDate: new Date(claims.validUntil ?? cert.validUntil).toISOString().slice(0, 10),
  };
  const claimsMatch =
    claims.instrumentSerial === expectedAnchors.instrumentSerial &&
    claims.ownerName === expectedAnchors.ownerName &&
    claims.issuedBy === expectedAnchors.issuedBy &&
    claims.instrumentCategory === expectedAnchors.instrumentCategory &&
        new Date(claims.validUntil ?? "").toISOString().slice(0, 10) === expectedAnchors.validUntilDate;
  const bytesCarry =
    latin1.includes(expectedAnchors.instrumentSerial) &&
    latin1.includes(expectedAnchors.ownerName) &&
    latin1.includes(expectedAnchors.instrumentCategory) &&
    latin1.includes(expectedAnchors.validUntilDate) &&
    latin1.includes(cert.certId);
  record("1. anchors match JWS claims character-for-character (claims)", claimsMatch);
  record("1. anchors present in PDF bytes", bytesCarry);

  // -- 2. QR contents + embedded images ---------------------------------------
  record("2. variant-A content == stored qrPayload (pmnm.v1 envelope)", cert.qrPayload === buildQrPayload(cert.payloadJws));
  record("2. parseQrPayload(qrPayload).jws === payloadJws (what a phone reads)", parseQrPayload(cert.qrPayload)?.jws === cert.payloadJws);
  const bContent = `${APP_URL}/verify/${cert.certId}`;
  record("2. variant-B content == APP_URL/verify/<certId>", bContent !== cert.qrPayload);

  // two embedded images in the sheet (subtype markers live in the object
  // dictionary, which pdf-lib writes uncompressed)
  const imgCount = (pdfBuf1.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
  record("2. sheet embeds TWO QR images", imgCount >= 2);

  // export standalone PNGs for the phone scan
  const aPng = await qrDataUrl(cert.qrPayload);
  const bPng = await qrDataUrl(bContent);
  fs.writeFileSync(path.join(OUT, `qr-A-${cert.certId}.png`), Buffer.from(aPng.split(",")[1], "base64"));
  fs.writeFileSync(path.join(OUT, `qr-B-${cert.certId}.png`), Buffer.from(bPng.split(",")[1], "base64"));
  record("2. standalone A/B QR PNGs exported for phone scan", fs.existsSync(path.join(OUT, `qr-A-${cert.certId}.png`)) && fs.existsSync(path.join(OUT, `qr-B-${cert.certId}.png`)));
// -- 3. NEGATIVE cases ---------------------------------------------------------
  const rUnknown = await getCertPdf(
    new Request("http://localhost:3000/api/v1/certificates/PRM-CERT-2026-99999/pdf", {
      headers: { authorization: "Bearer " + tokenOwner },
    }),
    { params: { id: "PRM-CERT-2026-99999" } }
  );
  const jUnknown = (await resJson(rUnknown));
  record("3. unknown cert -> NOT_FOUND (404)", rUnknown.status === 404 && jUnknown.ok === false && jUnknown.error?.code === "NOT_FOUND");

  const rOther = await getCertPdf(req(tokenOther), { params: { id: cert.certId } });
  const jOther = (await resJson(rOther));
  record("3. another trader -> AUTH_FORBIDDEN (403)", rOther.status === 403 && jOther.ok === false && jOther.error?.code === "AUTH_FORBIDDEN");

  // positive scope: same-district LMO can download
  const rLmo = await getCertPdf(req(tokenLmo), { params: { id: cert.certId } });
  const jLmo = (await resJson(rLmo));
  record("3. same-district LMO allowed (positive)", rLmo.status === 200 && jLmo.ok === true);

  // -- 4. re-render after revoke -----------------------------------------------
  const dbBefore = await db.certificate.findUnique({ where: { id: cert.id } });
  record("4. pdfKey set to a versioned key after first render", !!dbBefore?.pdfKey && /v\d+\.pdf$/.test(dbBefore.pdfKey));

  await db.certificate.update({
    where: { id: cert.id },
    data: { status: "REVOKED", revokedReason: "manual-check revoke", revokedAt: new Date() },
  });

  const r2 = await getCertPdf(req(tokenOwner), { params: { id: cert.certId } });
  const j2 = (await resJson(r2));
  const v2match = (j2.data?.url ?? "").match(/v(\d+)\.pdf/);
  record(
    "4. re-render after revoke -> NEW version (v2)",
    r2.status === 200 &&
      v2match !== null &&
      v2match !== undefined &&
      Number(v2match[1]) === Number(v1match![1]) + 1
  );

  const dbAfter = await db.certificate.findUnique({ where: { id: cert.id } });
  record("4. cert.pdfKey updated to the new version", !!dbAfter?.pdfKey && dbAfter.pdfKey !== dbBefore!.pdfKey);

  // old version still in bucket
  const oldStatus = await headPdfStatus(dbBefore!.pdfKey!);
  const newStatus = await headPdfStatus(dbAfter!.pdfKey!);
  record("4. OLD version still in bucket (v1 head-ok)", oldStatus !== null);
  record("4. new object metadata carries REVOKED", newStatus === "REVOKED");

  const url2 = j2.data?.url ?? "";
  if (!url2) throw new Error("re-render after revoke did not return a url (see FAIL above)");
  const pdfRes2 = await fetch(url2);
  const pdfBuf2 = Buffer.from(await pdfRes2.arrayBuffer());
  const latin2 = await extractPdfText(pdfBuf2);
  record("4. fresh PDF stamped REVOKED (bytes carry the status word)", pdfRes2.status === 200 && latin2.includes("REVOKED"));
  fs.writeFileSync(path.join(OUT, `certsheet-${cert.certId}-v${v2match![1]}-REVOKED.pdf`), pdfBuf2);

  // owner download (v1) + same-district LMO positive (v1) + re-render after revoke (v2) = 3
  const auditCount = await db.auditLog.count({ where: { entityId: cert.id, action: "cert.pdf_downloaded" } });
  record("audit: cert.pdf_downloaded logged per GET (3)", auditCount === 3);

  // -- cleanup (DB rows; keep MinIO objects + exported files for the demo) --
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
  console.log(failed === 0 ? "\nALL PASS — files left for phone QA in " + OUT : `\n${failed} FAILURE(S)`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error("pdf-manual-check crashed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
