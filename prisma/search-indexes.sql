-- prisma/search-indexes.sql — production search/scalability indexes.
-- Idempotent (IF NOT EXISTS everywhere). Applied with: npm run db:indexes
-- (prisma db execute --file prisma/search-indexes.sql).
--
-- AUDIT FINDING #32: the search route uses case-insensitive `contains` (ILIKE
-- '%term%') over instrument serial/make/model and certificate certId. The GIN
-- pg_trgm indexes below (built on lower(...) so ILIKE can use them) turn those
-- queries from sequential scans into index scans. Btree indexes at the bottom
-- cover the common FK/status filters used by dashboards, lists and the
-- allocation workload query.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- contains search over instrument identity fields (GET /instruments?q=,
-- /search)
CREATE INDEX IF NOT EXISTS "Instrument_serialNumber_trgm"
  ON "Instrument" USING gin (lower("serialNumber") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Instrument_make_trgm"
  ON "Instrument" USING gin (lower("make") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Instrument_model_trgm"
  ON "Instrument" USING gin (lower("model") gin_trgm_ops);

-- certificate id contains search (/search, certificate lookups)
CREATE INDEX IF NOT EXISTS "Certificate_certId_trgm"
  ON "Certificate" USING gin (lower("certId") gin_trgm_ops);

-- FK / status filter support for lists, dashboards and allocation
CREATE INDEX IF NOT EXISTS "Instrument_ownerId_idx" ON "Instrument" ("ownerId");
CREATE INDEX IF NOT EXISTS "Application_instrumentId_idx" ON "Application" ("instrumentId");
CREATE INDEX IF NOT EXISTS "Application_status_idx" ON "Application" ("status");
CREATE INDEX IF NOT EXISTS "Certificate_instrumentId_idx" ON "Certificate" ("instrumentId");
CREATE INDEX IF NOT EXISTS "Certificate_status_idx" ON "Certificate" ("status");
CREATE INDEX IF NOT EXISTS "Schedule_assigneeId_idx" ON "Schedule" ("assigneeId");
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification" ("userId");
