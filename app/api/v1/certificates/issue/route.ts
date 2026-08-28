import { MOCK } from "@/packages/shared/mock";
import { jsonOk } from "@/packages/shared/api";

export async function POST() {
  return jsonOk(MOCK.certificates[0]);
}