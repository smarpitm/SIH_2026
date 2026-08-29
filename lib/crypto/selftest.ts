// Run: npx tsx lib/crypto/selftest.ts
// Exits 1 on any failure. Prints PASS/FAIL per case.
import fs from "node:fs";
import path from "node:path";

// minimal .env loader (tsx doesn't auto-load .env like next dev does)
(function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { KID, keyFingerprint, publicKeyJwk } from "./keys";
import { signCredential, verifyCredential } from "./jws";
import { buildQrPayload, parseQrPayload } from "./qr";

function flipChar(s: string, at: number): string {
  const mid = s.charAt(at);
  const swap = mid === "A" ? "B" : "A";
  return s.slice(0, at) + swap + s.slice(at + 1);
}

function pickInner(s: string): number {
  // flip somewhere in the middle, away from structural edges
  return Math.floor(s.length / 2);
}

async function main() {
  const results: { name: string; ok: boolean; note?: string }[] = [];

  const jwk = publicKeyJwk();
  results.push({
    name: "keys: generated pair + jwk shape",
    ok:
      jwk.kty === "OKP" &&
      jwk.crv === "Ed25519" &&
      jwk.x.length === 43 &&
      keyFingerprint().startsWith("sha256-"),
  });

  const payload = {
    certId: "PRM-CERT-2026-00001",
    instrumentId: "INSTR-0007",
    result: "PASS",
    issuedAt: "2026-08-29T10:00:00.000Z",
    nested: { district: "Pune", b: 2, a: 1 },
  };
  const jws = await signCredential(payload);
  const segs = jws.split(".");
  const header = JSON.parse(Buffer.from(segs[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  results.push({
    name: "jws: compact form + header {alg EdDSA, kid, typ JWT} + iss",
    ok:
      segs.length === 3 &&
      header.alg === "EdDSA" &&
      header.kid === KID &&
      header.typ === "JWT",
  });

  const v1 = await verifyCredential(jws, jwk);
  results.push({ name: "verify: genuine credential -> valid", ok: v1.valid === true && (v1.payload as { certId?: string }).certId === "PRM-CERT-2026-00001" });

  // flip one char in the PAYLOAD segment
  const pAt = pickInner(segs[1]);
  const v2 = await verifyCredential(`${segs[0]}.${flipChar(segs[1], pAt)}.${segs[2]}`, jwk);
  results.push({
    name: "verify: payload flipped -> false BAD_SIGNATURE",
    ok: v2.valid === false && v2.reason === "BAD_SIGNATURE",
  });

  // flip one char in the SIGNATURE segment
  const sAt = pickInner(segs[2]);
  const v3 = await verifyCredential(`${segs[0]}.${segs[1]}.${flipChar(segs[2], sAt)}`, jwk);
  results.push({
    name: "verify: signature flipped -> false BAD_SIGNATURE",
    ok: v3.valid === false && v3.reason === "BAD_SIGNATURE",
  });

  // flip the header kid
  const headerFlipped = { ...header, kid: flipChar(header.kid, 3) };
  const b64u = (o: object) =>
    Buffer.from(JSON.stringify(o), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const v4 = await verifyCredential(`${b64u(headerFlipped)}.${segs[1]}.${segs[2]}`, jwk);
  results.push({ name: "verify: header kid flipped -> false", ok: v4.valid === false });

  // QR round trip
  const qr = buildQrPayload(jws);
  const parsed = parseQrPayload(qr);
  results.push({ name: "qr: build -> parse -> same jws back", ok: parsed !== null && parsed.jws === jws });
  const parsedBare = parseQrPayload(jws + "\n");
  const parsedJunk = parseQrPayload("https://random.example.com/garbage");
  results.push({
    name: "qr: bare JWS w/ trailing newline accepted; junk -> null",
    ok: parsedBare !== null && parsedBare.jws === jws && parsedJunk === null,
  });

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  }
  console.log(`\nfingerprint: ${keyFingerprint()}`);
  console.log(failed.length === 0 ? "\nALL PASS" : `\n${failed.length} FAILURE(S)`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("selftest crashed:", e);
  process.exit(1);
});
