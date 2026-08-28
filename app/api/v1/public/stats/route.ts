import { jsonOk } from "@/packages/shared/api";

export async function GET() {
  return jsonOk({ totalInstruments: 3, activeCerts: 1 });
}