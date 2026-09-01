// Run: npx tsx lib/search/search-selftest.ts
// M7 SELFTEST (PRD #11) — exercises the REAL search + credential.json route
// handlers (not just libs) with minted session tokens, against live Postgres:
//  1. /api/v1/search — q validation (missing/empty/>64), RBAC scoping matrix
//     (TRADER own / LMO,GATC district / ADMIN all), matching on serial/make/
//     model/certId, district/category/status filters, item contract (kind, id,
//     title, subtitle, district, status, url -> /trader/instruments/[id] or
//     /verify/[certId]).
//  2. /api/v1/public/certificates/[certId]/credential.json — no auth, shape
//     { jws, jwk, kid, fetchedAt }, raw JWS byte-identical, 404 unknown,
//     31st request RATE_LIMITED.
//  3. p95 sanity: loop 50 queries against the seeded dataset, console.time the
//     whole loop + average per query; target < 500 ms.
import fs from "node:fs";

(function loadEnv() {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
})();

import { db } from "../db";
import { hashPassword } from "../hash";
import { issueCertificate } from "../crypto/issue";
import { signAccessToken } from "../auth/jwt";
import { GET as getSearch } from "../../app/api/v1/search/route";
import { GET as getCredential } from "../../app/api/v1/public/certificates/[certId]/credential.json/route";

const TAG = "srchst" + Date.now().toString(36);

type Json = { ok: boolean; data?: unknown; error?: { code?: string; details?: unknown } };
async function body(res: Response): Promise<Json> {
  return (await res.json()) as Json;
}
type SearchItem = {
  kind: "instrument" | "certificate";
  id: string;
  title: string;
  subtitle: string;
  district: string;
  status: string;
  url: string;
};
function req(url: string, token?: string, ip?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (ip) headers["x-forwarded-for"] = ip;
  return new Request(url, { headers });
}
function searchUrl(q: string, extra?: Record<string, string>): string {
  return "http://x/api/v1/search?" + new URLSearchParams({ q, ...extra });
}

