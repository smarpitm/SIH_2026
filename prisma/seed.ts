import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/hash";

const db = new PrismaClient();
const PW = "Passw0rd!demo";

async function main() {
  // Idempotent: already-seeded DB short-circuits.
  const existing = await db.user.count();
  if (existing > 0) {
    console.log("seeded already");
    return;
  }

  const hash = await hashPassword(PW);

  const admin = await db.user.create({
    data: { name: "State Admin", email: "admin@demo.in", passwordHash: hash, role: "ADMIN" },
  });
  const ravi = await db.user.create({
    data: {
      name: "Ravi Kumar",
      email: "ravi@demo.in",
      passwordHash: hash,
      role: "TRADER",
      orgName: "Ravi Traders",
      district: "Guntur",
    },
  });
  const laxmi = await db.user.create({
    data: {
      name: "Laxmi Reddy",
      email: "laxmi@demo.in",
      passwordHash: hash,
      role: "TRADER",
      orgName: "Laxmi Stores",
      district: "Krishna",
    },
  });
  const lmoGuntur = await db.user.create({
    data: { name: "LMO Guntur", email: "lmo.guntur@demo.in", passwordHash: hash, role: "LMO", district: "Guntur" },
  });
  const lmoKrishna = await db.user.create({
    data: { name: "LMO Krishna", email: "lmo.krishna@demo.in", passwordHash: hash, role: "LMO", district: "Krishna" },
  });
  const gatc = await db.user.create({
    data: {
      name: "Vizag Test Centre",
      email: "gatc@demo.in",
      passwordHash: hash,
      role: "GATC",
      orgName: "Vizag Test Centre",
      district: "Vijayawada",
    },
  });
  void admin;

  // 6 instruments across the two traders:
  // ravi (Guntur): 2 WEIGHBRIDGE, 1 COUNTER_SCALE ; laxmi (Krishna): 1 COUNTER_SCALE, 1 FUEL_DISPENSER, 1 TAXI_METER
  const instruments = [
    { ownerId: ravi.id, category: "WEIGHBRIDGE", make: "Essae", model: "40t", serialNumber: "WB-9021", capacity: "40t", district: "Guntur", address: "Gandhi Nagar, Guntur" },
    { ownerId: ravi.id, category: "WEIGHBRIDGE", make: "Avery", model: "60t", serialNumber: "WB-8754", capacity: "60t", district: "Guntur", address: "Main Road, Guntur" },
    { ownerId: ravi.id, category: "COUNTER_SCALE", make: "Cas", model: "ER-Plus", serialNumber: "CS-4412", capacity: "150kg", district: "Guntur", address: "Main Bazaar, Guntur" },
    { ownerId: laxmi.id, category: "COUNTER_SCALE", make: "Essae", model: "Tera", serialNumber: "CS-5522", capacity: "100kg", district: "Krishna", address: "Nelapadu, Krishna" },
    { ownerId: laxmi.id, category: "FUEL_DISPENSER", make: "Tokheim", model: "Quanta", serialNumber: "FD-7788", capacity: "single", district: "Krishna", address: "NH-16, Krishna" },
    { ownerId: laxmi.id, category: "TAXI_METER", make: "Elgi", model: "Electronic", serialNumber: "TM-1101", capacity: "standard", district: "Krishna", address: "Bus Stand, Krishna" },
  ];

  for (const inst of instruments) {
    await db.instrument.create({ data: inst });
  }

  // Print email/role/password table.
  const users = [admin, ravi, laxmi, lmoGuntur, lmoKrishna, gatc];
  console.log("\n# Seeded users");
  console.log("-".repeat(56));
  console.log("EMAIL".padEnd(30) + "ROLE".padEnd(10) + "PASSWORD");
  console.log("-".repeat(56));
  for (const u of users) {
    console.log(u.email.padEnd(30) + u.role.padEnd(10) + PW);
  }
  console.log("-".repeat(56));
  console.log(`Seeded ${users.length} users and ${instruments.length} instruments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });