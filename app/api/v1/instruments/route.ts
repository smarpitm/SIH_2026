import { MOCK } from "@/packages/shared/mock";
import { jsonOk } from "@/packages/shared/api";

export async function GET() {
  return jsonOk(MOCK.instruments);
}

export async function POST() {
  return jsonOk(MOCK.instruments);
}