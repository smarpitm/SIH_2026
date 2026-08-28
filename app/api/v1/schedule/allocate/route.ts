import { MOCK } from "@/packages/shared/mock";
import { jsonOk } from "@/packages/shared/api";

export async function POST() {
  return jsonOk(MOCK.schedules[0]);
}