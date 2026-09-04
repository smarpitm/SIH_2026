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

export type PublicBadge = BadgeDTO & {
  validUntil: string;
  category: string;
  /** true when anchors were assembled from registry fallbacks because the
   *  signature check failed — display them as unverified (finding #69). */
  anchorsUntrusted?: boolean;
};

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
    // AUDIT FINDING #69: when the signature check fails, the anchors fall back
    // to registry values — flag them so no consumer mistakes unverified
    // fallback data for signed claims. (The renderer's red CHECK FAILED banner
    // remains the primary signal.)
    anchorsUntrusted: !v.valid,
    anchors,
    validUntil,
    category: claims.instrumentCategory ?? cert.instrument.category,
        history: history.map((h: { createdAt: Date; action: string }) => ({
      at: h.createdAt.toISOString(),
      what: auditLabel(h.action),
    })),
  };
}

// ---- lookup rate limiting: DURABLE (audit finding #7) ----
// Moved to lib/security/ratelimit (Redis INCR/EXPIRE fixed windows, shared
// across instances/restarts; x-forwarded-for only honored when TRUST_PROXY is
// explicitly set). The old process-local Map + blind header trust is gone.

// ---- public stats cache ----
// AUDIT FINDING #64 (hardened): primary cache is Redis (shared across
// instances/restarts) with a 60s TTL; the process-local copy below is ONLY the
// dev/fallback path and the final read-through when Redis is unavailable. The
// active-cert math is unchanged (#65: non-revoked AND validUntil > now).
import { getRedis } from "@/lib/security/redis";

export interface PublicStats {
  totalInstruments: number;
  activeCerts: number;
  revokedCerts: number;
  lastIssuedAt: string | null;
}
let statsCache: { data: PublicStats; ts: number } | null = null;
const STATS_TTL_MS = 60_000;
const STATS_REDIS_KEY = "pramanam:stats:v1";
const STATS_REDIS_TTL_SEC = 60;

async function computeStats(): Promise<PublicStats> {
  const [totalInstruments, activeCerts, revokedCerts, last] = await Promise.all([
    db.instrument.count(),
    // AUDIT FINDING #65: "active" = status not revoked/suspended AND still
    // within its validity window — a lagging expiry scanner can no longer
    // inflate the active count with certificates that are factually expired.
    db.certificate.count({
      where: { status: { in: ["ACTIVE", "EXPIRING_SOON"] }, validUntil: { gt: new Date() } },
    }),
    db.certificate.count({ where: { status: "REVOKED" } }),
    db.certificate.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  return {
    totalInstruments,
    activeCerts,
    revokedCerts,
    lastIssuedAt: last ? last.createdAt.toISOString() : null,
  };
}

export async function getStats(): Promise<PublicStats> {
  const now = Date.now();
  if (statsCache && now - statsCache.ts < STATS_TTL_MS) return statsCache.data;

  const r = getRedis();
  if (r) {
    try {
      const cached = await r.get(STATS_REDIS_KEY);
      if (cached) {
        const data = JSON.parse(cached) as PublicStats;
        statsCache = { data, ts: now };
        return data;
      }
      const data = await computeStats();
      // best-effort write; a failed SET just means the next caller recomputes
      await r.set(STATS_REDIS_KEY, JSON.stringify(data), "EX", STATS_REDIS_TTL_SEC).catch(() => undefined);
      statsCache = { data, ts: now };
      return data;
    } catch (err) {
      console.error("[stats] redis cache miss-path failed, using memory fallback:", err);
    }
  }
  const data = await computeStats();
  statsCache = { data, ts: now };
  return data;
}