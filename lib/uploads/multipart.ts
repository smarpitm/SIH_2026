import { randomUUID } from "node:crypto";
import { putObject, ensureBucket } from "./minio";

// book MA2 item 2 — lib/uploads is a Manav-owned path.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file

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

/** Validates (sniff + size) and stores one file; returns the MinIO object key + metadata. */
export async function storeUpload(file: File, prefix: string): Promise<StoredUpload> {
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
  await ensureBucket();
  const key = `${prefix}/${randomUUID()}/${safeName(file.name)}`;
  await putObject(key, bytes, contentType);
  return { key, filename: file.name, contentType, bytes: bytes.byteLength };
}

/** Stores many files; the first bad file rejects (routes map it to 415). */
export async function storeUploads(files: File[], prefix: string): Promise<StoredUpload[]> {
  const out: StoredUpload[] = [];
  for (const file of files) {
    out.push(await storeUpload(file, prefix));
  }
  return out;
}

/** Pulls File objects out of a FormData entry ("photos[]" style multi-file fields). */
export function filesFromForm(form: FormData, field: string): File[] {
  return form.getAll(field).filter((v): v is File => v instanceof File && v.size > 0);
}
