import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

// book MA2 item 1 — lib/uploads is a Manav-owned path.
let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const region = "us-east-1"; // MinIO ignores region; SDK requires one
  if (!endpoint || !accessKey || !secretKey) {
    throw new Error("Missing required S3 env (S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY)");
  }
  client = new S3Client({
    endpoint,
    region,
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

/** Idempotent: create the bucket if absent, then set versioning. Runs once per process. */
export function ensureBucket(): Promise<void> {
  ensurePromise ??= (async () => {
    const b = bucket();
    try {
      await s3().send(new HeadBucketCommand({ Bucket: b }));
    } catch {
      await s3().send(new CreateBucketCommand({ Bucket: b }));
    }
    await s3().send(
      new PutBucketVersioningCommand({ Bucket: b, VersioningConfiguration: { Status: "Enabled" } })
    );
  })();
  return ensurePromise;
}

/** Uploads an object, returns the object key. */
export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<string> {
  await ensureBucket();
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType })
  );
  return key;
}
