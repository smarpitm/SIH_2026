// lib/pdf/store.ts (S3 — Smarpit). Versioned certificate/sticker storage in
// MinIO. Own S3 client (deliberately NOT lib/uploads — that's a Manav-owned
// path; this keeps cross-path coupling at zero).
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKey || !secretKey) {
    throw new Error("Missing required S3 env (S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY)");
  }
  client = new S3Client({
    endpoint,
    region: "us-east-1", // MinIO ignores region; SDK requires one
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true, // MinIO is path-style, never virtual-host style
  });
  return client;
}

function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("Missing required S3_BUCKET env");
  return b;
}

let ensurePromise: Promise<void> | null = null;
/** Idempotent: create the bucket if absent. Runs once per process. */
export function ensureBucket(): Promise<void> {
  ensurePromise ??= (async () => {
    const b = bucket();
    try {
      await s3().send(new HeadBucketCommand({ Bucket: b }));
    } catch {
      await s3().send(new CreateBucketCommand({ Bucket: b }));
    }
  })();
  return ensurePromise;
}

/**
 * Puts a rendered PDF at `certs/<certId>/v<N>.pdf` (N = previous max version + 1,
 * so every regeneration is versioned, never overwritten). Stores the certificate
 * status the render was stamped with as object metadata so the download route can
 * detect "status changed since last render" without extra DB columns.
 * Returns the stored key.
 */
export async function putVersionedPdf(
  certId: string,
  pdf: Uint8Array,
  meta: { status: string }
): Promise<string> {
  await ensureBucket();
  // AUDIT FINDING #20: no more hard-coded v1..v50 HeadObject probing. Compute
  // the next version from a real object listing under the cert prefix, paging
  // through if needed — any number of prior renders is handled correctly.
  let maxV = 0;
  const prefix = `certs/${certId}/v`;
  let token: string | undefined;
  do {
    const listed = await s3().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix,
        ...(token ? { ContinuationToken: token } : {}),
      })
    );
    for (const obj of listed.Contents ?? []) {
      const match = (obj.Key ?? "").match(/v(\d+)\.pdf$/);
      if (match) maxV = Math.max(maxV, Number(match[1]));
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  const key = `certs/${certId}/v${maxV + 1}.pdf`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: pdf,
      ContentType: "application/pdf",
      Metadata: { "cert-status": meta.status },
    })
  );
  return key;
}

/**
 * Renders the object at `key` invisible to HeadObject so the next call to
 * putVersionedPdf re-discovers versions from scratch (used by tests only).
 * In practice: delete-probe helper kept private.
 */
export async function headPdfStatus(key: string): Promise<string | null> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return (head.Metadata?.["cert-status"] as string) ?? null;
  } catch {
    return null;
  }
}

/** Presigned GET url, default 300s per DECISION DOC. */
export async function getPresignedGetUrl(key: string, expiresSeconds = 300): Promise<string> {
  await ensureBucket();
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: expiresSeconds }
  );
}