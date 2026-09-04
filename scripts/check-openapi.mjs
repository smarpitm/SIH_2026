#!/usr/bin/env node
// book MA4 item 7 — drift guard: openapi.json path count must equal route.ts
// files under app/api/v1 (excluding the openapi.json artifact itself).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function listRouteFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry === "route.ts" && basename(dir) !== "openapi.json") {
      out.push(full);
    }
  }
  return out;
}

/** Map a route.ts file to its openapi path key (support [param] and nested). */
function routeToPath(rel) {
  // strip app/api/v1/prefix and trailing /route.ts
  const trimmed = rel.replace(/\\/g, "/").replace(/^app\/api\/v1\//, "").replace(/\/route\.ts$/, "");
  const parts = trimmed.split("/").map((p) => (p.startsWith("[") && p.endsWith("]") ? `{${p.slice(1, -1)}}` : p));
  return "/" + parts.join("/");
}

function methodsInRouteFile(file) {
  const src = readFileSync(file, "utf8");
  const found = [];
  for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    if (new RegExp(`export async function ${m}\\b`).test(src)) found.push(m);
  }
  return found;
}

const routeFiles = listRouteFiles(join(root, "app", "api", "v1"));
const spec = JSON.parse(readFileSync(join(root, "scripts", "openapi.json"), "utf8"));
const paths = Object.keys(spec.paths ?? {});

let failed = false;
console.log(`openapi.json: ${paths.length} paths`);
console.log(`route.ts files under app/api/v1: ${routeFiles.length}`);

if (paths.length !== routeFiles.length) {
  console.error(
    `DRIFT: openapi.json has ${paths.length} paths but app/api/v1 has ${routeFiles.length} route files.`
  );
  failed = true;
}
if (paths.length < 25) {
  console.error(`DRIFT: openapi.json below minimum 25 paths (has ${paths.length}).`);
  failed = true;
}

// AUDIT FINDING #25: verify METHODS too, not just path count.
const checked = new Set();
for (const file of routeFiles) {
  const rel = file.slice(root.length + 1).replace(/\\/g, "/");
  const path = routeToPath(rel.replace(/^app\/api\/v1\//, "").replace(/\/route\.ts$/, ""));
  const methods = methodsInRouteFile(file);
  const specEntry = spec.paths?.[path];
  if (!specEntry) {
    console.error(`DRIFT: route ${rel} has no openapi path ${path}.`);
    failed = true;
    continue;
  }
  const specMethods = Object.keys(specEntry).filter((k) => ["get","post","put","patch","delete"].includes(k));
  const missing = methods.filter((m) => !specMethods.includes(m.toLowerCase()));
  const extra = specMethods.filter((m) => !methods.includes(m.toUpperCase()));
  if (missing.length) {
    console.error(`DRIFT: ${path} — route exports ${methods.join(",")} but openapi lacks ${missing.join(",")}.`);
    failed = true;
  }
  if (extra.length) {
    console.error(`DRIFT: ${path} — openapi declares ${extra.join(",")} but route file has no such handler.`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("OK: openapi.json is in sync with live routes (paths + methods).");