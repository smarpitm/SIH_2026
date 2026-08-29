// ISOMORPHIC module: browser-safe by design (Kush's /verify/offline page).
// node:crypto is loaded lazily ONLY inside signCredential (server path) —
// verifyCredential uses WebCrypto and never touches node:crypto.
import { KID } from "./keys";

export type VerifyResult =
  | { valid: true; payload: object }
  | { valid: false; reason: "BAD_SIGNATURE" | "MALFORMED" };

export function b64url(input: Buffer | string): string {
  const b64 = Buffer.isBuffer(input)
    ? input.toString("base64")
    : Buffer.from(input, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Buffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(b64, "base64");
}

// deterministic key order → deterministic bytes → exact tamper detection
export function canonicalPayload(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalPayload).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalPayload((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

// SERVER-ONLY (lazy node:crypto import keeps the rest browser-safe)
export async function signCredential(payload: object): Promise<string> {
  const crypto = await import("node:crypto");
  const { loadKeysFromEnv } = await import("./keys");
  const { privateKeyPem } = loadKeysFromEnv();
  const header = { alg: "EdDSA", kid: KID, typ: "JWT" };
  const body = { iss: "pramanam:doca", ...payload };
  const signingInput =
    b64url(canonicalPayload(header)) + "." + b64url(canonicalPayload(body));
  const sig = crypto.sign(null, Buffer.from(signingInput, "utf8"), crypto.createPrivateKey(privateKeyPem));
  return signingInput + "." + b64url(sig);
}

// ISOMORPHIC — WebCrypto Ed25519, works in Node >= 20 and modern Edge/Chrome.
// Verifies the EXACT three segments received; never re-canonicalizes the payload.
export async function verifyCredential(
  jws: string,
  publicKeyJwk: { kty: string; crv: string; x: string }
): Promise<VerifyResult> {
  try {
    const parts = jws.trim().split(".");
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
      return { valid: false, reason: "MALFORMED" };
    }
    if (publicKeyJwk.kty !== "OKP" || publicKeyJwk.crv !== "Ed25519" || !publicKeyJwk.x) {
      return { valid: false, reason: "MALFORMED" };
    }
    const [h, p, s] = parts;
    const signingInput = h + "." + p;
    const alg = "Ed25519" as unknown as Algorithm;
    const key = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(fromB64url(publicKeyJwk.x)),
      alg,
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify(
      alg,
      key,
      new Uint8Array(fromB64url(s)),
      new TextEncoder().encode(signingInput)
    );
    if (!ok) return { valid: false, reason: "BAD_SIGNATURE" };
    const payload = JSON.parse(Buffer.from(fromB64url(p)).toString("utf8")) as object;
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }
}
