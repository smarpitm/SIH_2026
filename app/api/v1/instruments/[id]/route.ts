import { MOCK } from "@/packages/shared/mock";
import { jsonOk } from "@/packages/shared/api";

export async function GET() {
  return jsonOk(MOCK.instruments[0]);
}

export async function PATCH() {
  return jsonOk(MOCK.instruments[0]);
}