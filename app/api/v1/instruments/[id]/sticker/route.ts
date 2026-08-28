import { jsonErr } from "@/packages/shared/api";

export async function GET() {
  return jsonErr("NOT_FOUND", "sticker pending S3", undefined, 501);
}