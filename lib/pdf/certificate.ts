// lib/pdf/certificate.ts (S3 — Smarpit). A4 portrait certificate of
// verification + A6 instrument sticker. Dual-QR rule (DECISION DOC §G.5):
// variant-A = offline-verifiable pmnm.v1 payload, variant-B = online fallback
// URL. Both ECC level Q, >= 28mm printed size. The 5 identity anchors come
// ONLY from the signed JWS claims — never invented.
import { PDFDocument, StandardFonts, rgb, PDFImage, type PDFFont } from "pdf-lib";
import { qrDataUrl } from "../crypto/qr";
import { KID, publicKeyJwk } from "../crypto/keys";
import { verifyCredential } from "../crypto/jws";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const INK = rgb(0.1, 0.12, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const GREEN = rgb(0.06, 0.5, 0.28);
const AMBER = rgb(0.72, 0.5, 0.02);
const RED = rgb(0.72, 0.13, 0.13);
const RULE = rgb(0.82, 0.84, 0.87);

export type StatusWord = "VALID" | "EXPIRING SOON" | "EXPIRED" | "REVOKED" | "SUSPENDED";

/** Status word stamped at generation: DB status + clock, EXPIRING_SOON window 30d. */
export function statusWordOf(status: string, validUntil: Date, now = new Date()): StatusWord {
  if (status === "REVOKED") return "REVOKED";
  if (status === "SUSPENDED") return "SUSPENDED";
  if (validUntil.getTime() < now.getTime()) return "EXPIRED";
  if (validUntil.getTime() - now.getTime() < 30 * 86400000) return "EXPIRING SOON";
  return "VALID";
}

function statusColor(w: StatusWord) {
  if (w === "VALID") return GREEN;
  if (w === "EXPIRING SOON") return AMBER;
  return RED;
}

/** AUDIT FINDING #48: registry values (owner, serial, issued-by, cert id) can be
 *  arbitrarily long. pdf-lib draws text on a fixed coordinate — no wrapping — so
 *  truncate with an ellipsis to the available column width instead of letting
 *  long names/serials run off the sheet. Unit-tested in tests/pdf-fit.test.ts. */
export function fitValue(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(text.slice(0, mid) + ellipsis, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ellipsis;
}

export interface SheetInput {
  certId: string;
  status: string;
  validFrom: Date;
  validUntil: Date;
  payloadJws: string;
  qrPayload: string; // variant-A: offline pmnm.v1 envelope (built at issuance)
}

/** Decode claims from the payloadJws payload segment (base64url JSON). */
function decodeClaims(jws: string): Record<string, string> {
  try {
    const seg = jws.split(".")[1];
    return JSON.parse(Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return {};
  }
}

const MM = 72 / 25.4; // pdf-lib units are points; 1mm = 2.8346pt
const QR_MM = 30; // print size >= 28mm per §G.5

async function embedQr(pdf: PDFDocument, text: string): Promise<PDFImage> {
  return pdf.embedPng(await qrDataUrl(text));
}
/** A4 portrait certificate of verification. Returns the PDF bytes. */
export async function renderCertificateSheet(input: SheetInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // integrity gate: never render a sheet whose JWS doesn't verify
  const v = await verifyCredential(input.payloadJws, publicKeyJwk());
  if (!v.valid) throw new Error(`refusing to render unverifiable payload: ${v.reason}`);
  const claims = decodeClaims(input.payloadJws);

  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const W = 595.28;

  // header band
  page.drawRectangle({ x: 0, y: 741, width: W, height: 101, color: rgb(0.05, 0.16, 0.32) });
  page.drawText("PRAMANAM", { x: 48, y: 796, size: 26, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Certificate of Verification · Legal Metrology Act 2009", {
    x: 48, y: 772, size: 11, font, color: rgb(0.82, 0.87, 0.95),
  });
  page.drawText(`KID ${KID}`, { x: 48, y: 754, size: 8, font, color: rgb(0.6, 0.7, 0.85) });

  // status stamp, top right
  const word = statusWordOf(input.status, input.validUntil);
  page.drawText(word, {
    x: W - 48 - bold.widthOfTextAtSize(word, 18), y: 780, size: 18, font: bold, color: statusColor(word),
  });
  page.drawText(input.certId, {
    x: W - 48 - bold.widthOfTextAtSize(input.certId, 10), y: 762, size: 10, font: bold, color: rgb(1, 1, 1),
  });

  // 5 identity anchors — EXACTLY the credential claims
  const anchors: [string, string][] = [
    ["Instrument serial", claims.instrumentSerial ?? "—"],
    ["Owner", claims.ownerName ?? "—"],
    ["Issued by", `${claims.issuedBy ?? "—"}${claims.issuedByKind ? ` (${claims.issuedByKind})` : ""}`],
    ["Category", claims.instrumentCategory ?? "—"],
    ["Valid until", (claims.validUntil ?? input.validUntil.toISOString()).slice(0, 10)],
  ];

  let y = 660;
  page.drawText("IDENTITY ANCHORS", { x: 48, y, size: 9, font: bold, color: MUTED });
  y -= 24;
  const valueColumnWidth = W - 48 - 240;
  for (const [label, value] of anchors) {
    page.drawText(label.toUpperCase(), { x: 48, y, size: 8, font, color: MUTED });
    page.drawText(fitValue(bold, value, 12, valueColumnWidth), { x: 240, y: y + 1, size: 12, font: bold, color: INK });
    y -= 10;
    page.drawLine({ start: { x: 48, y: y - 4 }, end: { x: W - 48, y: y - 4 }, thickness: 0.5, color: RULE });
    y -= 22;
  }

  page.drawText(
    fitValue(
      font,
      `Valid from ${(claims.validFrom ?? input.validFrom.toISOString()).slice(0, 10)}   ·   District ${claims.district ?? "—"}`,
      9,
      W - 96
    ),
    { x: 48, y, size: 9, font, color: MUTED }
  );

  // dual QR block (§G.5)
  const qrTop = y - 34 - QR_MM * MM;
  page.drawText("VERIFY THIS CERTIFICATE", { x: 48, y: y - 18, size: 9, font: bold, color: MUTED });
  page.drawImage(await embedQr(pdf, input.qrPayload), { x: 48, y: qrTop, width: QR_MM * MM, height: QR_MM * MM });
  page.drawText("A · OFFLINE — scan, verify without internet", { x: 48, y: qrTop - 12, size: 7.5, font, color: MUTED });
  const bx = 48 + QR_MM * MM + 60;
  page.drawImage(await embedQr(pdf, `${APP_URL}/verify/${input.certId}`), {
    x: bx, y: qrTop, width: QR_MM * MM, height: QR_MM * MM,
  });

  page.drawText("B · ONLINE — opens the verify page", { x: bx, y: qrTop - 12, size: 7.5, font, color: MUTED });
  page.drawText(
    "Variant A carries the signed payload and verifies offline on any phone. Variant B is the online fallback.",
    {
      x: bx + QR_MM * MM + 20, y: qrTop + (QR_MM * MM) / 2, size: 8.5, font, color: MUTED,
      maxWidth: W - 48 - (bx + QR_MM * MM + 20),
    }
  );

  // footer
  page.drawLine({ start: { x: 48, y: 92 }, end: { x: W - 48, y: 92 }, thickness: 0.5, color: RULE });
  page.drawText(`${input.certId}  ·  KID ${KID}`, { x: 48, y: 74, size: 8.5, font: bold, color: INK });
  page.drawText(fitValue(bold, `Verify: scan QR or ${APP_URL}/verify/${input.certId}`, 8.5, W - 96), {
    x: 48, y: 60, size: 8.5, font, color: MUTED,
  });
  page.drawText("This certificate is computer-generated and cryptographically signed (Ed25519).", {
    x: 48, y: 46, size: 7.5, font, color: MUTED,
  });

  return pdf.save();
}

export interface StickerInput {
  certId: string;
  serialNumber: string;
  category: string;
  validUntil: Date;
  qrPayload: string; // variant-A offline envelope
}

/** A6 portrait sticker: big variant-A QR + serial + category + valid until. */
export async function renderSticker(input: StickerInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const page = pdf.addPage([105 * MM, 148 * MM]); // A6 portrait
  const W = 105 * MM;

  page.drawRectangle({ x: 0, y: 128 * MM, width: W, height: 20 * MM, color: rgb(0.05, 0.16, 0.32) });
  page.drawText("PRAMANAM", { x: 6 * MM, y: 135 * MM, size: 13, font: bold, color: rgb(1, 1, 1) });
  page.drawText("VERIFIED INSTRUMENT", { x: 6 * MM, y: 130 * MM, size: 6.5, font, color: rgb(0.82, 0.87, 0.95) });

  // big variant-A QR: 46mm (>= 28mm rule with margin to spare)
  const size = 46 * MM;
  page.drawImage(await embedQr(pdf, input.qrPayload), {
    x: (W - size) / 2, y: 148 * MM - 30 * MM - size, width: size, height: size,
  });
  const scanLine = "SCAN TO VERIFY - WORKS OFFLINE";
  page.drawText(scanLine, {
    x: (W - bold.widthOfTextAtSize(scanLine, 6.5)) / 2,
    y: 148 * MM - 34 * MM - size, size: 6.5, font: bold, color: MUTED,
  });

  const rows: [string, string][] = [
    ["Serial", input.serialNumber],
    ["Category", input.category],
    ["Valid until", input.validUntil.toISOString().slice(0, 10)],
    ["Cert ID", input.certId],
  ];
  let y = 52 * MM;
  const stickerValueWidth = W - 6 * MM - 32 * MM;
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), { x: 6 * MM, y, size: 6.5, font, color: MUTED });
    page.drawText(fitValue(bold, value, 9.5, stickerValueWidth), { x: 32 * MM, y: y + 0.5, size: 9.5, font: bold, color: INK });
    y -= 9 * MM;
    page.drawLine({
      start: { x: 6 * MM, y: y + 2.5 * MM }, end: { x: W - 6 * MM, y: y + 2.5 * MM },
      thickness: 0.5, color: RULE,
    });
  }
  page.drawText(fitValue(font, `Verify: ${APP_URL}/verify/${input.certId}`, 6.5, W - 12 * MM), {
    x: 6 * MM, y: 8 * MM, size: 6.5, font, color: MUTED,
  });

  return pdf.save();
}