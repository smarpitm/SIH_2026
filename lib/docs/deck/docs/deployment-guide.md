# PRAMANAM — Deployment & Environment Guide

## 1. Environment Variables (`.env.example`)
* `NEXT_PUBLIC_APP_URL`: Set to production domain.
* `NEXT_PUBLIC_DEFAULT_LOCALE`: Default fallback locale (`en`).

## 2. Production Build Commands
* Run strict type-check: `npm run type-check`
* Run parity validation: `npx tsx lib/i18n/check-parity.ts`
* Build production package: `npm run build`

## 3. Deployment Flow (Vercel/Netlify)
1. Link GitHub `main` branch to deployment platform.
2. Ensure automatic build triggers on merge to `main`.
3. Set custom environment key overrides in project dashboard settings.