async function main() {
  const results: { name: string; ok: boolean }[] = [];
  const record = (name: string, ok: boolean) => results.push({ name, ok });

  // -- fixture: two traders in different districts, two LMOs, one admin -------
  // idempotent re-runs: purge fixtures from earlier search-selftest runs, else
  // broad q prefixes (SRCH*) double-count across runs
  const staleUsers = await db.user.findMany({ where: { email: { contains: "srchst" } }, select: { id: true } });
  if (staleUsers.length) {
    const staleIds = staleUsers.map((u: { id: string }) => u.id);
    await db.certificate.deleteMany({ where: { instrument: { ownerId: { in: staleIds } } } });
    await db.application.deleteMany({ where: { traderId: { in: staleIds } } });
    await db.notification.deleteMany({ where: { userId: { in: staleIds } } });
    await db.instrument.deleteMany({ where: { ownerId: { in: staleIds } } });
    await db.user.deleteMany({ where: { id: { in: staleIds } } });
  }

  const hash = await hashPassword("Passw0rd!selftest");
  const traderA = await db.user.create({
    data: { name: "Search A " + TAG, email: `sa.${TAG}@demo.in`, passwordHash: hash, role: "TRADER", district: "Guntur", orgName: "Search Firm A " + TAG },
  });
  const traderB = await db.user.create({
    data: { name: "Search B " + TAG, email: `sb.${TAG}@demo.in`, passwordHash: hash, role: "TRADER", district: "Krishna", orgName: "Search Firm B " + TAG },
  });
  const lmoGuntur = await db.user.create({
    data: { name: "Search LMO Gun " + TAG, email: `sg.${TAG}@demo.in`, passwordHash: hash, role: "LMO", district: "Guntur" },
  });
  const lmoKrishna = await db.user.create({
    data: { name: "Search LMO Kri " + TAG, email: `sk.${TAG}@demo.in`, passwordHash: hash, role: "LMO", district: "Krishna" },
  });
  const admin = await db.user.create({
    data: { name: "Search Admin " + TAG, email: `ad.${TAG}@demo.in`, passwordHash: hash, role: "ADMIN" },
  });

  const instA = await db.instrument.create({
    data: {
      ownerId: traderA.id, category: "COUNTER_SCALE", make: "Essae", model: "SRCHA-" + TAG,
      serialNumber: "SRCHA-" + TAG, capacity: "30kg", district: "Guntur", address: "Search Lane A",
    },
  });
  const instB = await db.instrument.create({
    data: {
      ownerId: traderB.id, category: "PLATFORM_SCALE", make: "Avery", model: "SRCHB-" + TAG,
      serialNumber: "SRCHB-" + TAG, capacity: "60t", district: "Krishna", address: "Search Lane B",
    },
  });
  const appA = await db.application.create({
    data: { instrumentId: instA.id, traderId: traderA.id, type: "NEW", status: "PASSED", feePaidAt: new Date(), declarationAccepted: true },
  });
  const cert = await issueCertificate({
    applicationId: appA.id, instrumentId: instA.id,
    reportId: "rep-" + TAG, inspectorId: lmoGuntur.id, inspectorKind: "LMO" as const,
  });
  if (!cert) throw new Error("issuance failed in fixture");

  const tokenA = await signAccessToken(traderA);
  const tokenB = await signAccessToken(traderB);
  const tokenGun = await signAccessToken(lmoGuntur);
  const tokenKri = await signAccessToken(lmoKrishna);
  const tokenAdm = await signAccessToken(admin);

  // -- 1. q validation (NEGATIVE contract) ------------------------------------
  const noQ = await body(await getSearch(req("http://x/api/v1/search", tokenA)));
  record("search: missing q -> VALIDATION_ERROR", !noQ.ok && noQ.error!.code === "VALIDATION_ERROR");
  const emptyQ = await body(await getSearch(req(searchUrl("   "), tokenA)));
  record("search: whitespace q -> VALIDATION_ERROR", !emptyQ.ok && emptyQ.error!.code === "VALIDATION_ERROR");
  const longQ = await body(await getSearch(req(searchUrl("x".repeat(65)), tokenA)));
  record("search: 65-char q -> VALIDATION_ERROR", !longQ.ok && longQ.error!.code === "VALIDATION_ERROR");
  const authReq = await body(await getSearch(req(searchUrl("SRCHA"))));
  record("search: no token -> AUTH_REQUIRED", !authReq.ok && authReq.error!.code === "AUTH_REQUIRED");

  // -- 2. RBAC scoping ---------------------------------------------------------
  const ownSerial = (await body(await getSearch(req(searchUrl("SRCHA-" + TAG), tokenA)))).data as SearchItem[];
  record("search: TRADER finds own instrument by serial",
    ownSerial.length === 1 && ownSerial[0].kind === "instrument" && ownSerial[0].id === instA.id);
  record("search: instrument item contract (title=serial, url=/trader/instruments/[id])",
    ownSerial[0].title === "SRCHA-" + TAG && ownSerial[0].district === "Guntur" &&
    ownSerial[0].url === `/trader/instruments/${instA.id}`);
  record("search: instrument status derived from latest cert (ACTIVE)", ownSerial[0].status === "ACTIVE");

  const aSeesB = (await body(await getSearch(req(searchUrl("SRCHB-" + TAG), tokenA)))).data as SearchItem[];
  record("search: TRADER A does NOT see B's instrument", aSeesB.length === 0);
  const bSeesA = (await body(await getSearch(req(searchUrl("SRCHA-" + TAG), tokenB)))).data as SearchItem[];
  record("search: TRADER B does NOT see A's instrument", bSeesA.length === 0);

  const gunSeesA = (await body(await getSearch(req(searchUrl("SRCHA-" + TAG), tokenGun)))).data as SearchItem[];
  const kriSeesA = (await body(await getSearch(req(searchUrl("SRCHA-" + TAG), tokenKri)))).data as SearchItem[];
  record("search: LMO Guntur sees own-district instrument", gunSeesA.length === 1);
  record("search: LMO Krishna does NOT see Guntur instrument", kriSeesA.length === 0);

  const admSeesBoth = (await body(await getSearch(req(searchUrl("SRCH"), tokenAdm)))).data as SearchItem[];
  record("search: ADMIN sees both traders' instruments", admSeesBoth.filter((i) => i.kind === "instrument").length === 2);

  // -- 3. matching on make / model / certId ------------------------------------
  const byMake = (await body(await getSearch(req(searchUrl("essae"), tokenA)))).data as SearchItem[]; // case-insensitive
  record("search: matches make case-insensitively (ILIKE contains)", byMake.length === 1 && byMake[0].id === instA.id);
  const byModel = (await body(await getSearch(req(searchUrl("SRCHA"), tokenA)))).data as SearchItem[];
  record("search: matches model", byModel.length >= 1 && byModel.some((i) => i.id === instA.id));

  const certPrefix = cert.certId.slice(0, cert.certId.length - 3); // partial certId
  const byCert = (await body(await getSearch(req(searchUrl(certPrefix), tokenAdm)))).data as SearchItem[];
  const certItem = byCert.find((i) => i.kind === "certificate");
  record("search: matches certificate certId (partial, ADMIN)", !!certItem && certItem.id === cert.certId);
  record("search: certificate item contract (url=/verify/[certId], status, district)",
    !!certItem && certItem.url === `/verify/${cert.certId}` && certItem.status === "ACTIVE" && certItem.district === "Guntur");

  const bCertScope = (await body(await getSearch(req(searchUrl(certPrefix), tokenB)))).data as SearchItem[];
  record("search: TRADER B does NOT see A's certificate", bCertScope.filter((i) => i.kind === "certificate").length === 0);

  // -- 4. optional filters ------------------------------------------------------
  const fDistrict = (await body(await getSearch(req(searchUrl("SRCH", { district: "Krishna" }), tokenAdm)))).data as SearchItem[];
  record("search: district filter keeps only Krishna", fDistrict.length >= 1 && fDistrict.every((i) => i.district === "Krishna"));
  const fCategory = (await body(await getSearch(req(searchUrl("SRCH", { category: "PLATFORM_SCALE" }), tokenAdm)))).data as SearchItem[];
  record("search: category filter keeps only PLATFORM_SCALE", fCategory.length === 1 && fCategory[0].id === instB.id);
  const fActive = (await body(await getSearch(req(searchUrl(certPrefix, { status: "ACTIVE" }), tokenAdm)))).data as SearchItem[];
  record("search: status=ACTIVE keeps the ACTIVE certificate", fActive.some((i) => i.kind === "certificate" && i.id === cert.certId));
  const fActiveInst = (await body(await getSearch(req(searchUrl("SRCHA", { status: "ACTIVE" }), tokenAdm)))).data as SearchItem[];
  const fActiveUncert = (await body(await getSearch(req(searchUrl("SRCHB", { status: "ACTIVE" }), tokenAdm)))).data as SearchItem[];
  record("search: status=ACTIVE derived keeps certified instrument, drops uncertified",
    fActiveInst.some((i) => i.id === instA.id) && fActiveUncert.length === 0);
  const fRevoked = (await body(await getSearch(req(searchUrl("SRCH", { status: "REVOKED" }), tokenAdm)))).data as SearchItem[];
  record("search: status=REVOKED excludes fresh fixtures", fRevoked.length === 0);
  const badEnum = await body(await getSearch(req(searchUrl("SRCH", { district: "Nowhere" }), tokenAdm)));
  record("search: invalid district enum -> VALIDATION_ERROR", !badEnum.ok && badEnum.error!.code === "VALIDATION_ERROR");

  // -- 5. credential.json artifact ---------------------------------------------
  const credUrl = `http://x/api/v1/public/certificates/${cert.certId}/credential.json`;
  const cred = (await body(await getCredential(req(credUrl), { params: { certId: cert.certId } }))).data as Record<string, unknown>;
  record("credential: no auth -> 200 ok", !!cred);
  record("credential: shape { jws, jwk, kid, fetchedAt }",
    typeof cred.jws === "string" && typeof cred.fetchedAt === "string" &&
    (cred.jwk as Record<string, string>).kty === "OKP" && (cred.jwk as Record<string, string>).crv === "Ed25519" &&
    cred.kid === "pramanam-2026-08-01" && !isNaN(Date.parse(cred.fetchedAt as string)));
  record("credential: jws is RAW compact JWS, byte-identical to issued payload", cred.jws === cert.payloadJws);
  const credMiss = await body(await getCredential(req("http://x/api/v1/public/certificates/PRM-CERT-0000-99999/credential.json"), { params: { certId: "PRM-CERT-0000-99999" } }));
  record("credential: unknown certId -> NOT_FOUND", !credMiss.ok && credMiss.error!.code === "NOT_FOUND");

  // rate limit: shares the lookup bucket 30/min/IP -> 31st is RATE_LIMITED
  const rlIp = "203.0.113." + ((Date.now() % 200) + 2);
  let limited = false;
  for (let i = 0; i < 31; i++) {
    const r = await body(await getCredential(req(credUrl, undefined, rlIp), { params: { certId: cert.certId } }));
    if (!r.ok && r.error!.code === "RATE_LIMITED") { limited = i === 30; break; }
  }
  record("credential: 31st request in a minute -> RATE_LIMITED", limited);

  // -- 6. p95 sanity: 50 queries against the seeded dataset ---------------------
  const seedQs = ["WB-", "CS-", "FD-", "TM-", "Essae", "Avery", "Cas", "Tokheim", "Elgi",
    "40t", "60t", "ER-Plus", "Tera", "Quanta", "Electronic", "9021", "8754", "4412",
    "5522", "7788", "1101", "PRM-CERT-2026-000", "SRCHA", "SRCHB", "weigh", "scale",
    "meter", "platform", "counter", "Guntur", "Krishna", "WB-9021", "CS-5522", "TM-1101",
    "FD-7788", "avery", "ESSAE", "cas", "elgi", "tok", "QM", "9", "5", "1", "0",
    "PRM", "CERT", "SRCH", "t", "-"];
  if (seedQs.length !== 50) throw new Error("expected exactly 50 p95 queries");
  const t0 = performance.now();
  console.time("p95-loop-50");
  let okCount = 0;
  for (const q of seedQs) {
    const r = await body(await getSearch(req(searchUrl(q), tokenAdm)));
    if (r.ok) okCount++;
  }
  console.timeEnd("p95-loop-50");
  const elapsed = performance.now() - t0;
  const avg = elapsed / seedQs.length;
  console.log(`p95 sanity: 50 queries, total ${elapsed.toFixed(1)} ms, avg ${avg.toFixed(1)} ms/query (target < 500 ms)`);
  record(`p95: avg ${avg.toFixed(1)} ms < 500 ms (50/50 ok=${okCount})`, avg < 500 && okCount === 50);

  // -- report -------------------------------------------------------------------
  await db.$disconnect();
  console.log("\n---- search-selftest results ----");
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "CHECK FAILED"}  ${r.name}`);
  }
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("SELFTEST CRASH:", e);
  process.exit(1);
});
