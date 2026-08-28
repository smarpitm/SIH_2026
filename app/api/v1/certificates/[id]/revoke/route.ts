import { jsonOk } from "@/packages/shared/api";

export async function POST() {
  return jsonOk({ revoked: true });
}