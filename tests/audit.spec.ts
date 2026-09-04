// tests/audit.spec.ts — regression tests for the PROJECT_AUDIT.md fixes that
// the original suites did not cover:
//   1. /certificates/issue authorizes (assigned officer / admin) BEFORE the
//      idempotent "return existing certificate" branch — an unrelated officer
//      in the same district must get AUTH_FORBIDDEN, not certificate data.
//   2. Invite credentials are unique one-time passwords, mustChangePassword is
//      surfaced on login, and change-password clears it (old password dies).
//   3. Refresh-token replay detection lives in the durable RefreshFamily rows —
//      presenting an already-consumed token revokes the whole family.
//   4. Concurrent inspection PASS workflows issue distinct certIds and never
//      strand applications (certificate counter is atomic).
//
// District isolation: everything runs in Krishna (trader laxmi + LMO
// lmo.krishna) and the officer invites also target Krishna. The parallel
// smoke/negative suites drive Guntur accounts, so allocation and login-rate
// budgets never cross. Allocation-heavy tests run BEFORE the officer invites so
// schedules are always assigned to lmo.krishna (the only Krishna officer at
// submit time). Each test creates its own timestamped instruments, so reruns on
// a shared DB never collide with the duplicate-open-application guard.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { auth, call, expectServerUp, jsonInit, login, until } from "./helpers";

vi.setConfig({ testTimeout: 30000 });

const db = new PrismaClient();
const BASE = process.env.PRAMANAM_TEST_URL || "http://localhost:3000";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let traderToken = ""; // laxmi@demo.in (Krishna trader)
let officerToken = ""; // lmo.krishna@demo.in
let adminToken = "";

// invited officers created during this run — removed in afterAll so reruns never
// leave extra Krishna LMOs behind to capture future auto-allocations (the
// allocator picks the least-loaded officer, so a stale rival would steal jobs
// away from lmo.krishna on the next run)
const invitedOfficerIds: string[] = [];

beforeAll(async () => {
  await expectServerUp();
  traderToken = await login("laxmi@demo.in");
  officerToken = await login("lmo.krishna@demo.in");
  adminToken = await login("admin@demo.in");
});

afterAll(async () => {
  if (invitedOfficerIds.length > 0) {
    // delete schedules first (schedule.assigneeId references the user), then
    // families + audit rows + the users themselves
    await db.schedule.deleteMany({ where: { assigneeId: { in: invitedOfficerIds } } });
    await db.refreshFamily.deleteMany({ where: { userId: { in: invitedOfficerIds } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: invitedOfficerIds } } });
    await db.user.deleteMany({ where: { id: { in: invitedOfficerIds } } });
  }
  await db.$disconnect();
});

async function inviteKrishnaOfficer(name: string, email: string): Promise<string> {
  const invite = await call<{ tempPassword: string; user: { id: string } }>(
    "/api/v1/auth/invite",
    jsonInit(adminToken, "POST", {
      name,
      email,
      role: "LMO",
      district: "Krishna",
      orgName: "Audit Verification Office",
    })
  );
  expect(invite.body.ok).toBe(true);
  invitedOfficerIds.push(invite.body.data!.user.id);
  return invite.body.data!.tempPassword;
}

async function createInstrument(tag: string): Promise<string> {
  const form = new FormData();
  form.append("category", "COUNTER_SCALE");
  form.append("make", "Cas");
  form.append("model", "ER-Plus-Audit");
  form.append("serialNumber", `AUD-${Date.now()}-${tag}`);
  form.append("capacity", "150kg");
  form.append("district", "Krishna");
  form.append("address", "Audit Test Lane, Krishna");
  form.append("purchaseProof", new Blob([PNG_1PX], { type: "image/png" }), "proof.png");
  const { status, body } = await call<{ id: string }>("/api/v1/instruments", {
    method: "POST",
    headers: auth(traderToken),
    body: form,
  });
  expect(status).toBe(200);
  expect(body.ok).toBe(true);
  return body.data!.id;
}

/** DRAFT -> paid -> submitted (auto-allocated to lmo.krishna) on a fresh
 *  Krishna instrument. Returns the application id. */
async function createSubmittedApplication(tag: string): Promise<string> {
  const instrumentId = await createInstrument(tag);
  const apply = await call<{ id: string }>("/api/v1/applications", {
    ...jsonInit(traderToken, "POST", {
      instrumentId,
      type: "NEW",
      preferredDate: new Date().toISOString(),
    }),
  });
  expect(apply.body.ok).toBe(true);
  const applicationId = apply.body.data!.id;

  const pay = await call(`/api/v1/applications/${applicationId}/pay`, {
    method: "POST",
    headers: auth(traderToken),
  });
  expect(pay.body.ok).toBe(true);

  const submit = await call(`/api/v1/applications/${applicationId}/submit`, {
    ...jsonInit(traderToken, "POST", { declarationAccepted: true }),
  });
  expect(submit.body.ok).toBe(true);
  return applicationId;
}

