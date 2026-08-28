import { jsonOk } from "@/packages/shared/api";

export async function GET() {
  return jsonOk({
    openapi: "3.0.0",
    info: { title: "PRAMANAM API", version: "stub" },
  });
}