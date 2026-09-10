import type { ErrorCode, Role, AppStatus, CertStatus } from "./constants";

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgName?: string;
  district?: string;
  phone?: string;
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
  /** Present once the certificate row exists (application → CERT_ISSUED).
   *  Owner-facing UI uses this to enable the PDF download. Always additive;
   *  the /certificates/{id}/pdf route re-checks authorization itself. */
  certificate?: { certId: string; status: CertStatus };
  /** Officer-facing only (LMO/GATC/ADMIN): the trader's name + mobile so the
   *  officer can call ahead before a site visit. NEVER present for a TRADER
   *  requester (promptbook_phone trust boundary). */
  traderName?: string;
  traderPhone?: string;
}

export interface ScheduleDTO {
  id: string;
  applicationId: string;
  assigneeName: string;
  assigneeKind: "LMO" | "GATC";
  scheduledFor: string;
  rescheduleCount: number;
  /** Officer-facing: the trader's contact so the officer can call ahead of a
   *  site visit (promptbook_phone). */
  traderName?: string;
  traderPhone?: string;
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
// Verify page shows EXACTLY 5 anchors (PRD demo): instrument serial, owner name, issued by, valid until, category.