async function checkIn(applicationId: string): Promise<string> {
  const mine = await call<{ id: string; applicationId: string; status: string }[]>("/api/v1/schedule/mine", {
    headers: auth(officerToken),
  });
  expect(mine.body.ok).toBe(true);
  const job = mine.body.data!.find((s) => s.applicationId === applicationId);
  expect(job).toBeDefined();
  const scheduleId = job!.id;
  const checkin = await call<{ status: string }>(
    "/api/v1/schedule/checkin",
    jsonInit(officerToken, "POST", { scheduleId })
  );
  expect(checkin.body.ok).toBe(true);
  expect(checkin.body.data!.status).toBe("CHECKED_IN");
  return scheduleId;
}

async function passInspection(scheduleId: string): Promise<void> {
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
      remarks: "audit regression",
    })
  );
  form.append("gpsLat", "16.3067");
  form.append("gpsLng", "80.4365");
  form.append("photos", new Blob([PNG_1PX], { type: "image/png" }), "field.png");
  const { body } = await call<{ result: string }>("/api/v1/inspections", {
    method: "POST",
    headers: auth(officerToken),
    body: form,
  });
  expect(body.ok).toBe(true);
  expect(body.data!.result).toBe("PASS");
}

/** Full Krishna lifecycle: fresh instrument -> application -> payment -> submit
 *  -> check-in -> inspection PASS -> certificate ACTIVE + app CERT_ISSUED. */
async function runFullKrishnaFlow(tag: string): Promise<{ applicationId: string; certId: string }> {
  const applicationId = await createSubmittedApplication(tag);
  const scheduleId = await checkIn(applicationId);
  await passInspection(scheduleId);

  const cert = await until(
    () => db.certificate.findFirst({ where: { applicationId } }),
    { label: `Certificate row after PASS (${tag})` }
  );
  expect(cert.status).toBe("ACTIVE");
  expect(cert.certId).toMatch(/^PRM-CERT-2026-/);

  const app = await until(
    () => db.application.findFirst({ where: { id: applicationId, status: "CERT_ISSUED" } }),
    { label: `Application CERT_ISSUED (${tag})` }
  );
  expect(app.status).toBe("CERT_ISSUED");
  return { applicationId, certId: cert.certId };
}

