import { MOCK } from "@/packages/shared/mock";
import { jsonOk, jsonErr } from "@/packages/shared/api";

export async function GET(
  _req: Request,
  { params }: { params: { certId: string } }
) {
  if (params.certId === MOCK.badge.certId) {
    return jsonOk(MOCK.badge);
  }
  return jsonErr("NOT_FOUND", `No certificate matching '${params.certId}'`);
}