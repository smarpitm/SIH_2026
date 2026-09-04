# PRAMANAM

Online verification system for weighing and measuring instruments under the Legal Metrology
Act, 2009 (Department of Consumer Affairs). Built for Smart India Hackathon 2026 (SIH26036).

Traders register instruments and apply for verification online. Legal Metrology Officers (LMO)
and GATC centres schedule and conduct field inspections. On a pass, the system issues a
certificate as an Ed25519-signed JWS with a QR payload that anyone can verify — including fully
offline from a sticker.

## How it works

```
Trader                  PRAMANAM                        LMO / GATC             Public
  |                        |                               |                      |
  | 1. register, login     |  JWT + RBAC + jurisdiction    |                      |
  |----------------------->|                               |                      |
  | 2. add instrument      |  proof upload -> MinIO        |                      |
  | 3. apply, pay, submit  |  DRAFT -> SUBMITTED           |                      |
  |                        |------------------------------>| auto-allocation      |
  |                        |  SUBMITTED -> SCHEDULED       | (least loaded)       |
  |                        |                               | 4. /schedule/mine    |
  |                        |                               | 5. check-in          |
  |                        |                               | 6. inspection        |
  |                        |<------------------------------|    PASS / FAIL       |
  |                        | emitInspectionPass() hook     |                      |
  | 7. CERT_ISSUED bell <--| Certificate (JWS + QR)        |                      |
  |                        |                               |                      | 8. verify badge / QR / sticker
```

1. A trader registers instruments (six categories) and uploads a purchase proof. Uploads are
   magic-byte sniffed (JPEG/PNG/WEBP/PDF only, 10 MB cap) and stored in MinIO.
2. An application goes through apply, pay (demo payment), submit with declaration. Submit
   auto-allocates the least-loaded LMO/GATC officer in the instrument's district and moves the
   application to SCHEDULED.
3. The officer checks in within a time window around the scheduled slot, then records the
   inspection: result, observations (validated against a frozen config), photos, GPS.
4. On PASS, a certificate hook issues a signed certificate and notifies the trader. Traders and
   the public verify certificates by ID, QR, or sticker — the signature check runs in the browser.

## Architecture in one paragraph

PRAMANAM is a single Next.js 14 (App Router) full-stack TypeScript monolith: React client pages in
`app/**/page.tsx` talk to versioned REST route handlers under `app/api/v1`, all answering one JSON
envelope (`{ ok, data | error }`, closed error-code set). Route handlers share server libraries —
`lib/auth` (JWT sessions, RBAC, jurisdiction guards, state-machine transitions, audit log),
`lib/uploads` (MinIO multipart with magic-byte sniffing), `lib/crypto` (Ed25519 JWS signing, QR
envelopes, certificate issuance), and `lib/pdf` — over PostgreSQL via Prisma (`prisma/schema.prisma`
is frozen). Cross-cutting reactions go through the frozen `emitInspectionPass` hook into the worker
registry (`workers/`), which also runs the nightly BullMQ expiry ladder; frozen shared contracts
(`packages/shared`) keep UI, API, and seed in lock-step, with an OpenAPI drift guard failing the
build when they diverge.

---
## Tech stack

- Next.js 14 (App Router) — full-stack TypeScript monolith, Tailwind CSS
- PostgreSQL with Prisma ORM (v6)
- Redis + BullMQ (worker registry)
- MinIO (S3-compatible) for purchase proofs, inspection photos, certificate PDFs
- jose for JWT auth, zod for route validation
- node:crypto Ed25519 for certificate signing, qrcode and pdf-lib for QR and PDF

## Setup

Requires Node.js >= 20 (the offline verify page uses WebCrypto Ed25519) and Docker.

```bash
npm install

# postgres + redis + minio
docker compose up -d

# environment: copy the template, fill in what you need (never commit real keys)
cp .env.example .env

# schema and idempotent seed (6 users, 6 instruments)
npm run db:push
npm run db:seed

npm run dev
```

The app runs on http://localhost:3000. MinIO console is on http://localhost:9001
(default `pramanam` / `pramanam123`). The docs page renders the OpenAPI spec.

