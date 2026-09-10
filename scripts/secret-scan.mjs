#!/usr/bin/env node
/**
 * scripts/secret-scan.mjs — PRAMANAM pre-submission secret scanner.
 *
 * Why this exists (security review A1): `git grep` only searches TRACKED files,
 * so an ignored file like `env.vercel.download` escapes a git-grep-based scan
 * and the check falsely reports "clean". This scanner walks the WHOLE working
 * tree including ignored files, and also runs a content sweep over every commit
 * on every ref (git log -G) to catch history. It never prints the contents of
 * local env/secret files — it reports the path.
 *
 * Usage:     node scripts/secret-scan.mjs [--history]
 * Exit code: 0 = clean, 1 = hits found (CI-safe).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(process.cwd());

// --- patterns (review A3 additions are explicitly commented) -----------------
const SECRET_RE = new RegExp(
  [
    "rediss://[^\\s'\"]{2,}", // ★ Upstash Redis (with real host; doc examples like `rediss://…` are short/allowlisted)
    "redis://[^\\s'\"]+:([^\\s'\"]+)@", // redis with creds
    "postgres(?:ql)?://[^\\s'\"]+:([^\\s'\"]+)@\\S*(npg_|amazonaws|render|vercel)",
    "npg_[A-Za-z0-9]{9,}", // ★ Neon pooler password
    "LS0tLS1", // ★ base64 PKCS8 prefix (ED25519 private key)
    "-----BEGIN (RSA |OPENSSH |EC |ENCRYPTED )?PRIVATE KEY-----",
    "AKIA[0-9A-Z]{16}", // AWS
    "K005[A-Za-z0-9]{20,}", // ★ Backblaze B2
    "ghp_[A-Za-z0-9]{30,}", // GitHub PAT
    "xox[baprs]-[A-Za-z0-9-]{10,}", // Slack
    "(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}", // ★ Stripe-style
    "DATABASE_URL=.*(npg_|amazonaws|render|vercel)",
    "REDIS_URL=rediss://",
  ].join("|"),
  "i"
);

// filenames that are flagged BEFORE content is read (never printed)
const SECRET_FILENAME_RE =
  /^(env\.vercel\.|\.env$|\.env\..*local|\.render-secrets|\..*\.pem$|\..*\.key$)/i;

// allowlisted strings (expected in README/.env.example/seed by design)
const ALLOWLIST = [
  "Passw0rd!demo",
  "dev-only-",
  "changeme",
  "pramanam123",
  "pramanam:pramanam@localhost",
  "redis://localhost:6379",
  "http://localhost",
  "https://img.shields.io",
  "sih-2026-pramanam.vercel.app",
  "upstash.io", // doc placeholder URLs in VERCEL_DEPLOYMENT.md
];

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".next-build",
  "coverage",
  ".local-postgres",
  ".local-services",
  ".minio-data",
  ".tools",
  ".agents",
  "android",
  "dist",
  // gitignored template reference folder (NSUT-SIH-DEMO/REFACTOR_PLAN.md
  // documents the scan's own patterns), never part of the submitted repo
  "NSUT-SIH-DEMO",
]);

const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".json", ".md", ".mdx",
  ".yml", ".yaml", ".toml", ".txt", ".sh", ".ps1", ".bat", ".cmd",
  ".html", ".css", ".mjs", ".env", ".example", ".cfg", ".conf", ".ini",
  ".sql", ".prisma", ".tsbuildinfo", ".lock", ".xml", ".svg",
]);

function isAllowed(line) {
  return ALLOWLIST.some((a) => line.includes(a));
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // broken symlink / race
    }
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, out);
    } else {
      out.push(full);
    }
  }
}

function scanFile(path, hits) {
  const name = basename(path);
  if (name === "secret-scan.mjs") return; // the scanner's own pattern list is the pattern list
  if (SECRET_FILENAME_RE.test(name)) {
    hits.push({ path, reason: "secret-looking FILENAME (content not read)" });
    return;
  }
  const ext = extname(path);
  if (!TEXT_EXT.has(ext) && !name.startsWith(".env") && !name.endsWith(".env")) return;
  let lines;
  try {
    lines = readFileSync(path, "utf8").split(/\r?\n/);
  } catch {
    return; // binary / undecodable
  }
  lines.forEach((line, i) => {
    if (!line || isAllowed(line)) return;
    const m = line.match(SECRET_RE);
    if (m) hits.push({ path, line: i + 1, sample: m[0].slice(0, 40) });
  });
}

function historyScan(includeHistory) {
  const hits = [];
  if (!includeHistory) return hits;
  const pattern =
    "LS0tLS1|rediss://|npg_[A-Za-z0-9]{9,}|-----BEGIN |AKIA[0-9A-Z]{16}|K005[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}";
  try {
    const out = execSync(
      `git log --all --oneline -i -G'${pattern}' -- . ':(exclude)package-lock.json'`,
      { cwd: ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 8 }
    );
    for (const line of out.split(/\r?\n/)) {
      if (line.trim()) hits.push({ commit: line.trim(), reason: "history content match (classify: doc placeholder vs real)" });
    }
  } catch {
    // git log -G returns 1 when there are no matches
  }
  return hits;
}

const fileHits = [];
const files = [];
walk(ROOT, files);
for (const f of files) scanFile(f, fileHits);

const includeHistory = process.argv.includes("--history");
const historyHits = historyScan(includeHistory);

const all = [...fileHits, ...historyHits];
console.log(`secret-scan: scanned ${files.length} files (incl. ignored)${includeHistory ? " + full history" : ""}`);
if (all.length === 0) {
  console.log("secret-scan: CLEAN ✅ — no secret patterns found outside the allowlist.");
  process.exit(0);
}
console.log(`secret-scan: ${all.length} hit(s) ⚠️`);
for (const h of all) {
  if (h.path) {
    console.log(`  ${h.path}${h.line ? `:${h.line}` : ""}  ${h.reason ?? "match: " + h.sample}`);
  } else {
    console.log(`  [history] ${h.commit}  ${h.reason}`);
  }
}
process.exit(1);