describe("PROJECT_AUDIT regression battery", () => {
  // Runs FIRST — while lmo.krishna is still the only Krishna officer, so both
  // schedules deterministically land with him even though the two submissions
  // and inspections run concurrently.
  it("concurrent PASS inspections issue distinct certIds and strand no applications", async () => {
    const a = await createSubmittedApplication("concA");
    const b = await createSubmittedApplication("concB");

    const [scheduleA, scheduleB] = await Promise.all([checkIn(a), checkIn(b)]);

    // fire both inspection PASS workflows at the same time
    await Promise.all([passInspection(scheduleA), passInspection(scheduleB)]);

    const certA = await until(() => db.certificate.findFirst({ where: { applicationId: a } }), {
      label: "cert A",
    });
    const certB = await until(() => db.certificate.findFirst({ where: { applicationId: b } }), {
      label: "cert B",
    });
    expect(certA.status).toBe("ACTIVE");
    expect(certB.status).toBe("ACTIVE");
    // the atomic CertCounter guarantees unique ids under concurrency (finding #3)
    expect(certA.certId).not.toBe(certB.certId);

    const appA = await until(
      () => db.application.findFirst({ where: { id: a, status: "CERT_ISSUED" } }),
      { label: "app A CERT_ISSUED" }
    );
    const appB = await until(
      () => db.application.findFirst({ where: { id: b, status: "CERT_ISSUED" } }),
      { label: "app B CERT_ISSUED" }
    );
    expect(appA.status).toBe("CERT_ISSUED");
    expect(appB.status).toBe("CERT_ISSUED");

    // exactly one report + one certificate per application (finding #4)
    const [reportsA, reportsB, certsA, certsB] = await Promise.all([
      db.inspectionReport.count({ where: { applicationId: a } }),
      db.inspectionReport.count({ where: { applicationId: b } }),
      db.certificate.count({ where: { applicationId: a } }),
      db.certificate.count({ where: { applicationId: b } }),
    ]);
    expect(reportsA).toBe(1);
    expect(reportsB).toBe(1);
    expect(certsA).toBe(1);
    expect(certsB).toBe(1);
  });

  it("unrelated same-district officer cannot read an existing certificate via POST /certificates/issue", async () => {
    // seed a fully issued Krishna certificate FIRST — while lmo.krishna is the
    // only Krishna officer, so he is provably the assigned inspector
    const { applicationId, certId } = await runFullKrishnaFlow("authz");

    // now invite rival LMOs into the SAME district (never assigned to this app)
    const suffix = Date.now();
    const rivalEmail = `lmo.rival${suffix}@demo.in`;
    const temp1 = await inviteKrishnaOfficer("Rival LMO", rivalEmail);

    // a second invite yields a DIFFERENT one-time credential (finding #6)
    const temp2 = await inviteKrishnaOfficer("Rival LMO 2", `lmo.rival2${suffix}@demo.in`);
    expect(temp1).not.toBe(temp2);
    expect(temp1.length).toBeGreaterThanOrEqual(8);
    expect(/\d/.test(temp1)).toBe(true);

    // the invited officer can log in and sees mustChangePassword until rotation
    const rivalLogin = await call<{ accessToken: string }>("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: rivalEmail, password: temp1 }),
    });
    expect(rivalLogin.body.ok).toBe(true);
    expect(rivalLogin.body.data).toMatchObject({ mustChangePassword: true });
    const rivalToken = rivalLogin.body.data!.accessToken;

    // rival is Krishna (jurisdiction passes) but never assigned -> AUTH_FORBIDDEN,
    // and crucially NO certificate payload may leak (finding #1/#28: authorize
    // BEFORE the idempotent existing-certificate return)
    const { status, body } = await call<{ certId: string }>(
      "/api/v1/certificates/issue",
      jsonInit(rivalToken, "POST", { applicationId })
    );
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error!.code).toBe("AUTH_FORBIDDEN");
    expect(body.data).toBeUndefined();

    // sanity: the certificate existed, so pre-fix this call would have returned it
    const cert = await db.certificate.findUnique({ where: { applicationId } });
    expect(cert!.certId).toBe(certId);
  });

  it("change-password clears mustChangePassword and kills the one-time credential", async () => {
    const email = `lmo.rotate${Date.now()}@demo.in`;
    const temp = await inviteKrishnaOfficer("Rotating LMO", email);

    const first = await call<{ accessToken: string }>("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: temp }),
    });
    expect(first.body.data).toMatchObject({ mustChangePassword: true });
    const token = first.body.data!.accessToken;

    const rotated = await call(
      "/api/v1/auth/change-password",
      jsonInit(token, "POST", { currentPassword: temp, newPassword: "FreshOfficer2026!" })
    );
    expect(rotated.body.ok).toBe(true);

    const second = await call<{ accessToken: string; mustChangePassword?: boolean }>("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "FreshOfficer2026!" }),
    });
    expect(second.body.ok).toBe(true);
    expect(second.body.data!.mustChangePassword).toBeUndefined();

    // the old one-time credential no longer works
    const stale = await call("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: temp }),
    });
    expect(stale.status).toBe(401);
    expect(stale.body.ok).toBe(false);
  });

  it("refresh-token replay revokes the durable family (old and newest tokens both die)", async () => {
    const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "laxmi@demo.in", password: "Passw0rd!demo" }),
    });
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    const first = setCookie.match(/pm_refresh=([^;]+)/)?.[1];
    expect(first).toBeTruthy();

    const refresh = async (cookie: string) =>
      fetch(`${BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { cookie: `pm_refresh=${cookie}` },
      });

    // legitimate rotation: gen 0 consumed -> gen 1 issued
    const ok = await refresh(first!);
    expect(ok.status).toBe(200);
    const second = (ok.headers.get("set-cookie") ?? "").match(/pm_refresh=([^;]+)/)?.[1];
    expect(second).toBeTruthy();

    // replaying the ALREADY-USED gen 0 token is reuse -> whole family revoked
    const replay = await refresh(first!);
    expect(replay.status).toBe(401);
    const replayBody = (await replay.json()) as { ok: boolean; error?: { code: string } };
    expect(replayBody.ok).toBe(false);
    expect(replayBody.error!.code).toBe("AUTH_REQUIRED");

    // even the newest (gen 1) token of the revoked family is now dead
    const afterRevoke = await refresh(second!);
    expect(afterRevoke.status).toBe(401);
  });
});
