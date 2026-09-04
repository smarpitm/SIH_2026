// book MA4 item 7 — GET /api/v1/openapi.json serves the hand-written OpenAPI 3.0 doc.
// AUDIT FINDING #66: the spec is statically imported (resolveJsonModule) so it is
// bundled into the server build — no per-request process.cwd() filesystem read,
// and deployment layouts that do not ship scripts/ still serve the spec.
import spec from "../../../../scripts/openapi.json";

export async function GET() {
  return Response.json(spec, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}