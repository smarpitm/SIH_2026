// tests/negative.spec.ts — negative battery over HTTP, asserting the exact
// { ok: false, error: { code, ... } } envelope on every case.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { auth, call, expectServerUp, jsonInit, login } from "./helpers";

vi.setConfig({ testTimeout: 20000 });

const db = new PrismaClient();
let traderToken = "";
let krishnaLmoToken = "";
let adminToken = "";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Creates a fresh Guntur instrument owned by the trader, so reruns on a shared
 *  DB never collide with the duplicate-open-application guard (an instrument may
 *  have at most one non-terminal application) or leftover rows from past runs. */
async function createGunturInstrument(serialSuffix: string): Promise<string> {
  const form = new FormData();
  form.append("category", "COUNTER_SCALE");
  form.append("make", "Cas");
  form.append("model", "Neg-Battery");
  form.append("serialNumber", `NEG-${Date.now()}-${serialSuffix}`);
  form.append("capacity", "100kg");
  form.append("district", "Guntur");
  form.append("address", "Negative Battery Rd, Guntur");
  form.append("purchaseProof", new Blob([PNG_1PX], { type: "image/png" }), "proof.png");
  const { body } = await call<{ id: string }>("/api/v1/instruments", {
    method: "POST",
    headers: auth(traderToken),
    body: form,
  });
  if (!body.ok) throw new Error(`instrument create failed: ${JSON.stringify(body)}`);
  return body.data!.id;
}

beforeAll(async () => {
  await expectServerUp();
  traderToken = await login("ravi@demo.in");
  krishnaLmoToken = await login("lmo.krishna@demo.in");
  adminToken = await login("admin@demo.in");
});

afterAll(async () => {
  await db.$disconnect();
});

describe("negative battery (error envelopes)", () => {
  let gunturApplicationId = "";

  it("cross-district LMO fetch → JURISDICTION_FORBIDDEN", async () => {
    // Create a fresh Guntur instrument + DRAFT application of our own rather than
    // reusing a seeded instrument: POST /applications now rejects a second open
    // application per instrument, and leftover rows from past runs would otherwise
    // make the create fail with CONFLICT.
    // NOTE: the /applications LIST is district-scoped (WHERE district = mine), so a
    // foreign row can never appear there — the per-row jurisdiction gate fires on the
    // DETAIL fetch, GET /applications/{id} (scopeApplication), which is the demo's
    // cross-district surface.
    const instrumentId = await createGunturInstrument("xdistrict");
    const apply = await call<{ id: string }>("/api/v1/applications", {
      ...jsonInit(traderToken, "POST", { instrumentId, type: "NEW" }),
    });
    expect(apply.body.ok).toBe(true);
    gunturApplicationId = apply.body.data!.id;

    const { status, body } = await call(`/api/v1/applications/${gunturApplicationId}`, {
      headers: auth(krishnaLmoToken),
    });
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error!.code).toBe("JURISDICTION_FORBIDDEN");
    expect(body.error!.details).toMatchObject({ required: "district:Guntur", have: "district:Krishna" });
  });

  it("forced issue on a not-PASSED application → INVALID_STATE_TRANSITION", async () => {
    // Pay + submit the DRAFT app: submit auto-allocates, so SUBMITTED is transient
    // (DRAFT→SUBMITTED→SCHEDULED inside one request) and the app rests in SCHEDULED.
    // A forced CERT_ISSUED attempt is the API's only status-forcing surface —
    // /certificates/issue — and must refuse with the exact { from, to } shape.
    const pay = await call(`/api/v1/applications/${gunturApplicationId}/pay`, {
      method: "POST",
      headers: auth(traderToken),
    });
    expect(pay.body.ok).toBe(true);
    const submit = await call(`/api/v1/applications/${gunturApplicationId}/submit`, {
      ...jsonInit(traderToken, "POST", { declarationAccepted: true }),
    });
    expect(submit.body.ok).toBe(true);

    const { status, body } = await call<{ applicationId: string }>(
      "/api/v1/certificates/issue",
      jsonInit(adminToken, "POST", { applicationId: gunturApplicationId })
    );
    expect(status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error!.code).toBe("INVALID_STATE_TRANSITION");
    expect(body.error!.details).toMatchObject({ to: "CERT_ISSUED" });
    expect((body.error!.details as { from: string }).from).not.toBe("CERT_ISSUED");
  });

  it("text file renamed .jpg → UNSUPPORTED_MEDIA_TYPE (magic-byte sniff)", async () => {
    const form = new FormData();
    form.append("category", "COUNTER_SCALE");
    form.append("make", "Acme");
    form.append("model", "Neg");
    form.append("serialNumber", `NEG-${Date.now()}`);
    form.append("capacity", "100kg");
    form.append("district", "Guntur");
    form.append("address", "Negative Battery Rd, Guntur");
    form.append(
      "purchaseProof",
      new Blob([Buffer.from("this is definitely not a jpeg")], { type: "image/jpeg" }),
      "proof.jpg"
    );
    const { status, body } = await call("/api/v1/instruments", {
      method: "POST",
      headers: auth(traderToken),
      body: form,
    });
    expect(status).toBe(415);
    expect(body.ok).toBe(false);
    expect(body.error!.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});