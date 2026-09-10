# PRAMANAM — Architecture

**PRAMANAM (प्रमाणम्)** — *Digital Verification of Weighing & Measuring Instruments*
· SIH 2026 Problem Statement **SIH26036** · Legal Metrology Act, 2009 · Department of Consumer Affairs, GoI.

## Overview

PRAMANAM is a full-stack Next.js 14 (App Router) monolith written in TypeScript. React
pages in `app/**/page.tsx` call versioned REST route handlers under `app/api/v1`, all
answering a single JSON envelope `{ ok, data | error }` with a closed error-code set.
Authentication is JWT-based (access + rotating refresh families), RBAC covers
`ADMIN / TRADER / LMO / GATC / OFFICER`, and every state change is written to an immutable
audit log.

## Core flow: instrument → verifiable certificate

```text
Trader (web)                        PRAMANAM backend                    Authorities / Public
─────────────                       ─────────────────                   ─────────────────────
register instrument ──► ┌──────────────────────────────┐
with photo proof,       │ Next.js app/api/v1            │
serial, GPS-free meta   │  auth · instruments · apply   │
apply for verification  │  schedule · inspect · certify │
        ┌───────────────┤  uploads (MinIO, magic-byte) │
        ▼               │  notify (in-app)             │
  fee (demo mode)       │  search · public verify      │
        │               └──────┬───────────────┬───────┘
        ▼                      ▼               ▼
  LMO / GATC officer     Prisma/PostgreSQL   Redis + BullMQ
  inspection queue        (schema frozen)     queue (email/notify)
  GPS + photo evidence    audit log           nightly expiry ladder
        │                      │
        ▼                      ▼
  PASS ─────────────► Ed25519 JWS certificate (signed credential)
                       QR payload + PDF (pdf-lib) + sticker render
                              │
                              ▼
                  Public verify (online) + offline QR verify (no login)
```

## Key components

| Layer | Technology | Responsibility |
|---|---|---|
| Web | Next.js 14 App Router, React 18, Tailwind | Trader / Officer / Admin portals, public verify page |
| API | `app/api/v1/**` route handlers | Versioned REST, JSON envelope, rate-limited |
| Auth | `jose` JWTs (HS256) | Access tokens (15 min) + rotating refresh families with replay detection |
| Crypto | `lib/crypto` — Ed25519 JWS | Certificate signing, QR envelopes, tamper-evident credentials |
| Docs/PDF | `pdf-lib` + `qrcode` | Certificate PDF + QR sticker generation |
| Storage | PostgreSQL 16 (Prisma 6) + MinIO (S3) | Relational data, audit log, refresh families; document uploads with magic-byte sniffing |
| Queues | Redis + BullMQ (`workers/`) | Notifications, nightly expiry sweep (also a Vercel Cron) |
| Sharing | `packages/shared` | Frozen contracts: types + constants used by UI, API, seed, and the OpenAPI drift guard |
| Mobile | `mobile/` (Expo) | Companion app (in development) |

## Security properties

- **Tamper-evidence:** certificates are Ed25519-signed JWS; the public key is published at
  `/.well-known/pramanam-public-key`; verification is possible logged-out and offline (QR).
- **Production boot gate:** `instrumentation.ts` runs `assertProductionEnv()` — production
  refuses to start with demo/predictable secrets, missing crypto keys, or missing infra URLs.
- **Trust boundaries:** uploads are MIME-sniffed and size-limited; rate limiting is
  persisted in Redis; client IP honours `TRUST_PROXY` behind a real proxy.

## Deployment

- **Live:** Vercel — `https://sih-2026-pramanam.vercel.app/` (Next.js preset, Cront for the expiry sweep).
- **Fallback:** `render.yaml` Blueprint (web + worker + Postgres + Redis + MinIO on one host).
- Env contract: see `.env.example`; full runbook in `VERCEL_DEPLOYMENT.md`.

See the main [README](../README.md) for Quick Start, Demo Accounts, and the full API reference.