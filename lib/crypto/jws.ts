// ISOMORPHIC module: browser-safe by design (Kush's /verify/offline page).
// node:crypto is loaded lazily ONLY inside signCredential (server path) —
// verifyCredential uses WebCrypto and never touches node:crypto.
import { KID } from "./keys";

export type VerifyResult =
  | { valid: true; payload: object }
  | { valid: false; reason: "BAD_SIGNATURE" | "MALFORMED" };

// ISOMORPHIC base64url (audit findings #80/#92/#114): Buffer is undefined in
// browsers, so every helper here uses only Web-standard globals — atob/btoa
// (available in browsers AND Node >= 20) and TextEncoder/TextDecoder.
// Node Buffer never appears in a browser-shared code path again.

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
  // MA-suite fix (boot blocker, needs Smarpit review): `await import("node:crypto")`
  // is a dynamic node:-scheme import that Next 14's webpack cannot handle
  // (UnhandledSchemeError broke `next dev` for the whole team after MG2).
  // Lazy require keeps the same browser-safe design (server-only execution)
  // and matches the pattern already used in ./keys.ts.
  // webpackIgnore: server-only live require; Node resolves the builtin at runtime and
  // webpack skips it in client bundles (offline verify page imports this module).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
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
      fromB64url(s),
      new TextEncoder().encode(signingInput)
    );
    if (!ok) return { valid: false, reason: "BAD_SIGNATURE" };
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(p))) as object;
    return { valid: true, payload };
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }
}
