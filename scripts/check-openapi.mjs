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
if (failed) process.exit(1);
console.log("OK: openapi.json is in sync with live routes.");