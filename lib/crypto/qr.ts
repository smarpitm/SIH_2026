// PURE string/base64 module — no node built-ins anywhere. Isomorphic:
// buildQrPayload runs server-side (S3 sticker render), parseQrPayload runs
// client-side on Kush's offline verify page.
import QRCode from "qrcode";
import { b64url } from "./jws";
import { KID } from "./keys";

export function buildQrPayload(jws: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const host = new URL(appUrl).host;
  const envelope = JSON.stringify({ v: "pmnm.v1", alg: "EdDSA", kid: KID, s: jws });
  return "https://" + host + "/verify/offline#pmnm.v1=" + b64url(envelope);
}

// accepts the full pmnm.v1 URL form OR a bare compact JWS.
// tolerates trailing whitespace/newlines from phone scanners.
export function parseQrPayload(text: string): { jws: string } | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const marker = "#pmnm.v1=";
  const idx = trimmed.indexOf(marker);
  let encoded: string | null = null;
  if (idx !== -1) {
    encoded = trimmed.slice(idx + marker.length);
  } else if (/^pmnm\.v1=/.test(trimmed)) {
    encoded = trimmed.slice("pmnm.v1=".length);
  }

  if (encoded !== null) {
    try {
      const json = Buffer.from(fromB64urlStr(encoded), "base64").toString("utf8");
      const obj = JSON.parse(json);
      if (obj && typeof obj.s === "string" && obj.s.length > 0) return { jws: obj.s };
    } catch {
      return null;
    }
    return null;
  }

  // bare compact JWS: three dot-separated segments
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { jws: trimmed };
  }
  return null;
}

function fromB64urlStr(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return b64;
}

// PNG data URL, ECC level Q (dense-payload budget per DECISION DOC G.5).
// Used by S3's PDF/sticker renders (server-side canvas-free).
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "Q" });
}
