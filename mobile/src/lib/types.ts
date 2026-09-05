// Shared DTOs mirrored from packages/shared (kept local — Expo Metro can't
// resolve the web tsconfig `@/packages/shared` path from the parent repo).
export type Role = "TRADER" | "LMO" | "GATC" | "ADMIN";
export type AppStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "SCHEDULED"
  | "CHECKED_IN"
  | "PASSED"
  | "FAILED"
  | "CERT_ISSUED"
  | "REJECTED";
export type CertStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "REVOKED" | "SUSPENDED";
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "AUTH_FORBIDDEN"
  | "JURISDICTION_FORBIDDEN"
  | "INVALID_STATE_TRANSITION"
  | "RESCHEDULE_BUDGET_EXHAUSTED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  error: { code: ErrorCode; message: string; details?: unknown };
}
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgName?: string;
  district?: string;
}

export interface InstrumentDTO {
  id: string;
  category: string;
  make: string;
  model: string;
  serialNumber: string;
  capacity: string;
  district: string;
  address: string;
  createdAt: string;
}

export interface ApplicationDTO {
  id: string;
  instrumentId: string;
  type: "NEW" | "RE_VERIFICATION";
  status: AppStatus;
  preferredDate?: string;
  feePaidAt?: string;
  createdAt: string;
}

export interface CertificateDTO {
  id: string;
  certId: string;
  status: CertStatus;
  validFrom: string;
  validUntil: string;
  instrumentSerial: string;
  pdfUrl?: string;
}

export interface BadgeDTO {
  certId: string;
  verdict: "VALID" | "EXPIRING_SOON" | "EXPIRED" | "REVOKED";
  signatureValid: boolean;
  anchors: { label: string; value: string }[];
  history: { at: string; what: string }[];
}

export interface DashCounts {
  pendingApplications: number;
  verifiedThisMonth: number;
  expiringIn30d: number;
  slaBreaches: number;
}

export interface LookupResult {
  found: boolean;
  ambiguous?: boolean;
  candidates?: { certId: string; district: string }[];
  badge?: BadgeDTO;
}