### Dev/build isolation

`next dev` writes `.next` and `next build` writes `.next-build` (see
`next.config.mjs`), so running a production build can never corrupt a running
dev server. Override with `NEXT_DIST_DIR` if a deployment needs a specific
output directory. Behind a real proxy, also enforce an upload body limit there
(e.g. nginx `client_max_body_size 25m`) — the API additionally rejects oversized
requests from the `Content-Length` header before buffering.

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection (optional for API-only development) |
| `JWT_SECRET` | Signs access tokens (HS256, 15 minutes) |
| `JWT_REFRESH_SECRET` | Signs rotating refresh tokens (7 days) |
| `ED25519_PRIVATE_KEY` / `ED25519_PUBLIC_KEY` | Base64 PKCS8 / SPKI PEM used to sign certificates. If unset, an ephemeral dev pair is generated and printed on boot — paste it into `.env` (never into `.env.example`) |
| `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | MinIO connection; the bucket is created automatically with versioning |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app |
| `PAYMENT_MODE` | `demo` (default) = explicit mock payment; any other value refuses to record payment until a real gateway is integrated. Production boots fail unless `PAYMENT_MODE=demo` AND `ALLOW_DEMO_PAYMENT=true` |
| `TRUST_PROXY` | Set `true` only when sitting behind a trusted proxy — enables `x-forwarded-for` for rate-limit keys |
| `NEXT_PUBLIC_DEMO_MODE` | `true` shows demo-credential presets on the login page |

### Seeded accounts

All passwords are `Passw0rd!demo`.

| Role | Email | Notes |
|---|---|---|
| ADMIN | `admin@demo.in` | State Admin |
| TRADER | `ravi@demo.in` | Guntur, Ravi Traders |
| TRADER | `laxmi@demo.in` | Krishna |
| LMO | `lmo.guntur@demo.in` | Guntur district |
| LMO | `lmo.krishna@demo.in` | Krishna district |
| GATC | `gatc@demo.in` | GATC centre |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run db:push` | Push Prisma schema to the database |
| `npm run db:indexes` | Apply `prisma/search-indexes.sql` (pg_trgm GIN indexes for `contains` search + FK btree indexes; idempotent) |
| `npm run db:seed` | Idempotent seed, prints `seeded already` on rerun |
| `npm run openapi:check` | Drift guard: OpenAPI paths and methods must equal the live route tree |
| `npm run worker` | Run the expiry worker as a separate process (`ENABLE_WORKERS=true`) |

To reset to a pristine demo state (wipes all data):

```bash
npx prisma db push --force-reset && npm run db:seed
```

### Demo walkthrough (PRD §14) and end-to-end tests

The demo-critical path is covered by HTTP-level vitest suites — plain `fetch`, deterministic
(no sleeps; bounded polling). They run against a **live dev server** on `http://localhost:3000`
(override with `PRAMANAM_TEST_URL`):

```bash
npx prisma db push --force-reset && npm run db:seed   # fresh DB
npm run dev                                            # terminal 1
npm test                                               # terminal 2
```

- `tests/smoke.spec.ts` — the PRD §14 happy path: login seeded trader → create instrument with a
  photo proof → apply NEW → pay → submit (auto-allocates) → officer check-in → inspection PASS →
  asserts the Certificate DB row is ACTIVE with a 3-segment JWS → asserts the public badge verdict
  is VALID with a passing signature and exactly 5 anchors.
- `tests/negative.spec.ts` — the negative battery, asserting exact error envelopes: cross-district
  LMO fetch → `JURISDICTION_FORBIDDEN`, forced issue on a not-PASSED application →
  `INVALID_STATE_TRANSITION { from, to: "CERT_ISSUED" }`, and a text file renamed `.jpg` →
  `UNSUPPORTED_MEDIA_TYPE` (magic-byte sniff).

---
## Application state machine

```
           pay + declaration       auto-allocation          check-in window
DRAFT ────────────────────► SUBMITTED ─────────────► SCHEDULED ────────────► CHECKED_IN
                                 ▲  │                  │                     │
                                 │  └─ reschedule (2)  │                     ▼
                                 └─ REJECTED / FAILED │              PASS or FAIL
                                                      │                     │
                                             (missed slot = SLA)          │
                                                  PASSED ─────────────────┘
                                                    └─► CERT_ISSUED (cert hook)
```

