#!/usr/bin/env bash
# prestart.sh — Render web-service boot sequence.
#
# Applies the Prisma schema and the production search indexes to the managed
# Postgres, runs the idempotent demo seed (no-op when data already exists),
# then hands over to `npm start`. Every step uses the app's own package scripts
# so this stays the single source of truth.
#
# The seed is safe to run on every boot because prisma/seed.ts short-circuits
# when the DB is not empty.

set -euo pipefail

echo "[prestart] NODE_ENV=${NODE_ENV:-development}"

echo "[prestart] applying Prisma schema (db push)..."
npm run db:push

echo "[prestart] applying search indexes (db:indexes)..."
npm run db:indexes

echo "[prestart] seeding demo data (idempotent)..."
npm run db:seed

echo "[prestart] boot sequence complete — starting Next.js"
# npm start runs `next start` (package.json "start": implied by build) with the
# production dist dir (next.config.mjs: NEXT_DIST_DIR=.next-build when prod).
exec npm start