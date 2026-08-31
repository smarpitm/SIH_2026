import { describe, it, expect } from "vitest";
import { parseQrPayload } from "@/lib/crypto/qr";
import { verifyCredential } from "@/lib/crypto/jws";
import { KID } from "@/lib/crypto/keys";

// K5 offline validator chain (the exact code path /verify/offline runs):
// pmnm.v1 envelope-or-bare-JWS parse -> WebCrypto Ed25519 verify. Signs with
// Node crypto.subtle Ed25519 so the test exercises real tamper detection, not a stub.

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64url");

async function makeSignedJws(payload: object) {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  const x = b64url(Buffer.from(pub));
  const header = b64url(JSON.stringify({ alg: "EdDSA", kid: KID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: "pramanam:doca", ...payload }));
  const data = new TextEncoder().encode(`${header}.${body}`);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, privateKey, data)
  );
  return {
    jws: `${header}.${body}.${b64url(Buffer.from(sig))}`,
    jwk: { kty: "OKP", crv: "Ed25519", x },
  };
}

// post-signature tamper: flip ONE char in a base64url segment so the payload still
// parses but the signature no longer matches.
function flipSegment(jws: string, index: 0 | 1 | 2): string {
  const parts = jws.split(".");
  const seg = parts[index];
  parts[index] = seg.slice(0, -1) + (seg.endsWith("A") ? "B" : "A");
  return parts.join(".");
}

describe("offline verify chain (K5 /verify/offline)", () => {
  it("parseQrPayload accepts the pmnm.v1 envelope URL AND a bare compact JWS", async () => {
    const { jws } = await makeSignedJws({ sub: "PRM-CERT-2026-00001" });
    const env =
      "https://example.test/verify/offline#pmnm.v1=" +
      b64url(JSON.stringify({ v: "pmnm.v1", alg: "EdDSA", kid: KID, s: jws }));
    expect(parseQrPayload(env)?.jws).toBe(jws);
    expect(parseQrPayload(jws + "\n")?.jws).toBe(jws);
    expect(parseQrPayload("junk")).toBeNull();
  });

  it("verifyCredential resolves a real Ed25519 signature and reads the signed claims", async () => {
    const signed = await makeSignedJws({ sub: "PRM-CERT-2026-00001", validUntil: "2030-01-01T00:00:00Z" });
    const v = await verifyCredential(signed.jws, signed.jwk);
    expect(v.valid).toBe(true);
    expect((v as { payload: Record<string, unknown> }).payload.sub).toBe("PRM-CERT-2026-00001");
  });

  it("a single flipped char in the payload segment -> BAD_SIGNATURE", async () => {
    const signed = await makeSignedJws({ sub: "PRM-CERT-2026-00001" });
    const v = await verifyCredential(flipSegment(signed.jws, 1), signed.jwk);
    expect(v).toMatchObject({ valid: false, reason: "BAD_SIGNATURE" });
  });

  it("wrong key -> BAD_SIGNATURE, malformed -> MALFORMED", async () => {
    const a = await makeSignedJws({ sub: "A" });
    const b = await makeSignedJws({ sub: "B" });
    expect(await verifyCredential(a.jws, b.jwk)).toMatchObject({
      valid: false,
      reason: "BAD_SIGNATURE",
    });
    expect(await verifyCredential("a..b", a.jwk)).toMatchObject({
      valid: false,
      reason: "MALFORMED",
    });
  });
});