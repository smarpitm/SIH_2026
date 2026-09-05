# Pramanam Mobile (React Native · Expo)

Native Android/iOS app for **Pramanam** (SIH 2026). This is the mobile client for the
existing Next.js backend — it talks to the deployed REST API at
`https://pramanam.onrender.com/api/v1/*` (see the parent repo's `app/api`).

## What's implemented

- **Login** (`/api/v1/auth/login`) — access token in Expo SecureStore; refresh token
  rides the native cookie jar, and the API client single-flight refreshes on 401
  exactly like the web client (`components/api-client.ts`).
- **Role dashboard** (`/api/v1/dashboards/{role}`) — pending apps, verified this
  month, expiring in 30 days, SLA breaches.
- **Public certificate verify** (`/api/v1/public/certificates/lookup`) — no login
  needed; enter cert ID or instrument serial, see verdict (VALID / EXPIRING_SOON /
  EXPIRED / REVOKED), signature status, PRD anchors and history.
- **Profile + logout** (`/api/v1/auth/logout`).

## Develop

```bash
cd mobile
npm install
npm start          # scan the QR with Expo Go
```

Point at a different backend via `.env` (see `.env.example`):

```
EXPO_PUBLIC_API_URL=http://192.168.1.5:3000
```

## Build an APK

Cloud (no local Android toolchain needed):

```bash
npm i -g eas-cli
eas login
eas build -p android --profile preview   # preview profile builds an installable .apk
```

Local (requires Android SDK + JDK 17):

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# output: android/app/build/outputs/apk/release/app-release.apk
```

Demo credentials (seeded): `ravi@demo.in` / `Passw0rd!demo`
