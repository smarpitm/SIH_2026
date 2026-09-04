// workers/expiry-scan.ts (S6 — Smarpit, owned path: workers/**).
// PRD #6 (validity tracking) + #7 (automated reminders) in one nightly ladder sweep.
//
// STATUS LADDER — DELIBERATE DEVIATION, commented per book:
//   The DECISION DOC (§D.1) defines ACTIVE→EXPIRING_SOON at T-90 with a T-90/T-7
//   reminder ladder. For demo clarity the STATUSES stay binary-windowed here:
//   ACTIVE → EXPIRING_SOON at T-30 (single crossing), EXPIRING_SOON → EXPIRED at
//   validUntil. The T-90/T-7 ladder lives on ONLY as reminder-frequency intent;
//   every status flip still produces exactly one notification (REMINDER_T30 /
//   EXPIRED), so the observable behaviour matches the ladder without a third
//   status or per-day re-notifications.
//
// IDEMPOTENCY — BY DESIGN:
//   1. Flips use guarded UPDATE ... WHERE status = <expected>; a rerun finds the
//      row already flipped and the update matches 0 rows (no-op, no double audit,
//      no duplicate reminder).
//   2. Notifications are exactly-once per crossing: we check for an existing
//      Notification with the same (kind, userId, title) before inserting — the
//      title deterministically embeds the certId. (Notification has NO entityId
//      column — prisma/schema.prisma is FROZEN at K0 — so kind+userId+title is
//      the dedupe key. Same guarded-insert pattern lib/crypto/issue.ts uses.)
//
// AUDIT: every flip writes one AuditLog row with actorKind "system:bullmq"
// (actorId null) per the DECISION DOC §D.4.2 attribution rule.
import fs from "node:fs";

// .env must load before ./db executes (Prisma reads DATABASE_URL at client init)
// for STANDALONE `npx tsx` runs ONLY (audit finding #41). In the Next runtime the
// environment is already provided, so this loader becomes a no-op there and can
// never throw for a missing .env during builds/tests/serverless contexts.
(function loadEnvStandalone() {
  if (process.env.DATABASE_URL) return;
  try {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // no .env file — rely on the process environment (deployment-supplied)
  }
})();

import IORedis from "ioredis";
import { Prisma } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import { db } from "@/lib/db";
import { audit } from "@/lib/auth/audit";
import { notificationEnabled } from "@/lib/notify/notifications";

const DAY_MS = 86_400_000;
export const EXPIRY_SCAN_QUEUE = "expiry-scan";
export const T30_DAYS = 30; // single T-30 crossing (see ladder deviation note above)

const KIND_T30 = "REMINDER_T30"; // in the frozen lib/notify kind union
// Notification.kind is a free String column and prisma/schema.prisma is FROZEN,
// so the EXPIRED crossing uses its own kind owned by this module (UI renders
// kind-agnostically per NotificationBell).
const KIND_EXPIRED = "EXPIRED";

export interface SweepResult {
  scanned: number;
  flipped: number;   // status flips performed this sweep (reruns converge to 0)
  reminders: number; // notification rows actually inserted
}

/**
 * One full ladder sweep. Pure Prisma — shared by the BullMQ worker, the admin
 * manual-trigger route, and the standalone tsx run. Reruns converge: guarded
 * `UPDATE ... WHERE status = <expected>` no-ops on already-flipped rows.
 */
export async function runExpirySweep(now: Date = new Date()): Promise<SweepResult> {
  const certs = await db.certificate.findMany({
    where: { status: { in: ["ACTIVE", "EXPIRING_SOON", "EXPIRED"] } },
    select: {
      id: true,
      certId: true,
      status: true,
      validUntil: true,
      instrument: { select: { ownerId: true, district: true } },
    },
  });

  let flipped = 0;
  let reminders = 0;

  for (const cert of certs) {
    const diffMs = cert.validUntil.getTime() - now.getTime();
    const isExpired = diffMs <= 0;
    const daysTo = Math.ceil(diffMs / DAY_MS);

    // Target status based on clock vs validUntil:
    // 1. diffMs <= 0 -> EXPIRED (validity past)
    // 2. daysTo <= T30_DAYS -> EXPIRING_SOON (amber window)
    // 3. daysTo > T30_DAYS -> ACTIVE (green window)
    // AUDIT FINDING #43: expiry is NOT reversible by the sweep — a certificate
    // already marked EXPIRED never re-activates here even if validUntil moves
    // forward (manual/SQL repair must be a separate, explicitly audited action).
    const to: "EXPIRING_SOON" | "EXPIRED" | "ACTIVE" =
      isExpired
        ? "EXPIRED"
        : daysTo <= T30_DAYS
          ? "EXPIRING_SOON"
          : "ACTIVE";

    if (to === cert.status) continue;
    if (cert.status === "EXPIRED" && to === "ACTIVE") continue;

    // Guarded flip — WHERE status = <expected>: concurrent/rerun sweeps lose
    // the race cleanly (count 0) and skip; exactly one sweeper flips a row.
    const res = await db.certificate.updateMany({
      where: { id: cert.id, status: cert.status },
      data: { status: to },
    });
    if (res.count !== 1) continue;
    flipped += 1;

    // AuditLog per flip — actorKind "system:bullmq", actorId null (§D.4.2).
    await audit({
      actorId: null,
      actorKind: "system:bullmq",
      action: "certificate.expiry_flip",
      entity: "certificate",
      entityId: cert.certId,
      meta: { from: cert.status, to, daysTo },
    });

    if (to === "EXPIRING_SOON" || to === "EXPIRED") {
      reminders += await notifyCrossing(cert, to, now);
    }
  }

  return { scanned: certs.length, flipped, reminders };
}

