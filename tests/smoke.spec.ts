// tests/smoke.spec.ts — PRD §14 demo-critical path over HTTP (plain fetch):
// login seeded trader → create instrument (+photo) → apply NEW → pay → submit
// (auto-allocate) → officer check-in → inspection PASS → Certificate ACTIVE row
// → public badge verdict VALID.
// Deterministic: polls with timeouts, no fixed sleeps. Needs the dev server
// running against a freshly pushed+seeded DB (see README "Demo walkthrough").
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { auth, call, expectServerUp, jsonInit, login, until } from "./helpers";

vi.setConfig({ testTimeout: 20000 });

const db = new PrismaClient();
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("PRD §14 demo-critical path (HTTP)", () => {
  // serial+district is UNIQUE — timestamp keeps reruns conflict-free on a shared DB
  const serial = `SMOKE-${Date.now()}`;
  let traderToken = "";
  let officerToken = "";
  let instrumentId = "";
  let applicationId = "";
  let scheduleId = "";
  let certId = "";

  beforeAll(async () => {
    await expectServerUp();
    traderToken = await login("ravi@demo.in");
    officerToken = await login("lmo.guntur@demo.in");
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("creates an instrument with a photo proof", async () => {
    const form = new FormData();
    form.append("category", "COUNTER_SCALE");
    form.append("make", "Cas");
    form.append("model", "ER-Plus-Smoke");
    form.append("serialNumber", serial);
    form.append("capacity", "150kg");
    form.append("district", "Guntur");
    form.append("address", "Smoke Test Lane, Guntur");
    form.append("purchaseProof", new Blob([PNG_1PX], { type: "image/png" }), "proof.png");
    const { status, body } = await call<{ id: string }>("/api/v1/instruments", {
      method: "POST",
      headers: auth(traderToken),
      body: form,
    });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    instrumentId = body.data!.id;
    expect(instrumentId).toBeTruthy();
  });

  it("applies NEW, pays, submits → auto-allocated SCHEDULED", async () => {
    const apply = await call<{ id: string; status: string }>("/api/v1/applications", {
      ...jsonInit(traderToken, "POST", {
        instrumentId,
        type: "NEW",
        // today → the auto-allocated slot falls inside the check-in window (-2h/+8h)
        preferredDate: new Date().toISOString(),
      }),
    });
    expect(apply.body.ok).toBe(true);
    applicationId = apply.body.data!.id;
    expect(apply.body.data!.status).toBe("DRAFT");

    const pay = await call<{ receiptId: string }>(`/api/v1/applications/${applicationId}/pay`, {
      method: "POST",
      headers: auth(traderToken),
    });
    expect(pay.body.ok).toBe(true);
    expect(pay.body.data!.receiptId).toMatch(/^RCP-/);

    const submit = await call<{ status: string }>(`/api/v1/applications/${applicationId}/submit`, {
      ...jsonInit(traderToken, "POST", { declarationAccepted: true }),
    });
    expect(submit.body.ok).toBe(true);
    expect(submit.body.data!.status).toBe("SCHEDULED");
  });

  it("officer sees the job in /schedule/mine and checks in", async () => {
    const mine = await call<{ id: string; applicationId: string; status: string }[]>(
      "/api/v1/schedule/mine",
      { headers: auth(officerToken) }
    );
    expect(mine.body.ok).toBe(true);
    const job = mine.body.data!.find((s) => s.applicationId === applicationId);
    expect(job).toBeDefined();
    expect(job!.status).toBe("ASSIGNED");
    scheduleId = job!.id;

    const checkin = await call<{ status: string }>(
      "/api/v1/schedule/checkin",
      jsonInit(officerToken, "POST", { scheduleId })
    );
    expect(checkin.body.ok).toBe(true);
    expect(checkin.body.data!.status).toBe("CHECKED_IN");
  });

  it("inspection PASS issues a certificate (hook) → application CERT_ISSUED", async () => {
    const form = new FormData();
    form.append("scheduleId", scheduleId);
    form.append("result", "PASS");
    form.append(
      "observations",
      JSON.stringify({
        stamp_legible: true,
        zero_error: true,
        no_tamper: true,
        stamping_area: true,
        remarks: "smoke test",
      })
    );
    form.append("gpsLat", "16.3067");
    form.append("gpsLng", "80.4365");
    form.append("photos", new Blob([PNG_1PX], { type: "image/png" }), "field.png");
    const { body } = await call<{ id: string; result: string }>("/api/v1/inspections", {
      method: "POST",
      headers: auth(officerToken),
      body: form,
    });
    expect(body.ok).toBe(true);
    expect(body.data!.result).toBe("PASS");

    // The PASS hook issues the certificate (issueCertificate never throws upward),
    // so poll the DB row instead of trusting the response.
    const cert = await until(
      () => db.certificate.findFirst({ where: { applicationId } }),
      { label: "Certificate row after inspection PASS" }
    );
    expect(cert.status).toBe("ACTIVE");
    expect(cert.certId).toMatch(/^PRM-CERT-2026-/);
    expect(cert.payloadJws.split(".")).toHaveLength(3);
    certId = cert.certId;

    // SMV1: workers/index.ts completes the lifecycle PASSED→CERT_ISSUED moments
    // after the route commits PASSED (detached post-hook poller), so poll the DB
    // instead of racing a single read.
    const issuedApp = await until(
      () => db.application.findFirst({ where: { id: applicationId, status: "CERT_ISSUED" } }),
      { label: "Application status CERT_ISSUED after PASS" }
    );
    expect(issuedApp.status).toBe("CERT_ISSUED");

    // owner notification row written directly by lib/crypto/issue.ts.
    // NOTE: scoped to THIS certId — tests/audit.spec.ts runs in parallel against
    // the same live server+DB and writes its own CERT_ISSUED notifications, so an
    // unscoped "newest row" lookup is racy (picks the audit suite's cert). The
    // notification body always embeds the certId, so filter on it.
    const note = await until(
      () =>
        db.notification.findFirst({
          where: { kind: "CERT_ISSUED", body: { contains: certId } },
          orderBy: { createdAt: "desc" },
        }),
      { label: `owner CERT_ISSUED notification for ${certId}` },
    );
    expect(note!.body).toContain(certId);

    // transactional PASS (audit finding #4): exactly one inspection report and
    // exactly one certificate exist for this application
    const [reportCount, certCount] = await Promise.all([
      db.inspectionReport.count({ where: { applicationId } }),
      db.certificate.count({ where: { applicationId } }),
    ]);
    expect(reportCount).toBe(1);
    expect(certCount).toBe(1);
  });

  it("public badge verdict is VALID with a good signature", async () => {
    const { status, body } = await call<{
      verdict: string;
      signatureValid: boolean;
      anchors: unknown[];
    }>(`/api/v1/public/certificates/${certId}`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data!.verdict).toBe("VALID");
    expect(body.data!.signatureValid).toBe(true);
    expect(body.data!.anchors).toHaveLength(5);
  });
});