import { randomUUID } from "node:crypto";
import { putObject, ensureBucket } from "./minio";

// book MA2 item 2 — lib/uploads is a Manav-owned path.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file

// AUDIT FINDING #16 (hard cap): hard request-level ceiling enforced from the
// Content-Length header BEFORE the body is parsed/buffered by req.formData().
// Chunked requests (no Content-Length) still hit the post-parse file-count and
// total-byte caps in storeUploads(). Route-level cap = the endpoint's max file
// payload + headroom for multipart framing and small text fields.
export const DEFAULT_REQUEST_LIMIT_BYTES = 25 * 1024 * 1024; // 25 MB

/** True when the declared Content-Length exceeds the cap (reject before parse). */
export function requestBodyTooLarge(req: Request, maxBytes = DEFAULT_REQUEST_LIMIT_BYTES): boolean {
  const len = req.headers.get("content-length");
  if (!len) return false; // chunked — the post-parse caps still apply
  const n = Number(len);
  return Number.isFinite(n) && n > maxBytes;
}

export interface StoredUpload {
  key: string;
  filename: string;
  contentType: string;
  bytes: number;
}

/** Routes catch this and answer jsonErr("UNSUPPORTED_MEDIA_TYPE", reason, { reason }). */
export class UnsupportedMediaTypeError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "UnsupportedMediaTypeError";
  }
}

/** Magic-byte sniff ONLY — the declared Content-Type is never trusted. (book MA2 item 2) */
export function sniffMime(
  b: Uint8Array
): "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50 // "WEBP"
  )
    return "image/webp";
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "application/pdf"; // "%PDF"
  return null;
}

function safeName(name: string): string {
  const base = (name || "file").split(/[\\/]/).pop() ?? "file";
  return (base.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "file");
}

/** Endpoint-specific upload policy (audit finding #16/#MIME): photo-only
 *  endpoints pass `allowedMime` without application/pdf; every endpoint gets
 *  request-level file-count and total-byte caps. */
export interface UploadPolicy {
  allowedMime?: Array<"image/jpeg" | "image/png" | "image/webp" | "application/pdf">;
  maxFiles?: number;
  maxTotalBytes?: number;
}

export const PHOTO_POLICY: UploadPolicy = {
  allowedMime: ["image/jpeg", "image/png", "image/webp"],
  maxFiles: 5,
  maxTotalBytes: 20 * 1024 * 1024, // 20 MB per request
};

// single optional purchase-proof file (≤10 MB) + small form fields
const PROOF_REQUEST_LIMIT_BYTES = 12 * 1024 * 1024;

export function requestLimitMessage(maxBytes: number): string {
  return `request body exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit`;
}

export { PROOF_REQUEST_LIMIT_BYTES };

/** Validates (sniff + size) and stores one file; returns the MinIO object key + metadata. */
export async function storeUpload(
  file: File,
  prefix: string,
  policy?: UploadPolicy
): Promise<StoredUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new UnsupportedMediaTypeError("empty file");
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UnsupportedMediaTypeError("file exceeds the 10 MB limit");
  }
  const contentType = sniffMime(bytes);
  if (!contentType) {
    throw new UnsupportedMediaTypeError(
      "unsupported file type — only JPEG, PNG, WEBP or PDF are accepted (magic-byte sniff failed)"
    );
  }
  if (policy?.allowedMime && !policy.allowedMime.includes(contentType)) {
    throw new UnsupportedMediaTypeError(
      `file type ${contentType} is not accepted for this field`
    );
  }
  await ensureBucket();
  const key = `${prefix}/${randomUUID()}/${safeName(file.name)}`;
  await putObject(key, bytes, contentType);
  return { key, filename: file.name, contentType, bytes: bytes.byteLength };
}

/** Stores many files; the first bad file rejects (routes map it to 415).
 *  Enforces the request-level caps BEFORE reading file content into memory
 *  where possible (count + declared sizes), then re-checks the running total. */
export async function storeUploads(
  files: File[],
  prefix: string,
  policy?: UploadPolicy
): Promise<StoredUpload[]> {
  if (policy?.maxFiles !== undefined && files.length > policy.maxFiles) {
    throw new UnsupportedMediaTypeError(`too many files — max ${policy.maxFiles} per request`);
  }
  const declaredTotal = files.reduce((sum, f) => sum + f.size, 0);
  if (policy?.maxTotalBytes !== undefined && declaredTotal > policy.maxTotalBytes) {
    throw new UnsupportedMediaTypeError(
      `upload too large — max ${Math.round(policy.maxTotalBytes / (1024 * 1024))} MB per request`
    );
  }
  const out: StoredUpload[] = [];
  let total = 0;
  for (const file of files) {
    const stored = await storeUpload(file, prefix, policy);
    total += stored.bytes;
    if (policy?.maxTotalBytes !== undefined && total > policy.maxTotalBytes) {
      throw new UnsupportedMediaTypeError(
        `upload too large — max ${Math.round(policy.maxTotalBytes / (1024 * 1024))} MB per request`
      );
    }
    out.push(stored);
  }
  return out;
}

/** Pulls File objects out of a FormData entry ("photos[]" style multi-file fields). */
export function filesFromForm(form: FormData, field: string): File[] {
  return form.getAll(field).filter((v): v is File => v instanceof File && v.size > 0);
}
