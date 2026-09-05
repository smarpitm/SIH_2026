// scripts/screenshot-pages.mjs — capture FULL-PAGE (top→bottom) screenshots of
// every app page into screenshots/. Logs in through the real /login UI per role
// so pm_refresh/pm_ui_* cookies and the zustand auth state are exactly as in a
// human session. Dynamic IDs (instrument/application/job/cert) are resolved via
// the live API + Prisma. Run: node --env-file=.env scripts/screenshot-pages.mjs
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "screenshots");
const BASE = process.env.PRAMANAM_TEST_URL || "http://localhost:3000";
const EXE = join(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright/chromium-1234/chrome-win64/chrome.exe"
);
const PW = "Passw0rd!demo";
// both target widths from the brief: 1440 desktop and 768 tablet
const WIDTHS = [1440, 768];
const HEIGHT = 900;
mkdirSync(OUT, { recursive: true });

const db = new PrismaClient();
const results = [];

async function apiLogin(email) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`API login failed for ${email}: ${JSON.stringify(body)}`);
  return body.data;
}

async function listFirst(token, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json();
  const arr = Array.isArray(body?.data) ? body.data : (body?.data?.items ?? body?.data?.data ?? []);
  return arr[0] ?? null;
}

// shoot the same path at every target width: file names gain a width suffix
// so 1440px and 768px captures never overwrite each other.
async function shoot(page, path, file) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
  }
  await page.waitForTimeout(1200); // let client data fetches/hydration settle
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: HEIGHT });
    await page.waitForTimeout(350); // let responsive layout reflow
    await page.screenshot({ path: join(OUT, `${file}.${w}px.png`), fullPage: true });
    results.push({ file: `${file}.${w}px.png`, path, width: w });
    console.log(`✔ ${file}.${w}px.png  ←  ${path} @ ${w}px`);
  }
}

async function uiLogin(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForTimeout(1000);
}

async function main() {
  // ---- resolve dynamic IDs (API, Bearer tokens) -----------------------------
  const trader = await apiLogin("ravi@demo.in");
  const officer = await apiLogin("lmo.guntur@demo.in");

  const instrument = await listFirst(trader.accessToken, "/api/v1/instruments");
  const application = await listFirst(trader.accessToken, "/api/v1/applications");
  const job = await listFirst(officer.accessToken, "/api/v1/schedule/mine");
  const cert = await db.certificate.findFirst({ orderBy: { createdAt: "desc" } });
  await db.$disconnect();

  const instrumentId = instrument?.id ?? null;
  const applicationId = application?.id ?? job?.applicationId ?? null;
  const jobApplicationId = job?.applicationId ?? applicationId;
  const certId = cert?.certId ?? "PRM-CERT-2026-00001";
  console.log(
    `IDs → instrument=${instrumentId} application=${applicationId} job=${jobApplicationId} cert=${certId}`
  );

  const browser = await chromium.launch({ executablePath: EXE, headless: true });

  // ---- PUBLIC pages (no auth) ----------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: HEIGHT } });
    const page = await ctx.newPage();
    await shoot(page, "/", "landing.png");
    await shoot(page, "/login", "login.png");
    await shoot(page, "/register", "register.png");
    await shoot(page, "/docs", "docs.png");
    await shoot(page, "/verify/offline", "verify_offline.png");
    await shoot(page, `/verify/${certId}`, "verify.png");
    await ctx.close();
  }

  // ---- TRADER pages ----------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: HEIGHT } });
    const page = await ctx.newPage();
    await uiLogin(page, "ravi@demo.in");
    await shoot(page, "/trader", "trader.png");
    await shoot(page, "/trader/instruments/new", "trader_new_instrument.png");
    if (instrumentId) {
      await shoot(page, `/trader/apply/${instrumentId}`, "trader_apply.png");
      await shoot(page, `/trader/instruments/${instrumentId}`, "trader_instrument.png");
    }
    if (applicationId) {
      await shoot(page, `/trader/applications/${applicationId}`, "trader_application.png");
    }
    await ctx.close();
  }

  // ---- OFFICER pages ---------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: HEIGHT } });
    const page = await ctx.newPage();
    await uiLogin(page, "lmo.guntur@demo.in");
    await shoot(page, "/officer", "officer.png");
    if (jobApplicationId) {
      await shoot(page, `/officer/job/${jobApplicationId}`, "officer_job.png");
    }
    await ctx.close();
  }

  // ---- ADMIN pages -----------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: HEIGHT } });
    const page = await ctx.newPage();
    await uiLogin(page, "admin@demo.in");
    await shoot(page, "/admin", "admin.png");
    await shoot(page, "/admin/dashboard", "admin_dashboard.png");
    await ctx.close();
  }

  await browser.close();
  console.log(`\nDone: ${results.length} captures (${WIDTHS.length} widths × ${results.length / WIDTHS.length} pages) into screenshots/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