Transitions live in `packages/shared/constants.ts` (`TRANSITIONS`). An illegal move returns
`INVALID_STATE_TRANSITION` with `{ from, to }` details.

## API

All endpoints answer with one envelope:

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "error": { "code": "AUTH_REQUIRED", "message": "...", "details": {} } }
```

Error codes are a closed set: `VALIDATION_ERROR` (400), `AUTH_REQUIRED` (401), `AUTH_FORBIDDEN`
(403), `JURISDICTION_FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409),
`INVALID_STATE_TRANSITION` (409), `RESCHEDULE_BUDGET_EXHAUSTED` (409), `UNSUPPORTED_MEDIA_TYPE`
(415), `RATE_LIMITED` (429, reserved), `INTERNAL` (500).

### Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Public signup is trader-only (8+ chars + a digit, max 72). LMO/GATC/ADMIN accounts come from an ADMIN invite. Duplicate email returns CONFLICT |
| POST | `/auth/invite` | ADMIN only; creates LMO/GATC with a unique one-time password shown once (user must change it on first login) |
| POST | `/auth/login` | Returns `{ accessToken, user }` and sets the `pm_refresh` cookie. Failures are generic; failed attempts are rate-limited per account |
| POST | `/auth/refresh` | Rotates the refresh token against a durable (Postgres) family. Replaying an older token revokes the whole family |
| POST | `/auth/change-password` | Authenticated rotation; clears `mustChangePassword` for invited officers |
| POST | `/auth/logout` | Clears the refresh cookie |
| GET | `/auth/me` | Current user |

### Instruments

| Method | Path | Notes |
|---|---|---|
| GET | `/instruments` | Traders see their own, LMO/GATC their district, ADMIN everything. Filters: `district`, `category`, `q` (serial contains) |
| POST | `/instruments` | Trader only, multipart with optional purchase proof. Serial + district must be unique |
| GET, PATCH | `/instruments/{id}` | Owner, same-district officer, or ADMIN. Only `address` and `capacity` are mutable |
| GET | `/instruments/{id}/sticker` | Renders the A6 sticker for the instrument's ACTIVE certificate and returns a presigned download URL |

### Applications

| Method | Path | Notes |
|---|---|---|
| GET, POST | `/applications` | Trader only; must own the instrument. Starts in DRAFT with `feeAmount = FEE_PAISA`; a second open application per instrument is rejected (CONFLICT) |
| GET | `/applications/{id}` | Detail |
| POST | `/applications/{id}/pay` | Payment is DRAFT-only, idempotent and audited. `PAYMENT_MODE=demo` (default) runs the explicit demo mock (`demo: true` in the response); any other mode refuses to record payment until a real gateway is integrated |
| POST | `/applications/{id}/submit` | One transaction: declaration + payment gate, officer pick before any write, auto-allocation → returns `{ status: "SCHEDULED" }`. Rolls back untouched if no officer exists |
| POST | `/applications/{id}/reschedule` | Trader, while SCHEDULED, at most 2 times; requires `{ reason, newDate }` and commits atomically |
| POST | `/applications/{id}/photos` | Trader or assigned officer; uploads photos and returns MinIO keys |

### Scheduling and inspection

| Method | Path | Notes |
|---|---|---|
| GET | `/schedule/mine` | Officer's queue, ordered by date, overdue jobs flagged |
| POST | `/schedule/checkin` | Assigned officer, within `[scheduledFor - 2h, +8h]` |
| POST | `/schedule/allocate` | Manual re-run of allocation |
| POST | `/inspections` | Multipart: result, observations (full schema from `OBSERVATION_CONFIG`), ≥1 photo, GPS. PASS issues the certificate in the same transaction → application lands in CERT_ISSUED; FAIL requires a reason. Uploads are capped at the request level (Content-Length) before buffering, and photo fields accept image MIME types only |

### Notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | Own rows, newest first |
| PATCH | `/notifications/read` | `{ ids: [...] }` marks rows read |
| GET, PUT | `/notifications/preferences` | Per-user toggles (`certIssued`, `revocation`, `expiryReminder`, `sla`). Missing row = all enabled; certificate/revoke/expiry writes respect them |

### Dashboards

| Method | Path | Notes |
|---|---|---|
| GET | `/dashboards/trader` | Pending applications, verified this month, expiring in 30 days, SLA breaches |
| GET | `/dashboards/officer` | Today's queue, overdue count, personal stats |
| GET | `/dashboards/admin` | Org-wide KPIs, pending applications per district, top 5 officers by inspections |

### Reports and public

| Method | Path | Notes |
|---|---|---|
| GET | `/reports/export` | `?entity=instruments|applications|certificates&format=csv`. Admin exports all, officers their district, traders their own. Excel-safe (BOM, formula-injection guard). `format=xlsx` is rejected until MA5 |
| GET | `/public/certificates/{certId}` | Public verify badge |
| GET | `/public/certificates/lookup` | Lookup by serial |
| GET | `/public/stats` | Public aggregate stats |
| GET | `/.well-known/pramanam-public-key` | Verification key |
| GET | `/openapi.json` | OpenAPI 3.0 document for every live route (bundled at build — no runtime file read) |

---
## Repo layout

```
app/                  Next.js App Router: UI pages and /api/v1 route modules
components/           Shared React components (Badge, StatusChip, PhotoInput, CountdownRing)
lib/
  auth/               JWT, session, RBAC, jurisdiction, state transitions, audit log
  uploads/            MinIO client, multipart parsing, magic-byte validation
  notify/             Notification helper
  crypto/             Ed25519 keys, JWS, QR, certificate issuance (Smarpit)
  pdf/                Certificate and sticker renders (Smarpit)
  i18n/               English and Hindi translations (Nishka)
  db.ts, hooks.ts, hash.ts   Frozen: Prisma singleton, PASS hook, scrypt hashing
packages/shared/      Frozen contracts: constants, types, api envelope, mock
prisma/               schema.prisma (frozen) and seed
workers/              BullMQ worker registry (Smarpit)
scripts/              openapi.json and the check-openapi.mjs drift guard
context.txt           Live project state, ownership matrix, frozen-contract rules
```

## Certificates and crypto

A certificate is a compact JWS signed with Ed25519 (`alg: "EdDSA"`), produced in `lib/crypto/`:

- `keys.ts` — key generation and env loading. Keys come from `ED25519_PRIVATE_KEY` and
  `ED25519_PUBLIC_KEY` (base64 PEM) in `.env`. If they are unset, an ephemeral dev pair is
  generated and printed on boot; paste it into `.env` and never commit real keys.
- `jws.ts` — `signCredential` (server) and `verifyCredential` (isomorphic WebCrypto, so the same
  check runs in the browser for the offline verify page).
- `qr.ts` — the `pmnm.v1` QR envelope. The signed JWS travels inside the QR, so a sticker works
  without network.
- `issue.ts` — the issuance service behind the inspection PASS hook. Idempotent per application,
  and it writes the CERT_ISSUED notification.

A self-check covers signing, verification, tamper detection, and QR round-trips:

```bash
npx tsx lib/crypto/selftest.ts
```

The OpenAPI document is served at `GET /api/v1/openapi.json` and rendered by the docs page.
`npm run openapi:check` fails if the document and the live route tree drift apart (path
counts AND method sets per path are compared).

## Frozen contracts

The following are shared across builders and must never be redefined — import them, do not edit
them. Ownership and day-to-day status live in `context.txt`.

- `packages/shared/constants.ts`, `types.ts`, `api.ts`, `mock.ts`
- `prisma/schema.prisma`
- `lib/db.ts`, `lib/hooks.ts`, `lib/hash.ts`
- `.env.example`, `docker-compose.yml`

## Deployment (Render)

The app is built to run on **Render** as a classic long-running Node deployment, not on a
serverless host like Vercel — the app needs a persistent Postgres, Redis, MinIO (strictly
required: there is no filesystem upload fallback), and a separate long-running worker process.
Everything is defined in one infra-as-code file:

