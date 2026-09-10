# Demo Video

**PRAMANAM — SIH 2026 · PS SIH26036** · Live app: <https://sih-2026-pramanam.vercel.app/>

> ⚠️ **Walkthrough video:** the link below is added here right after the finals.
> Until then, the **live app itself is the demo** — every flow below can be run by any
> reviewer without login (public verify) or with the demo accounts documented in the README.

## What the demo shows

1. **Problem:** paper-based verification of weighing & measuring instruments under the
   Legal Metrology Act, 2009 — slow, fraud-prone, unverifiable publicly.
2. **Solution:** PRAMANAM's end-to-end digital workflow — register instrument → apply →
   officer inspection (GPS + photo evidence) → Ed25519-signed certificate → QR.
3. **Main features / workflow:**
   - Trader portal: instrument registration + verification applications.
   - LMO/GATC officer queue: inspection, check-in window, PASS with evidence.
   - State Admin dashboard: SLA monitoring, compliance exports.
   - **Public certificate verification — no login required** (online + offline QR).
4. **Actual working prototype:** run these on the live app:
   - `GET /api/v1/public/stats` → live counters (`ok: true`).
   - Verify a sample certificate from the landing page.
   - Log in with a demo account from the README (password `Passw0rd!demo`).

## Demo video link

*(added after finals — see note above)*

Keep the video focused on the actual project and make sure reviewers can access it without requesting permission.