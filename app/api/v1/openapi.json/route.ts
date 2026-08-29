import { readFileSync } from "node:fs";
import { join } from "node:path";

// book MA4 item 7 — GET /api/v1/openapi.json serves the hand-written OpenAPI 3.0 doc.
const SPEC_PATH = join(process.cwd(), "scripts", "openapi.json");

export async function GET() {
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  return Response.json(spec, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}