/** Exactly-once reminder(s) for one crossing; returns rows actually inserted. */
async function notifyCrossing(
  cert: {
    certId: string;
    validUntil: Date;
    instrument: { ownerId: string; district: string };
  },
  to: "EXPIRING_SOON" | "EXPIRED",
  now: Date
): Promise<number> {
  const kind = to === "EXPIRING_SOON" ? KIND_T30 : KIND_EXPIRED;
  const untilDay = cert.validUntil.toISOString().slice(0, 10);
  const daysTo = Math.ceil((cert.validUntil.getTime() - now.getTime()) / DAY_MS);
  // Titles are deterministic per cert+crossing so the dedupe query below can
  // key on them (no entityId column — schema frozen).
  const title =
    to === "EXPIRING_SOON"
      ? `Certificate ${cert.certId} expires soon`
      : `Certificate ${cert.certId} EXPIRED`;
  const body =
    to === "EXPIRING_SOON"
      ? `Validity ends ${untilDay} (${daysTo} day(s) left). File a RE_VERIFICATION application to renew before expiry.`
      : `Validity ended ${untilDay}. The instrument must not be used until re-verification — file RE_VERIFICATION now.`;

  const recipients: { id: string }[] = [{ id: cert.instrument.ownerId }];
  if (to === "EXPIRED") {
    // EXPIRED crossing also alerts the district LMO (per book item 2).
    const lmos = await db.user.findMany({
      where: { role: "LMO", district: cert.instrument.district },
      select: { id: true },
    });
    recipients.push(...lmos);
  }

  let inserted = 0;
  for (const r of recipients) {
    // AUDIT FINDING #40: respect the recipient's preference group — a user who
    // turned off expiry reminders gets no EXPIRING_SOON / EXPIRED notice.
    const prefKind = to === "EXPIRING_SOON" ? "REMINDER_T30" : "EXPIRED";
    if (!(await notificationEnabled(db, r.id, prefKind))) continue;

    // AUDIT FINDING #42: race-safe exactly-once inserts. Notification.dedupeKey
    // is UNIQUE (schema updated) — concurrent sweeps that try the same crossing
    // collide on the constraint and the loser's insert is a clean no-op, so no
    // findFirst->create race window exists any more.
    try {
      await db.notification.create({
        data: {
          userId: r.id,
          kind,
          title,
          body,
          dedupeKey: `${kind}:${cert.certId}:${r.id}`,
        },
      });
      inserted += 1;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002" // unique violation — already notified for this crossing
      ) {
        continue;
      }
      throw e;
    }
  }
  return inserted;
}

/**
 * Register the nightly repeatable job + its worker. Called once from
 * registerWorkers(): returns false (graceful skip) when REDIS_URL is unset so
 * `npm run dev` without redis never breaks. Queue/Worker are cached on
 * globalThis (lib/db.ts reflex) so dev hot-reload cannot spawn duplicates.
 */
export function startExpiryQueue(): boolean {
  if (!process.env.REDIS_URL) {
    console.log("[expiry-scan] REDIS_URL not set — BullMQ queue skipped (dev without redis).");
    return false;
  }
  const g = globalThis as unknown as {
    __pramanamExpiryScan?: { queue: Queue; worker: Worker };
  };
  if (g.__pramanamExpiryScan) return true;

  // maxRetriesPerRequest: null is required for blocking connections (worker).
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on("error", (err) =>
    console.error("[expiry-scan] redis connection error (will retry):", err.message)
  );

  const queue = new Queue(EXPIRY_SCAN_QUEUE, { connection });
  queue.on("error", (err) => console.error("[expiry-scan] queue error:", err.message));

  const worker = new Worker(EXPIRY_SCAN_QUEUE, async () => runExpirySweep(), { connection });
  worker.on("error", (err) => console.error("[expiry-scan] worker error:", err.message));
  worker.on("completed", (job) =>
    console.log("[expiry-scan] sweep done:", JSON.stringify(job.returnvalue))
  );

  g.__pramanamExpiryScan = { queue, worker };

  // BullMQ v6 job-scheduler API (JobsOptions.repeat was removed in v6):
  // upsertJobScheduler is idempotent — same scheduler id + identical
  // pattern/tz upserts, so every boot/server restart is safe.
  const NIGHTLY_0030_IST = "30 0 * * *"; // 00:30 Asia/Kolkata (after midnight rollover)
  void queue
    .upsertJobScheduler(
      "nightly",
      { pattern: NIGHTLY_0030_IST, tz: "Asia/Kolkata" },
      { name: "nightly" }
    )
    .then(() => console.log("[expiry-scan] repeatable job registered (00:30 IST nightly)"))
    .catch((err) =>
      console.error("[expiry-scan] repeatable registration failed:", err.message)
    );
  return true;
}

// Standalone: npx tsx workers/expiry-scan.ts — one sweep + a rerun that must
// converge (flipped: 0, reminders: 0) proving the by-design idempotency.
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("workers/expiry-scan.ts")) {
  runExpirySweep()
    .then(async (first) => {
      console.log("sweep #1:", first);
      const rerun = await runExpirySweep();
      console.log("sweep #2 (rerun — must show flipped:0 reminders:0):", rerun);
      const ok = rerun.flipped === 0 && rerun.reminders === 0;
      console.log(ok ? "IDEMPOTENCY OK" : "IDEMPOTENCY FAIL");
      process.exit(ok ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}


