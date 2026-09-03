// S5 MANUAL CHECK (run: npx tsx lib/search/manual-check.ts)
// PRD #11 / M7 verification gates:
//  1. As admin: q="Essae" -> all Essae instruments; as lmo.krishna: same q -> ONLY Krishna rows (count logged).
//  2. NEGATIVE: cross-district serial probe as lmo.guntur for a Krishna serial -> zero rows, NOT a leak; q of 100 chars -> VALIDATION_ERROR.
//  3. /public/stats equals direct SQL counts (mod 60s cache).
//  4. credential.json for demo cert parses; jwk.kid matches .well-known.
import fs from "node:fs";

(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { db } from "../db";
import { signAccessToken } from "../auth/jwt";
import { verifyCredential } from "../crypto/jws";
import { publicKeyJwk } from "../crypto/keys";
import { GET as getSearch } from "../../app/api/v1/search/route";
import { GET as getStats } from "../../app/api/v1/public/stats/route";
import { GET as getCredential } from "../../app/api/v1/public/certificates/[certId]/credential.json/route";
import { GET as getWellKnown } from "../../app/api/v1/.well-known/pramanam-public-key/route";

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface SearchItem {
  kind: "instrument" | "certificate";
  id: string;
  title: string;
  subtitle: string;
  district: string;
  status: string;
  url: string;
}

interface PublicStats {
  totalInstruments: number;
  activeCerts: number;
  revokedCerts: number;
  lastIssuedAt: string | null;
}

interface CredentialArtifact {
  jws: string;
  jwk: {
    kty: string;
    crv: string;
    x: string;
    kid?: string;
    [key: string]: unknown;
  };
  kid: string;
  fetchedAt: string;
}

interface WellKnownKey {
  kty: string;
  crv: string;
  x: string;
  kid: string;
  alg: string;
  keyFingerprint: string;
}

let failed = 0;
const record = (name: string, ok: boolean, detail?: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
};

function searchReq(q: string, token: string): Request {
  const url = "http://localhost:3000/api/v1/search?" + new URLSearchParams({ q });
  return new Request(url, {
    headers: { authorization: `Bearer ${token}` },
  });
}

async function body<T>(res: Response): Promise<ApiResponse<T>> {
  return (await res.json()) as ApiResponse<T>;
}

async function main() {
  console.log("================================================================");
  console.log("             S5 MANUAL CHECK: SEARCH, STATS & JWK               ");
  console.log("================================================================\n");

  // Load canonical seeded demo users
  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@demo.in" } });
  const lmoKrishna = await db.user.findUniqueOrThrow({ where: { email: "lmo.krishna@demo.in" } });
  const lmoGuntur = await db.user.findUniqueOrThrow({ where: { email: "lmo.guntur@demo.in" } });

  const tokenAdmin = await signAccessToken(admin);
  const tokenKrishna = await signAccessToken(lmoKrishna);
  const tokenGuntur = await signAccessToken(lmoGuntur);

  // -------------------------------------------------------------------------
  // 1. As admin: q="Essae" -> all Essae instruments; as lmo.krishna: same q -> ONLY Krishna rows (count logged)
  // -------------------------------------------------------------------------
  console.log("== 1. Admin vs LMO Scoped Search (q='Essae') ==");

  const adminRes = await body<SearchItem[]>(await getSearch(searchReq("Essae", tokenAdmin)));
  const adminItems = adminRes.data ?? [];
  const adminInsts = adminItems.filter((i) => i.kind === "instrument");
  const adminDistricts = Array.from(new Set(adminInsts.map((i) => i.district)));

  console.log(`  [Admin] Found ${adminItems.length} total items (${adminInsts.length} instruments across districts: [${adminDistricts.join(", ")}])`);
  adminInsts.forEach((item) => {
    console.log(`    - Instrument ${item.title} (${item.subtitle}) | District: ${item.district} | Status: ${item.status}`);
  });

  const krishnaRes = await body<SearchItem[]>(await getSearch(searchReq("Essae", tokenKrishna)));
  const krishnaItems = krishnaRes.data ?? [];
  const krishnaInsts = krishnaItems.filter((i) => i.kind === "instrument");
  const krishnaDistricts = Array.from(new Set(krishnaInsts.map((i) => i.district)));

  console.log(`  [LMO Krishna] Found ${krishnaItems.length} total items (${krishnaInsts.length} instruments across districts: [${krishnaDistricts.join(", ")}])`);
  krishnaInsts.forEach((item) => {
    console.log(`    - Instrument ${item.title} (${item.subtitle}) | District: ${item.district} | Status: ${item.status}`);
  });

  const adminHasMultipleDistricts = adminDistricts.length > 1;
  const adminSeesAllEssae = adminRes.ok && adminInsts.length >= 2 && adminHasMultipleDistricts;
  record("Admin q='Essae' returns all Essae instruments across districts", adminSeesAllEssae, `count=${adminInsts.length}, districts=[${adminDistricts.join(", ")}]`);

  const krishnaOnlyKrishna = krishnaRes.ok && krishnaInsts.length > 0 && krishnaInsts.every((i) => i.district === "Krishna");
  record("LMO Krishna q='Essae' returns ONLY Krishna rows", krishnaOnlyKrishna, `count=${krishnaInsts.length}, districts=[${krishnaDistricts.join(", ")}]`);

  // -------------------------------------------------------------------------
  // 2. NEGATIVE: cross-district serial probe as lmo.guntur for a Krishna serial -> zero rows, NOT a leak; q of 100 chars -> VALIDATION_ERROR
  // -------------------------------------------------------------------------
  console.log("\n== 2. Negative Checks: Cross-district Probe & Validation ==");

  // Find a known Krishna serial from the database (e.g. CS-5522)
  const krishnaInst = await db.instrument.findFirstOrThrow({
    where: { district: "Krishna" },
  });
  console.log(`  Target Krishna instrument serial: '${krishnaInst.serialNumber}' (District: Krishna, Make: ${krishnaInst.make})`);

  const crossProbeRes = await body<SearchItem[]>(await getSearch(searchReq(krishnaInst.serialNumber, tokenGuntur)));
  console.log(`  [LMO Guntur probe for '${krishnaInst.serialNumber}'] ok=${crossProbeRes.ok}, items=${crossProbeRes.data?.length ?? 0}`);
  
  const probeZeroRows = crossProbeRes.ok && (crossProbeRes.data?.length === 0);
  record("Cross-district probe by LMO Guntur returns 0 rows (NOT a leak)", probeZeroRows, `returned ${crossProbeRes.data?.length ?? 0} rows`);

  // 100 chars query string test
  const q100 = "a".repeat(100);
  const q100Res = await body<SearchItem[]>(await getSearch(searchReq(q100, tokenAdmin)));
  console.log(`  [100-char query probe] status=${q100Res.ok ? "OK" : "ERROR"}, error.code=${q100Res.error?.code}, message="${q100Res.error?.message}"`);

  const q100ValidationErr = !q100Res.ok && q100Res.error?.code === "VALIDATION_ERROR";
  record("Search with q of 100 characters returns VALIDATION_ERROR", q100ValidationErr, `code=${q100Res.error?.code}`);

  // -------------------------------------------------------------------------
  // 3. /public/stats equals direct SQL counts (mod 60s cache)
  // -------------------------------------------------------------------------
  console.log("\n== 3. /public/stats vs Direct SQL Counts ==");

  const statsRes = await body<PublicStats>(await getStats());
  if (!statsRes.ok || !statsRes.data) {
    throw new Error("Failed to fetch /public/stats: " + JSON.stringify(statsRes));
  }
  const stats = statsRes.data;

  // Direct SQL / Prisma counts
  const [sqlTotalInstruments, sqlActiveCerts, sqlRevokedCerts, sqlLastCert] = await Promise.all([
    db.instrument.count(),
    db.certificate.count({ where: { status: { in: ["ACTIVE", "EXPIRING_SOON"] } } }),
    db.certificate.count({ where: { status: "REVOKED" } }),
    db.certificate.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const expectedStats: PublicStats = {
    totalInstruments: sqlTotalInstruments,
    activeCerts: sqlActiveCerts,
    revokedCerts: sqlRevokedCerts,
    lastIssuedAt: sqlLastCert ? sqlLastCert.createdAt.toISOString() : null,
  };

  console.log("  API /public/stats:", stats);
  console.log("  Direct SQL counts:", expectedStats);

  const statsMatch =
    stats.totalInstruments === expectedStats.totalInstruments &&
    stats.activeCerts === expectedStats.activeCerts &&
    stats.revokedCerts === expectedStats.revokedCerts &&
    stats.lastIssuedAt === expectedStats.lastIssuedAt;

  record("/public/stats equals direct SQL counts", statsMatch,
    `instruments: ${stats.totalInstruments}/${expectedStats.totalInstruments}, activeCerts: ${stats.activeCerts}/${expectedStats.activeCerts}, revokedCerts: ${stats.revokedCerts}/${expectedStats.revokedCerts}`);

  // -------------------------------------------------------------------------
  // 4. credential.json for demo cert parses; jwk.kid matches .well-known
  // -------------------------------------------------------------------------
  console.log("\n== 4. credential.json & .well-known JWK Verification ==");

  // Find an active demo cert
  const demoCert = await db.certificate.findFirstOrThrow({
    where: { status: "ACTIVE" },
    select: { certId: true, payloadJws: true },
  });
  console.log(`  Demo certificate ID: ${demoCert.certId}`);

  const credRes = await body<CredentialArtifact>(
    await getCredential(new Request(`http://localhost:3000/api/v1/public/certificates/${demoCert.certId}/credential.json`), {
      params: { certId: demoCert.certId },
    })
  );

  if (!credRes.ok || !credRes.data) {
    throw new Error(`Failed to fetch credential.json for ${demoCert.certId}: ` + JSON.stringify(credRes));
  }
  const cred = credRes.data;

  // 1. Parse checks on credential.json
  const jwsParts = cred.jws?.split(".") ?? [];
  const hasThreeJwsSegments = jwsParts.length === 3;
  let parsedClaims: Record<string, unknown> | null = null;
  try {
    const claimsJson = Buffer.from(jwsParts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    parsedClaims = JSON.parse(claimsJson);
  } catch {
    parsedClaims = null;
  }

  const jwkShapeOk = cred.jwk?.kty === "OKP" && cred.jwk?.crv === "Ed25519" && typeof cred.jwk?.x === "string";
  const jwsValid = await verifyCredential(cred.jws, publicKeyJwk());
  const parsedOk = hasThreeJwsSegments && parsedClaims !== null && jwkShapeOk && jwsValid.valid;

  console.log(`  credential.json parsed successfully:`);
  console.log(`    - kid: ${cred.kid}`);
  console.log(`    - fetchedAt: ${cred.fetchedAt}`);
  console.log(`    - jwk: { kty: "${cred.jwk.kty}", crv: "${cred.jwk.crv}", x: "${cred.jwk.x.slice(0, 16)}..." }`);
  console.log(`    - claims.sub: ${parsedClaims?.sub}, category: ${parsedClaims?.instrumentCategory}, validUntil: ${parsedClaims?.validUntil}`);
  console.log(`    - verifyCredential: valid=${jwsValid.valid}`);

  record("credential.json for demo cert parses & signature verifies", parsedOk, `sub=${parsedClaims?.sub}`);

  // 2. Fetch .well-known public key
  const wellKnownRes = await body<WellKnownKey>(await getWellKnown());
  if (!wellKnownRes.ok || !wellKnownRes.data) {
    throw new Error("Failed to fetch .well-known: " + JSON.stringify(wellKnownRes));
  }
  const wellKnown = wellKnownRes.data;

  console.log(`  .well-known public key:`);
  console.log(`    - kid: ${wellKnown.kid}`);
  console.log(`    - alg: ${wellKnown.alg}`);
  console.log(`    - keyFingerprint: ${wellKnown.keyFingerprint}`);

  // Header kid from JWS
  let jwsHeaderKid: string | undefined;
  try {
    const headerJson = Buffer.from(jwsParts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    jwsHeaderKid = JSON.parse(headerJson).kid;
  } catch {
    jwsHeaderKid = undefined;
  }

  const kidMatch = cred.kid === wellKnown.kid && jwsHeaderKid === wellKnown.kid && cred.kid === "pramanam-2026-08-01";
  const xMatch = cred.jwk.x === wellKnown.x;

  console.log(`    - credential.json kid: '${cred.kid}'`);
  console.log(`    - JWS header kid: '${jwsHeaderKid}'`);
  console.log(`    - .well-known kid: '${wellKnown.kid}'`);
  console.log(`    - Key x match: ${xMatch}`);

  record("credential.json kid & JWS header kid match .well-known exactly", kidMatch && xMatch, `kid='${cred.kid}'`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n================================================================");
  if (failed === 0) {
    console.log("         S5 MANUAL CHECK: ALL GATES PASSED (100% OK)            ");
  } else {
    console.log(`         S5 MANUAL CHECK: ${failed} GATES FAILED               `);
  }
  console.log("================================================================");

  await db.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("S5 MANUAL CHECK CRASHED:", e);
  await db.$disconnect();
  process.exit(1);
});