- `render.yaml` — Render Blueprint: the web service, the worker, MinIO, Postgres, and Redis.
- `prestart.sh` — boot sequence for the web service: applies `prisma db push`, the search
  indexes (`db:indexes`), the idempotent demo seed, then `next start`.

### Architecture

| Service | How it runs |
|---|---|
| **pramanam-web** | Next.js (`npm run build` → `npm start`). Serves the UI + all `/api/v1` routes |
| **pramanam-worker** | `npm run worker` — separate BullMQ process: nightly expiry ladder (00:30 IST) + one-shot repair sweep for applications stranded in `PASSED` |
| **pramanam-minio** | MinIO S3-compatible server on a persistent disk; all uploads/stickers/PDFs |
| **pramanam-postgres** | managed Render Postgres (free tier) |
| **pramanam-redis** | managed Render Redis (free tier) |

### Required production env vars

`lib/security/env.ts` **refuses to boot** in `NODE_ENV=production` unless all of these are set —
with real, non-demo values:

| Env | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres | wired from the Blueprint Postgres |
| `REDIS_URL` | Redis (rate limiting + BullMQ) | wired from the Blueprint Redis |
| `JWT_SECRET` | access-token signing | ≥32 chars, no demo markers |
| `JWT_REFRESH_SECRET` | refresh tokens | ≥32 chars |
| `ED25519_PRIVATE_KEY`| certificate signing | base64 PKCS8; ephemeral gen is DISABLED in prod |
| `ED25519_PUBLIC_KEY` | public verify key | base64 SPKI |
| `S3_ENDPOINT`| MinIO | `http://pramanam-minio:9000` |
| `S3_ACCESS_KEY`/`S3_SECRET_KEY`| MinIO creds| must NOT be demo `pramanam`/`pramanam123` |
| `S3_BUCKET` | MinIO bucket | `pramanam-docs` |
| `NEXT_PUBLIC_APP_URL`| QR/badge/links | must be `https://` |
| `PAYMENT_MODE=demo` | demo payment path | + `ALLOW_DEMO_PAYMENT=true` |

Secrets marked `sync: false` in `render.yaml` (all of the above) are filled in the Render
dashboard after the Blueprint first provisions — or left blank for Render to generate. Only the
worker needs `ENABLE_WORKERS=true`; the web service sets it `false` per the audit isolation rule.

### One-click deploy

1. Push `main` (this file is already committed).
2. On https://dashboard.render.com: **New → Blueprint** → select the repo.
3. Render parses `render.yaml` and proposes services/add-ons; accept.
4. In the dashboard, set the `sync:false` secrets on **pramanam-web** (+ the same on the worker and MinIO).
5. Render deploys. The web's `healthCheckPath: /api/v1/public/stats` turns green when it's ready.

Render wires the internal urls (`http://pramanam-minio:9000`) and the Postgres/Redis
connection strings automatically. The seed runs only on an empty DB (idempotent), so re-deploys
never duplicate demo data.

> **Why not Vercel?** The app is a long-running server: BullMQ worker process, Prisma's binary
> engine (needs OpenSSL at runtime), persistent Redis/Postgres/MinIO, and background jobs.
> Vercel's serverless model has none of these. Render fits the "one long-lived process" model natively.

---
## Status

| Phase | Owner | State |
|---|---|---|
| Auth, RBAC (MA1) | Manav | merged |
| Instruments, applications, uploads (MA2) | Manav | merged |
| Scheduling, allocation, inspection, PASS hook (MA3) | Manav | merged (MG1 complete) |
| Dashboards, notifications, exports, OpenAPI (MA4) | Manav | merged |
| Officer invites + one-time credentials, change-password (MA5) | Manav | merged |
| Certificate crypto and issuance (S1–S4, MG2) | Smarpit | merged |
| UI shell, i18n (K1, N1) | Kush, Nishka | merged |
| Production hardening per PROJECT_AUDIT.md | Manav + Smarpit | see PROJECT_AUDIT.md Fix Status |

Built for Smart India Hackathon 2026 — digitalization of Legal Metrology verification for the
Department of Consumer Affairs.