// Smarpit-owned public surface (PRD #16, consumer-trust badge).
// Frozen-contract safe: reads only packages/shared types + lib/crypto verify,
// never mutates packages/shared or prisma/schema.
import type { BadgeDTO } from "@/packages/shared/types";
import type { CertStatus } from "@/packages/shared/constants";
import { db } from "@/lib/db";
import { verifyCredential } from "@/lib/crypto/jws";
import { publicKeyJwk } from "@/lib/crypto/keys";

/** Minimal Prisma selection shape needed to materialise a BadgeDTO. */
export interface CertForBadge {
  id: string;
  certId: string;
  status: CertStatus;
  validUntil: Date;
  issuedByKind: string;
  payloadJws: string;
  instrument: { serialNumber: string; category: string; owner: { name: string } };
}

export type PublicBadge = BadgeDTO & { validUntil: string; category: string };

const AUDIT_LABELS: Record<string, string> = {
  "cert.issued": "Certificate issued and notified to owner",
  "cert.revoked": "Certificate revoked by issuing officer",
  "cert.pdf_downloaded": "Certificate PDF downloaded",
  "cert.sticker_downloaded": "Sticker downloaded",
  "application.create": "Application submitted",
  "application.pay": "Application fee paid",
};

function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

/**
 * Build the public badge. Signature is verified HONESTLY via WebCrypto against
 * the env public key — signatureValid is never fabricated. The verdict follows
 * the badge contract (see route comments): REVOKED > EXPIRED > EXPIRING_SOON > VALID.
 *
 * UI RULE (enforced by Kush's renderer, stated here for the record):
 *   signatureValid === false  =>  red "CHECK FAILED — POSSIBLE FAKE" banner,
 * regardless of verdict. So we NEVER lie about the signature result: a
 * tampered payload surfaces signatureValid:false and the red banner wins.
 */
export async function buildBadge(cert: CertForBadge): Promise<PublicBadge> {
  const v = await verifyCredential(cert.payloadJws, publicKeyJwk());
  const claims = (v.valid ? v.payload : {}) as Record<string, string | undefined>;
  const validUntil = claims.validUntil ?? cert.validUntil.toISOString();
  const now = new Date();
  const until = new Date(validUntil);
  const expired = until <= now;
  const soon = !expired && until.getTime() - now.getTime() <= 30 * 86_400_000;

  let verdict: BadgeDTO["verdict"];
  // REVOKED/SUSPENDED come from the status column (only the revoke route writes
  // them, synchronously). EXPIRED/EXPIRING_SOON/VALID are computed LIVE from
  // dates — the S6 scanner maintains the status column, but badge verdict math
  // must be live regardless of whether that scanner has run (badge contract).
  if (cert.status === "REVOKED" || cert.status === "SUSPENDED") verdict = "REVOKED";
  else if (expired || cert.status === "EXPIRED") verdict = "EXPIRED";
  else if (soon) verdict = "EXPIRING_SOON";
  else verdict = "VALID";

  const ownerName = claims.ownerName ?? cert.instrument.owner.name;
  const issuedBy = claims.issuedBy;
  const issuerLine = issuedBy ? `${issuedBy} (${cert.issuedByKind})` : cert.issuedByKind;

  // anchors: EXACTLY 5 {label,value} — instrument serial, owner, issued by
  // (name + LMO|GATC), valid-until (ISO), category. Matches Kush's
  // verify.anchors.i18n keys exactly.
  const anchors: { label: string; value: string }[] = [
    { label: "Instrument Serial", value: claims.instrumentSerial ?? cert.instrument.serialNumber },
    { label: "Owner", value: ownerName },
    { label: "Issued By", value: issuerLine },
    { label: "Valid Until", value: validUntil },
    { label: "Category", value: claims.instrumentCategory ?? cert.instrument.category },
  ];

  const history = await db.auditLog.findMany({
    where: { entity: "certificate", entityId: cert.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return {
    certId: cert.certId,
    verdict,
    signatureValid: v.valid,
    anchors,
    validUntil,
    category: claims.instrumentCategory ?? cert.instrument.category,
        history: history.map((h: { createdAt: Date; action: string }) => ({
      at: h.createdAt.toISOString(),
      what: auditLabel(h.action),
    })),
  };
}

// ---- lookup rate limit: in-memory 30 req/min/IP (pony: Redis counter if time allows) ----
const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_LIMIT = 30;
interface LookupBucket {
  count: number;
  reset: number;
}
const lookupBuckets = new Map<string, LookupBucket>();

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Returns true when the IP may proceed, false when rate-limited. */
export function consumeLookup(ip: string): boolean {
  // memory hygiene: in-memory buckets are ponytail-simple; drop everything if a
  // flood of unique IPs grows the map unboundedly (Redis counter if time allows).
  if (lookupBuckets.size > 5000) lookupBuckets.clear();
  const now = Date.now();
  const b = lookupBuckets.get(ip);
  if (!b || now >= b.reset) {
    lookupBuckets.set(ip, { count: 1, reset: now + LOOKUP_WINDOW_MS });
    return true;
  }
  if (b.count >= LOOKUP_LIMIT) return false;
  b.count++;
  return true;
}

// ---- public stats cache: 60s in-memory ----
export interface PublicStats {
  totalInstruments: number;
  activeCerts: number;
  revokedCerts: number;
  lastIssuedAt: string | null;
}
let statsCache: { data: PublicStats; ts: number } | null = null;
const STATS_TTL_MS = 60_000;

export async function getStats(): Promise<PublicStats> {
  const now = Date.now();
  if (statsCache && now - statsCache.ts < STATS_TTL_MS) return statsCache.data;
  const [totalInstruments, activeCerts, revokedCerts, last] = await Promise.all([
    db.instrument.count(),
    // "active" = not revoked/suspended AND not already expired — EXPIRED certs
    // are historical, not active (status column is scanner-maintained).
    db.certificate.count({ where: { status: { in: ["ACTIVE", "EXPIRING_SOON"] } } }),
    db.certificate.count({ where: { status: "REVOKED" } }),
    db.certificate.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const data: PublicStats = {
    totalInstruments,
    activeCerts,
    revokedCerts,
    lastIssuedAt: last ? last.createdAt.toISOString() : null,
  };
  statsCache = { data, ts: now };
  return data;
}