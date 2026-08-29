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
| `npm run db:seed` | Idempotent seed, prints `seeded already` on rerun |
| `npm run openapi:check` | Drift guard: OpenAPI path count must equal live route file count |

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
| POST | `/auth/register` | Password needs 8+ chars and a digit. Registering an ADMIN requires an ADMIN token. Duplicate email returns CONFLICT |
| POST | `/auth/login` | Returns `{ accessToken, user }` and sets the `pm_refresh` cookie. Failures are generic |
| POST | `/auth/refresh` | Rotates the refresh token. Replaying an older token revokes the whole family |
| POST | `/auth/logout` | Clears the refresh cookie |
| GET | `/auth/me` | Current user |

### Instruments

| Method | Path | Notes |
|---|---|---|
| GET | `/instruments` | Traders see their own, LMO/GATC their district, ADMIN everything. Filters: `district`, `category`, `q` (serial contains) |
| POST | `/instruments` | Trader only, multipart with optional purchase proof. Serial + district must be unique |
| GET, PATCH | `/instruments/{id}` | Owner, same-district officer, or ADMIN. Only `address` and `capacity` are mutable |
| GET | `/instruments/{id}/sticker` | Sticker render (not implemented yet) |

### Applications

| Method | Path | Notes |
|---|---|---|
| GET, POST | `/applications` | Trader only; must own the instrument. Starts in DRAFT with `feeAmount = FEE_PAISA` |
| GET | `/applications/{id}` | Detail |
| POST | `/applications/{id}/pay` | Demo payment, returns a receipt id |
| POST | `/applications/{id}/submit` | Requires payment and declaration. Auto-allocates an officer and returns `{ status: "SCHEDULED" }` |
| POST | `/applications/{id}/reschedule` | Trader, while SCHEDULED, at most 2 times, reason of 10+ chars |
| POST | `/applications/{id}/photos` | Trader or assigned officer; uploads photos and returns MinIO keys |

### Scheduling and inspection

| Method | Path | Notes |
|---|---|---|
| GET | `/schedule/mine` | Officer's queue, ordered by date, overdue jobs flagged |
| POST | `/schedule/checkin` | Assigned officer, within `[scheduledFor - 2h, +8h]` |
| POST | `/schedule/allocate` | Manual re-run of allocation |
| POST | `/inspections` | Multipart: result, observations (keys validated against `OBSERVATION_CONFIG`), photos, GPS. PASS fires the certificate hook |

### Notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | Own rows, newest first |
| PATCH | `/notifications/read` | `{ ids: [...] }` marks rows read |

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
| GET | `/openapi.json` | OpenAPI 3.0 document for all 33 paths |

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
`npm run openapi:check` fails the build if the number of paths in the document ever stops
matching the number of route files under `app/api/v1`.

## Frozen contracts

The following are shared across builders and must never be redefined — import them, do not edit
them. Ownership and day-to-day status live in `context.txt`.

- `packages/shared/constants.ts`, `types.ts`, `api.ts`, `mock.ts`
- `prisma/schema.prisma`
- `lib/db.ts`, `lib/hooks.ts`, `lib/hash.ts`
- `.env.example`, `docker-compose.yml`

## Status

| Phase | Owner | State |
|---|---|---|
| Auth, RBAC (MA1) | Manav | merged |
| Instruments, applications, uploads (MA2) | Manav | merged |
| Scheduling, allocation, inspection, PASS hook (MA3) | Manav | merged (MG1 complete) |
| Dashboards, notifications, exports, OpenAPI (MA4) | Manav | in review |
| Invites, xlsx, bulk seed (MA5, degradable) | Manav | pending |
| Certificate crypto and issuance (S1–S4, MG2) | Smarpit | merged |
| UI shell, i18n (K1, N1) | Kush, Nishka | merged |

Built for Smart India Hackathon 2026 — digitalization of Legal Metrology verification for the
Department of Consumer Affairs.