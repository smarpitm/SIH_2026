# PRAMANAM

Online verification system for weighing & measuring instruments under the Legal
Metrology framework. Traders apply online, LMO/GATC officers schedule and perform
field inspections, and certificates are issued as signed QR payloads
(Ed25519 + JWS) with public badge verification and an offline sticker-parse mode.

## Tech Stack

- **Next.js 14** (app router) — full-stack monolith, TypeScript, Tailwind, ESLint
- **PostgreSQL + Prisma ORM** (v6 pinned)
- **Redis + BullMQ** job queues (ioredis)
- **MinIO** — S3-compatible object storage (`@aws-sdk/client-s3`)
- **node:crypto Ed25519** — signatures / JWS / QR certificate payloads
- `jose`, `qrcode`, `pdf-lib`, `zod`, `zustand`, `vitest`, `tsx`

## Getting Started

### Prerequisites

- Node.js >= 20 (WebCrypto Ed25519 verify needs >= 20)
- Docker (for Postgres / Redis / MinIO infra)

### Setup

```bash
npm install

# infra: postgres + redis + minio
docker compose up -d

# env: copy the template and fill it in (never commit real keys)
cp .env.example .env

# schema + demo data (idempotent seed: 6 users, 6 instruments)
npm run db:push
npm run db:seed

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run test` | vitest |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | next lint |
| `npm run db:push` | push Prisma schema to Postgres |
| `npm run db:seed` | idempotent seed (prints "seeded already" on rerun) |

## Repo Layout

```
app/            Next.js app router: UI pages + /api/v1 routes
components/     Shared React components (Badge, StatusChip, PhotoInput, CountdownRing)
lib/            Core server libs (db, hooks, hash) + owner dirs:
                  auth/     jwt/session/rbac
                  uploads/  minio/multipart
                  notify/   notifications
                  crypto/   keys, JWS, QR (see below)
                  pdf/      certificate/sticker renders
                  i18n/     translations (en/hi)
packages/shared/ Frozen contracts: constants, types, api, mock
prisma/         schema.prisma (frozen) + seed.ts
workers/        BullMQ worker registry
```

## Cryptography & Verification

Certificates are compact JWS tokens signed with **Ed25519** (`alg: "EdDSA"`),
built in `lib/crypto/`:

- `keys.ts` — keygen + env loading. Keys come from `ED25519_PRIVATE_KEY` /
  `ED25519_PUBLIC_KEY` (base64 PEM) in `.env`. **Never commit real keys** —
  `.env` is gitignored; `.env.example` only holds empty placeholders.
- `jws.ts` — `signCredential` (server, node:crypto) and `verifyCredential`
  (**isomorphic** WebCrypto — runs in Node >= 20 and modern browsers, which is
  what powers the offline verify page).
- `qr.ts` — the `pmnm.v1` QR envelope. The **signed JWS travels inside the QR**,
  so a sticker works fully offline. `qrDataUrl` renders PNG at ECC level Q.

Run the crypto self-check (8 cases: sign/verify, tamper flips, QR round-trip):

```bash
npx tsx lib/crypto/selftest.ts
```

## Project Context

Day-to-day development state, ownership matrix, and frozen-contract rules live
in [`context.txt`](./context.txt). Read it before touching shared paths —
`packages/shared/**`, `prisma/schema.prisma`, `lib/db.ts`, `lib/hooks.ts`,
`lib/hash.ts`, and `.env.example` are frozen.

