// lib/security/env.ts — production startup validation (audit finding #8).
// Refuses to boot in production with demo/predictable secrets, missing crypto
// keys, or without the infrastructure the durable security features need.
// No-op outside NODE_ENV=production so local dev and CI stay turn-key.

const DEMO_SECRET_MARKERS = ["dev-only-", "changeme", "pramanam123"];

function isDemoSecret(value: string | undefined): boolean {
  if (!value) return true;
  if (value.length < 32) return true;
  return DEMO_SECRET_MARKERS.some((m) => value.toLowerCase().includes(m));
}

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const problems: string[] = [];

  if (isDemoSecret(process.env.JWT_SECRET)) {
    problems.push("JWT_SECRET missing, too short (<32 chars), or looks like a demo value");
  }
  if (isDemoSecret(process.env.JWT_REFRESH_SECRET)) {
    problems.push("JWT_REFRESH_SECRET missing, too short (<32 chars), or looks like a demo value");
  }
  if (!process.env.ED25519_PRIVATE_KEY || !process.env.ED25519_PUBLIC_KEY) {
    // Ephemeral key generation is disabled in production (lib/crypto/keys.ts)
    // — without these env keys, certificates could be signed with a key that
    // vanishes at restart and every issued badge would stop verifying.
    problems.push("ED25519_PRIVATE_KEY / ED25519_PUBLIC_KEY required (ephemeral generation is disabled in production)");
  }
  if (!process.env.REDIS_URL) {
    problems.push("REDIS_URL required — durable rate limiting must not fall back to in-memory");
  }
  if (!process.env.DATABASE_URL) {
    problems.push("DATABASE_URL required");
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  if (!appUrl) {
    problems.push("NEXT_PUBLIC_APP_URL required");
  } else if (appUrl.startsWith("http://")) {
    problems.push("NEXT_PUBLIC_APP_URL must use https in production");
  }
  if (process.env.S3_ACCESS_KEY === "pramanam" || process.env.S3_SECRET_KEY === "pramanam123") {
    problems.push("S3 credentials look like the documented demo values — provision real ones");
  }
  // AUDIT FINDING #13: no payment gateway is integrated, so production can only
  // run the demo payment path behind an explicit opt-in — anything else would
  // silently pretend applications were paid.
  const paymentMode = process.env.PAYMENT_MODE ?? "demo";
  if (paymentMode !== "demo") {
    problems.push(
      "PAYMENT_MODE must be \"demo\" — no payment gateway is integrated yet, live mode cannot record payments"
    );
  } else if (process.env.ALLOW_DEMO_PAYMENT !== "true") {
    problems.push(
      "PAYMENT_MODE=demo in production requires ALLOW_DEMO_PAYMENT=true — mock payments are demo-only and must be explicitly allowed"
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `[env] refusing to start in production:\n- ${problems.join("\n- ")}`
    );
  }
}
