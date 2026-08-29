// book MA5 item 3 — bulk seed generator (SEPARATE from the frozen seed.ts).
// Generates 10k instruments + ~1.2k applications across the 3 districts with a
// realistic status distribution (60% CERT_ISSUED, 20% SCHEDULED, 10% SUBMITTED,
// 10% FAILED). Bulk createMany only — no per-row awaits. Run: `npm run seed:10k`.
import { PrismaClient } from "@prisma/client";
import { DISTRICTS, INSTRUMENT_CATEGORIES, FEE_PAISA } from "../packages/shared/constants";

const db = new PrismaClient();

const TOTAL_INSTRUMENTS = 10000;
const APP_COUNT = 1200;
const BATCH = 1000;
const BULK_PREFIX = "BULK-";
const TRADERS_PER_DISTRICT = 10;

const MAKES = ["Essae", "Avery", "Cas", "Tokheim", "Elgi", "Sanathan"];
const STREETS = ["Main Road", "Market Yard", "NH-16", "Bus Stand", "Industrial Area", "Old Town"];

// small deterministic PRNG so reruns after a wipe produce comparable data
let seedState = 20260829;
function rand(): number {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

async function main() {
  // idempotency guard: bulk data is identifiable by its serial prefix
  const existing = await db.instrument.findFirst({
    where: { serialNumber: { startsWith: BULK_PREFIX } },
    select: { id: true },
  });
  if (existing) {
    console.log("seed-10k: already seeded (BULK- instruments found) — nothing to do");
    return;
  }

  const now = Date.now();
  const yearAgo = now - 365 * 86400000;

  // 1. traders: 10 per district (individual creates — createMany cannot return ids)
  const traders: { id: string; district: string }[] = [];
  for (const district of DISTRICTS) {
    const created = await Promise.all(
      Array.from({ length: TRADERS_PER_DISTRICT }, (_, i) =>
        db.user.create({
          data: {
            name: `Bulk Trader ${district} ${i + 1}`,
            email: `bulk.trader.${district.toLowerCase()}.${i + 1}@demo.in`,
            // not a real credential; bulk traders never log in
            passwordHash: "bulk-no-login:$argon2id$disabled",
            role: "TRADER",
            orgName: `${district} Bulk Trading Co ${i + 1}`,
            district,
          },
        })
      )
    );
    traders.push(...created.map((u) => ({ id: u.id, district })));
  }
  console.log(`traders: ${traders.length}`);

  // 2. instruments: 10k spread across districts, bulk createMany in batches
  const instrumentRows: {
    ownerId: string;
    category: string;
    make: string;
    model: string;
    serialNumber: string;
    capacity: string;
    district: string;
    address: string;
    createdAt: Date;
  }[] = [];
  const perDistrict = Math.floor(TOTAL_INSTRUMENTS / DISTRICTS.length);
  let serial = 0;
  for (const district of DISTRICTS) {
    const code = district.slice(0, 3).toUpperCase();
    const districtTraders = traders.filter((t) => t.district === district);
    for (let i = 0; i < perDistrict; i++) {
      serial++;
      const owner = districtTraders[Math.floor(rand() * districtTraders.length)];
      const category = pick(INSTRUMENT_CATEGORIES);
      instrumentRows.push({
        ownerId: owner.id,
        category,
        make: pick(MAKES),
        model: `${category.slice(0, 2)}-${100 + Math.floor(rand() * 900)}`,
        serialNumber: `${BULK_PREFIX}${code}-${String(serial).padStart(6, "0")}`,
        capacity: `${[10, 40, 60, 100, 150][Math.floor(rand() * 5)]}kg`,
        district,
        address: `${pick(STREETS)}, ${district}`,
        createdAt: new Date(yearAgo + rand() * (now - yearAgo)),
      });
    }
  }
  for (let i = 0; i < instrumentRows.length; i += BATCH) {
    await db.instrument.createMany({ data: instrumentRows.slice(i, i + BATCH) });
  }
  console.log(`instruments: ${instrumentRows.length}`);

  // 3. read bulk instruments back (createMany cannot return ids)
  const bulkInstruments = await db.instrument.findMany({
    where: { serialNumber: { startsWith: BULK_PREFIX } },
    select: { id: true, ownerId: true },
  });

  // 4. applications: 1.2k on random bulk instruments.
  //    Status distribution: 60% CERT_ISSUED, 20% SCHEDULED, 10% SUBMITTED, 10% FAILED.
  type BulkStatus = "CERT_ISSUED" | "SCHEDULED" | "SUBMITTED" | "FAILED";
  const statuses: BulkStatus[] = [];
  for (let i = 0; i < APP_COUNT; i++) {
    const r = i % 10;
    statuses.push(r < 6 ? "CERT_ISSUED" : r < 8 ? "SCHEDULED" : r === 8 ? "SUBMITTED" : "FAILED");
  }
  // shuffle so statuses spread across instruments instead of clustering
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }

  const appRows: {
    instrumentId: string;
    traderId: string;
    type: "NEW" | "RE_VERIFICATION";
    status: BulkStatus;
    feeAmount: number;
    feePaidAt: Date | null;
    declarationAccepted: boolean;
    createdAt: Date;
  }[] = statuses.map((status) => {
    const inst = bulkInstruments[Math.floor(rand() * bulkInstruments.length)];
    const createdAt = new Date(yearAgo + rand() * (now - yearAgo));
    return {
      instrumentId: inst.id,
      traderId: inst.ownerId,
      type: rand() < 0.7 ? ("NEW" as const) : ("RE_VERIFICATION" as const),
      status,
      feeAmount: FEE_PAISA,
      // CERT_ISSUED / SCHEDULED / SUBMITTED imply a paid fee; FAILED does not
      feePaidAt: status === "FAILED" ? null : new Date(createdAt.getTime() + 3600000),
      declarationAccepted: status !== "SUBMITTED" || rand() < 0.5,
      createdAt,
    };
  });
  for (let i = 0; i < appRows.length; i += BATCH) {
    await db.application.createMany({ data: appRows.slice(i, i + BATCH) });
  }

  const byStatus = appRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`applications: ${appRows.length}`, JSON.stringify(byStatus));
  console.log("seed-10k done");
}

main()
  .catch((e) => {
    console.error("seed-10k failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());