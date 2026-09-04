// Keys module. Server functions use node:crypto lazily so that importing
// the constant KID (e.g. from browser-safe modules) never pulls node:crypto
// into a client bundle.
// AUDIT FINDING #45: the key id is configurable (ED25519_KID) and travels in
// every JWS header + QR envelope, so verifiers can select the right key from
// the JWKS endpoint (app/api/v1/public/jwks/route.ts) during rotation.
export const KID = process.env.ED25519_KID || "pramanam-2026-08-01";

export function generateKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  // lazy require is deliberate: keeps node:crypto out of browser bundles (KID import).
  // webpackIgnore: the live require is server-only; Node resolves the builtin at runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

let cached: { privateKeyPem: string; publicKeyPem: string } | null = null;

export function loadKeysFromEnv(): { privateKeyPem: string; publicKeyPem: string } {
  if (cached) return cached;
  const priv = process.env.ED25519_PRIVATE_KEY;
  const pub = process.env.ED25519_PUBLIC_KEY;
  if (priv && pub) {
    cached = {
      privateKeyPem: Buffer.from(priv, "base64").toString("utf8"),
      publicKeyPem: Buffer.from(pub, "base64").toString("utf8"),
    };
    return cached;
  }
  // AUDIT FINDING #8: ephemeral keys are a dev-only convenience. In production
  // a generated pair would vanish at restart and every previously issued badge
  // would stop verifying — fail hard instead (lib/security/env.ts also checks
  // the env keys are present at boot).
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[crypto] ED25519_PRIVATE_KEY / ED25519_PUBLIC_KEY required in production — ephemeral key generation is disabled"
    );
  }
  // dev convenience: generate an ephemeral pair and print once
  cached = generateKeyPair();
  const privB64 = Buffer.from(cached.privateKeyPem).toString("base64");
  const pubB64 = Buffer.from(cached.publicKeyPem).toString("base64");
  console.log(
    "[pramanam/crypto] ED25519 keys not set in env — generated ephemeral pair.\n" +
      "paste into .env — NEVER .env.example\n" +
      `ED25519_PRIVATE_KEY="${privB64}"\n` +
      `ED25519_PUBLIC_KEY="${pubB64}"`
  );
  return cached;
}

// raw 32-byte ed25519 public key = last 32 bytes of the SPKI DER
export function publicKeyJwk(): { kty: "OKP"; crv: "Ed25519"; x: string } {
  // lazy require is deliberate: keeps node:crypto out of browser bundles (KID import).
  // webpackIgnore: server-only live require (Node resolves the builtin at runtime).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
  const { publicKeyPem } = loadKeysFromEnv();
  const der = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" }) as Buffer;
  const raw = der.subarray(der.length - 32);
  return {
    kty: "OKP",
    crv: "Ed25519",
    x: toB64Url(raw),
  };
}

export function keyFingerprint(): string {
  // lazy require is deliberate: keeps node:crypto out of browser bundles (KID import).
  // webpackIgnore: server-only live require (Node resolves the builtin at runtime).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
  const { publicKeyPem } = loadKeysFromEnv();
  return "sha256-" + crypto.createHash("sha256").update(publicKeyPem).digest("base64");
}

// local b64url helper (jws.ts also exports one; keep this module self-contained)
function toB64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
