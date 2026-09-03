// S6 MANUAL CHECK (run: npx tsx workers/expiry-manual-check.ts)
// PRD #6/#7 gates on live PostgreSQL (synthetic EXPIRYCHK- rows, fully deleted):
//  1. T-30 crossing: ACTIVE cert validUntil=+20d -> EXPIRING_SOON + one REMINDER_T30 to owner.
//  2. EXPIRED crossing: EXPIRING_SOON cert validUntil=-5d -> EXPIRED + one
//     notification to owner AND one to the district LMO.
//  3. Audit: every flip row carries actorKind "system:bullmq".
//  4. Idempotency BY DESIGN: second sweep -> { flipped: 0, reminders: 0 },
//     and no duplicate notification rows exist.
import fs from "node:fs";

(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { db } from "../lib/db";
import { runExpirySweep } from "./expiry-scan";

const DAY_MS = 86_400_000;
const TAG = "EXPIRYCHK";

let failed = false;
function gate(name: string, ok: boolean, detail: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}`, ok ? JSON.stringify(detail) : detail);
  if (!ok) failed = true;
}

async function main() {
  // --- synthetic fixture: owner trader + district LMO + instrument + application
  const owner = await db.user.create({
    data: { name: "expirychk trader", email: `${TAG.toLowerCase()}-trader@test.in`, passwordHash: "x", role: "TRADER", district: "Guntur" },
  });
  const lmo = await db.user.create({
    data: { name: "expirychk lmo", email: `${TAG.toLowerCase()}-lmo@test.in`, passwordHash: "x", role: "LMO", district: "Guntur" },
  });
  const instrument = await db.instrument.create({
    data: { ownerId: owner.id, category: "COUNTER_SCALE", make: "Essae", model: "DS-415", serialNumber: `${TAG}-SN-1`, capacity: "15kg", district: "Guntur", address: "test" },
  });
  const app1 = await db.application.create({
    data: { instrumentId: instrument.id, traderId: owner.id, type: "NEW", status: "CERT_ISSUED" },
  });
  const app2 = await db.application.create({
    data: { instrumentId: instrument.id, traderId: owner.id, type: "RE_VERIFICATION", status: "CERT_ISSUED" },
  });
  const now = Date.now();
  const cert1 = await db.certificate.create({
    data: { certId: "PRM-CERT-EXPIRYCHK-1", applicationId: app1.id, instrumentId: instrument.id, issuedById: lmo.id, issuedByKind: "LMO", payloadJws: "chk", qrPayload: "chk", status: "ACTIVE", validFrom: new Date(now - 10 * DAY_MS), validUntil: new Date(now + 20 * DAY_MS) },
  });
  const cert2 = await db.certificate.create({
    data: { certId: "PRM-CERT-EXPIRYCHK-2", applicationId: app2.id, instrumentId: instrument.id, issuedById: lmo.id, issuedByKind: "LMO", payloadJws: "chk", qrPayload: "chk", status: "EXPIRING_SOON", validFrom: new Date(now - 380 * DAY_MS), validUntil: new Date(now - 5 * DAY_MS) },
  });

  try {
    // --- gate 1+2+3: one sweep flips both + reminds
    const s1 = await runExpirySweep(new Date(now));
    const c1 = await db.certificate.findUnique({ where: { id: cert1.id } });
    const c2 = await db.certificate.findUnique({ where: { id: cert2.id } });
    gate("T-30 crossing ACTIVE→EXPIRING_SOON", c1?.status === "EXPIRING_SOON", c1?.status);
    gate("EXPIRED crossing EXPIRING_SOON→EXPIRED", c2?.status === "EXPIRED", c2?.status);
    gate("sweep#1 flips==2", s1.flipped === 2, s1);
    // Count is data-dependent: EXPIRED fans out to owner + EVERY district LMO
    // (bulk seed creates several Guntur LMOs), so only floor-assert here — the
    // exact per-recipient structure is asserted by the two gates below.
    gate("sweep#1 reminders>=3 (owner T30 + owner/LMO EXPIRED)", s1.reminders >= 3, s1);

    const notes = await db.notification.findMany({ where: { userId: { in: [owner.id, lmo.id] } } });
    gate("REMINDER_T30 to owner only", notes.filter((n) => n.kind === "REMINDER_T30").length === 1 && notes.find((n) => n.kind === "REMINDER_T30")?.userId === owner.id, notes.map((n) => `${n.kind}:${n.userId === owner.id ? "owner" : "lmo"}`));
    gate("EXPIRED to owner + district LMO", notes.filter((n) => n.kind === "EXPIRED").length === 2 && notes.filter((n) => n.kind === "EXPIRED").some((n) => n.userId === lmo.id), notes.filter((n) => n.kind === "EXPIRED").map((n) => n.userId));

    const audits = await db.auditLog.findMany({ where: { entity: "certificate", entityId: { in: [cert1.certId, cert2.certId] } } });
    gate("audit flips carry actorKind system:bullmq", audits.length === 2 && audits.every((a) => a.actorKind === "system:bullmq"), audits.map((a) => `${a.action}:${a.actorKind}`));

    // --- gate 4: rerun converges, no duplicates
    const s2 = await runExpirySweep(new Date(now));
    gate("rerun { flipped:0, reminders:0 }", s2.flipped === 0 && s2.reminders === 0, s2);
    const notesAgain = await db.notification.findMany({ where: { userId: { in: [owner.id, lmo.id] } } });
    gate("no duplicate notifications", notesAgain.length === 3, notesAgain.length);
    const auditsAgain = await db.auditLog.findMany({ where: { entity: "certificate", entityId: { in: [cert1.certId, cert2.certId] } } });
    gate("no duplicate audit flips", auditsAgain.length === 2, auditsAgain.length);
  } finally {
    // --- cleanup (children first). Notifications are matched by title too:
    // the EXPIRED fan-out addresses EVERY district LMO, not just fixture users.
    await db.notification.deleteMany({ where: { userId: { in: [owner.id, lmo.id] } } });
    await db.notification.deleteMany({ where: { title: { contains: "PRM-CERT-EXPIRYCHK" } } });
    await db.auditLog.deleteMany({ where: { entity: "certificate", entityId: { in: [cert1.certId, cert2.certId] } } });
    await db.certificate.deleteMany({ where: { certId: { startsWith: "PRM-CERT-EXPIRYCHK" } } });
    await db.application.deleteMany({ where: { id: { in: [app1.id, app2.id] } } });
    await db.instrument.delete({ where: { id: instrument.id } });
    await db.user.delete({ where: { id: owner.id } });
    await db.user.delete({ where: { id: lmo.id } });
    console.log("cleanup: synthetic EXPIRYCHK rows deleted");
  }

  console.log(failed ? "RESULT: FAIL" : "RESULT: ALL GATES GREEN");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
