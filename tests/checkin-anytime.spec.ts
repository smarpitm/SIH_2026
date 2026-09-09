// tests/checkin-anytime.spec.ts — regression coverage for the check-in flush fix:
//
//  1. POST /schedule/checkin is allowed BEFORE, ON and AFTER the scheduled
//     date. The old [scheduledFor −2h, +8h] window anchored to a stored
//     timestamp made every overdue job permanently uncheckable and blocked
//     early-morning/late-day arrivals. The officer records arrival when they
//     are on site — the scheduled date is a target, not a hard gate.
//  2. A date-only preferredDate pick is stored at business-timezone (IST)
//     midnight — never as a stray 05:30 AM UTC-midnight anchor — so the LMO
//     queue reads the same calendar day everywhere.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { auth, call, expectServerUp, jsonInit, login } from "./helpers";
import { businessDateKey, startOfBusinessDay } from "@/lib/time";

vi.setConfig({ testTimeout: 20000 });

const db = new PrismaClient();
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let traderToken = "";
let officerToken = "";

beforeAll(async () => {
  await expectServerUp();
  traderToken = await login("ravi@demo.in");
  officerToken = await login("lmo.guntur@demo.in");
});

afterAll(async () => {
  await db.$disconnect();
});

/** Creates a Guntur instrument + application for ravi, pays + submits it (auto-
 *  allocates to the Guntur officer) and returns the ids. Timestamp-unique
 *  serial so reruns on a shared DB never collide. */
async function makeScheduledApp(serialSuffix: string, preferredDate?: string) {
  const form = new FormData();
  form.append("category", "COUNTER_SCALE");
  form.append("make", "Cas");
  form.append("model", "Checkin-Anytime");
  form.append("serialNumber", `CKANY-${Date.now()}-${serialSuffix}`);
  form.append("capacity", "100kg");
  form.append("district", "Guntur");
  form.append("address", "Checkin Anytime Rd, Guntur");
  form.append("purchaseProof", new Blob([PNG_1PX], { type: "image/png" }), "proof.png");
  const created = await call<{ id: string }>("/api/v1/instruments", {
    method: "POST",
    headers: auth(traderToken),
    body: form,
  });
  if (!created.body.ok) throw new Error(`instrument create failed: ${JSON.stringify(created.body)}`);

  const createdApp = await call<{ id: string }>("/api/v1/applications", {
    ...jsonInit(traderToken, "POST", {
      instrumentId: created.body.data!.id,
      type: "NEW",
      ...(preferredDate ? { preferredDate } : {}),
    }),
  });
  if (!createdApp.body.ok) throw new Error(`application create failed: ${JSON.stringify(createdApp.body)}`);
  const applicationId = createdApp.body.data!.id;

  const paid = await call(`/api/v1/applications/${applicationId}/pay`, {
    method: "POST",
    headers: auth(traderToken),
  });
  if (!paid.body.ok) throw new Error(`pay failed: ${JSON.stringify(paid.body)}`);

  const submitted = await call<{ status: string }>(`/api/v1/applications/${applicationId}/submit`, {
    ...jsonInit(traderToken, "POST", { declarationAccepted: true }),
  });
  if (!submitted.body.ok || submitted.body.data!.status !== "SCHEDULED") {
    throw new Error(`submit failed: ${JSON.stringify(submitted.body)}`);
  }

  const schedule = await db.schedule.findUniqueOrThrow({ where: { applicationId } });
  return { applicationId, scheduleId: schedule.id };
}

function checkIn(scheduleId: string) {
  return call<{ status: string }>("/api/v1/schedule/checkin", {
    method: "POST",
    headers: auth(officerToken),
    body: JSON.stringify({ scheduleId }),
  });
}

describe("check-in is allowed any time relative to the scheduled date", () => {
  it("accepts check-in when the scheduled date is in the PAST (old +8h window would lock it out)", async () => {
    const { applicationId, scheduleId } = await makeScheduledApp("PAST");
    const past = startOfBusinessDay(new Date(Date.now() - 3 * 86_400_000));
    await db.schedule.update({ where: { id: scheduleId }, data: { scheduledFor: past } });

    const { status, body } = await checkIn(scheduleId);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data!.status).toBe("CHECKED_IN");

    const app = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.status).toBe("CHECKED_IN");
  });

  it("accepts check-in when the scheduled date is in the FUTURE (old -2h window would lock it out)", async () => {
    const { applicationId, scheduleId } = await makeScheduledApp("FUTURE");
    const future = startOfBusinessDay(new Date(Date.now() + 5 * 86_400_000));
    await db.schedule.update({ where: { id: scheduleId }, data: { scheduledFor: future } });

    const { status, body } = await checkIn(scheduleId);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data!.status).toBe("CHECKED_IN");

    const app = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.status).toBe("CHECKED_IN");
  });

  it("stores a date-only preferredDate at IST midnight — never a stray 05:30 AM anchor", async () => {
    // exactly what the trader wizard sends: it picks "YYYY-MM-DD" and posts
    // `${date}T00:00:00.000Z` (UTC midnight = 05:30 IST before this fix)
    const key = businessDateKey(new Date(Date.now() + 30 * 86_400_000));
    const raw = `${key}T00:00:00.000Z`;
    const { applicationId, scheduleId } = await makeScheduledApp("IST", raw);
    const expected = startOfBusinessDay(new Date(raw));

    const app = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(app.preferredDate!.getTime()).toBe(expected.getTime());

    // the auto-allocated slot inherits the exact same IST-midnight instant
    const schedule = await db.schedule.findUniqueOrThrow({ where: { id: scheduleId } });
    expect(schedule.scheduledFor.getTime()).toBe(expected.getTime());
  });
});