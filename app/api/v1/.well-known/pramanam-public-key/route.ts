import { jsonOk } from "@/packages/shared/api";

export async function GET() {
  return jsonOk({ kty: "OKP", stub: true });
}