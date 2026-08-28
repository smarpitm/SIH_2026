export const ROLES = ["TRADER", "LMO", "GATC", "ADMIN"] as const;
export type Role = typeof ROLES[number];

export const DISTRICTS = ["Guntur", "Krishna", "Vijayawada"] as const;

export const INSTRUMENT_CATEGORIES = [
  "WEIGHBRIDGE",
  "PLATFORM_SCALE",
  "COUNTER_SCALE",
  "FUEL_DISPENSER",
  "TAXI_METER",
  "TANK_METER",
] as const;

export const APP_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "SCHEDULED",
  "CHECKED_IN",
  "PASSED",
  "FAILED",
  "CERT_ISSUED",
  "REJECTED",
] as const;
export type AppStatus = typeof APP_STATUSES[number];

export const TRANSITIONS: Record<AppStatus, AppStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["SCHEDULED", "REJECTED"],
  SCHEDULED: ["CHECKED_IN", "SUBMITTED"],
  CHECKED_IN: ["PASSED", "FAILED"],
  PASSED: ["CERT_ISSUED"],
  FAILED: ["SUBMITTED"],
  CERT_ISSUED: [],
  REJECTED: ["SUBMITTED"],
};

export const CERT_STATUSES = ["ACTIVE", "EXPIRING_SOON", "EXPIRED", "REVOKED", "SUSPENDED"] as const;
export type CertStatus = typeof CERT_STATUSES[number];

export const VALIDITY_DAYS: Record<string, number> = {
  WEIGHBRIDGE: 730,
  PLATFORM_SCALE: 730,
  COUNTER_SCALE: 365,
  FUEL_DISPENSER: 365,
  TAXI_METER: 365,
  TANK_METER: 365,
};

export const FEE_PAISA = 10000; // Rs 100 demo fee

export const MAX_RESCHEDULES = 2;

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTH_REQUIRED",
  "AUTH_FORBIDDEN",
  "JURISDICTION_FORBIDDEN",
  "INVALID_STATE_TRANSITION",
  "RESCHEDULE_BUDGET_EXHAUSTED",
  "NOT_FOUND",
  "CONFLICT",
  "UNSUPPORTED_MEDIA_TYPE",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
export type ErrorCode = typeof ERROR_CODES[number];

export const OBSERVATION_CONFIG: Record<string, { key: string; label: string; type: "boolean" | "text" | "number" }[]> = {
  default: [
    { key: "stamp_legible", label: "Legality stamp legible & unexpired", type: "boolean" },
    { key: "zero_error", label: "Zero error within permissible limit at min/max load", type: "boolean" },
    { key: "no_tamper", label: "No tampering / broken seals", type: "boolean" },
    { key: "stamping_area", label: "Stamping space clean and accessible", type: "boolean" },
    { key: "remarks", label: "Officer remarks", type: "text" },
  ],
};