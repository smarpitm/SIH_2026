// scripts/qa-overflow.mjs — objective layout QA at 1440px and 768px:
// reports horizontal overflow, console errors, and failed network requests
// for every app page (logged-in roles via real UI login).
// Run: node scripts/qa-overflow.mjs
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.PRAMANAM_TEST_URL || "http://localhost:3000";
const EXE = join(
  process.env.LOCALAPPDATA ?? "",
  "ms-playwright/chromium-1234/chrome-win64/chrome.exe"
);
const PW = "Passw0rd!demo";
const WIDTHS = [1440, 768];

const PAGES = [
  { path: "/", role: null },
  { path: "/login", role: null },
  { path: "/register", role: null },
  { path: "/docs", role: null },
  { path: "/verify/offline", role: null },
  { path: "/verify/PRM-CERT-2026-00052", role: null },
  { path: "/trader", role: "ravi@demo.in" },
  { path: "/trader/instruments/new", role: "ravi@demo.in" },
  { path: "/trader/applications/cmto672mg004jnz405rwhd2ze", role: "ravi@demo.in" },
  { path: "/officer", role: "lmo.guntur@demo.in" },
  { path: "/officer/job/cmtn5uyvb000pnzt88v7kp8jp", role: "lmo.guntur@demo.in" },
  { path: "/admin/dashboard", role: "admin@demo.in" },
];

async function uiLogin(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForTimeout(800);
}

async function main() {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  // re-verify public pages in their own context; each role gets one logged-in
  // context shared across its pages (fresh login per role).
  for (const { path, role } of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const issues = { console: [], failed: [], overflow: [] };
    page.on("console", (m) => {
      if (m.type() === "error") issues.console.push(m.text().slice(0, 160));
    });
    page.on("requestfailed", (r) => issues.failed.push(`${r.method()} ${r.url().replace(BASE, "")}`));
    if (role) await uiLogin(page, role);
    for (const w of WIDTHS) {
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
      } catch {
        await page.waitForLoadState("domcontentloaded").catch(() => {});
      }
      await page.waitForTimeout(1000);
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(400);
      const ov = await page.evaluate(() => {
        const d = document.documentElement;
        const body = document.body;
        return {
          scrollW: Math.max(d.scrollWidth, body.scrollWidth),
          innerW: window.innerWidth,
        };
      });
      const overflowPx = ov.scrollW - ov.innerW;
      if (overflowPx > 1) issues.overflow.push(`${w}px: +${overflowPx}px`);
    }
    const label = `${path}${role ? ` [${role}]` : ""}`;
    const status = issues.overflow.length || issues.console.length || issues.failed.length ? "⚠" : "✓";
    console.log(`${status} ${label}`);
    for (const o of issues.overflow) console.log(`    overflow  ${o}`);
    for (const c of [...new Set(issues.console)].slice(0, 3)) console.log(`    console   ${c}`);
    for (const f of [...new Set(issues.failed)].slice(0, 3)) console.log(`    failed    ${f}`);
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});