"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseQrPayload } from "@/lib/crypto/qr";
import { verifyCredential } from "@/lib/crypto/jws";
import { ConnectionBadge } from "@/components/ui";
import { useTranslation } from "@/lib/i18n";

// The pubkey is fetched ONCE from /api/v1/public/jwks (audit finding #91) and cached in
// localStorage — after that the verify path makes ZERO network calls (PRD M5.4).
// ponytail: cache never expires; key rotation (DECISION DOC G.4) bumps this key.
const LS_PUBKEY = "pm_pubkey_jwk";
// review: "OFFLINE MODE · LAST SYNCED 2 MIN AGO" — persist when the key cache
// was last refreshed so offline readiness is a visible, intentional state.
const LS_PUBKEY_SYNCED_AT = "pm_pubkey_synced_at";

interface PubKeyJwk {
  kty: string;
  crv: string;
  x: string;
}

type OfflineVerdict = {
  kind: "green" | "amber" | "red";
  title: string;
  detail: string;
  claims?: Record<string, unknown>;
};

async function getPubKeyJwk(): Promise<PubKeyJwk | null> {
  try {
    const cached = localStorage.getItem(LS_PUBKEY);
    if (cached) return JSON.parse(cached) as PubKeyJwk;
  } catch {
    // corrupted cache -> refetch
  }
  try {
    // AUDIT FINDING #91: sync from the real JWKS endpoint (kid-aware, rotation
    // ready). The old /.well-known/pramanam-public-key URL is superseded —
    // GET /api/v1/public/jwks returns { keys: [{ kid, active, fingerprint, jwk }] }.
    const r = await fetch("/api/v1/public/jwks");
    const j = await r.json();
    const keys = j?.ok && Array.isArray(j.data?.keys) ? j.data.keys : [];
    const entry = keys.find((k: { active?: boolean }) => k.active) ?? keys[0];
    const jwk = entry?.jwk;
    if (jwk?.kty === "OKP" && jwk?.x) {
      localStorage.setItem(LS_PUBKEY, JSON.stringify(jwk));
      localStorage.setItem(LS_PUBKEY_SYNCED_AT, String(Date.now()));
      return jwk as PubKeyJwk;
    }
  } catch {
    // offline with no cache — nothing we can verify
  }
  return null;
}

export default function VerifyOfflinePage() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OfflineVerdict | null>(null);
  // Offline mode is a first-class operating mode, not an error state: show the
  // connection mode + whether the verification key is already cached locally.
  const [online, setOnline] = useState(true);
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    try {
      setKeyReady(Boolean(localStorage.getItem(LS_PUBKEY)));
      const raw = localStorage.getItem(LS_PUBKEY_SYNCED_AT);
      setSyncedAt(raw ? Number(raw) : null);
    } catch {
      setKeyReady(false);
    }
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // relative freshness, e.g. "2 min ago" / "3 hr ago" — for the mode strip
  const lastSyncedLabel = (() => {
    if (!syncedAt) return null;
    const mins = Math.floor((Date.now() - syncedAt) / 60000);
    if (mins < 1) return t("offline.justNow", "just now");
    if (mins < 60) return t("offline.minAgo", "{n} min ago").replace("{n}", String(mins));
    const hrs = Math.floor(mins / 60);
    return t("offline.hrAgo", "{n} hr ago").replace("{n}", String(hrs));
  })();

  async function onVerify() {
    setBusy(true);
    setResult(null);
    try {
      // accepts the pmnm.v1 QR envelope OR a bare compact JWS (Smarpit's isomorphic parser)
      const parsed = parseQrPayload(text);
      if (!parsed) {
        setResult({
          kind: "red",
          title: t("verify.offline.invalid"),
          detail: t("offline.detail.invalid"),
        });
        return;
      }

      const jwk = await getPubKeyJwk();
      if (!jwk) {
        setResult({
          kind: "amber",
          title: t("verify.offline.unknown"),
          detail: t("offline.detail.noKey"),
        });
        return;
      }

      const v = await verifyCredential(parsed.jws, jwk);
      if (!v.valid) {
        setResult({
          kind: "red",
          title: t("verdict.tampered"),
          detail:
            v.reason === "BAD_SIGNATURE"
              ? t("offline.detail.badSignature")
              : t("offline.detail.undecodable"),
        });
        return;
      }

      // signature OK — validity is read from the SIGNED claims, so still offline-safe
      const claims = v.payload as Record<string, unknown>;
      const until =
        typeof claims.validUntil === "string" ? new Date(claims.validUntil) : null;
      if (!until || Number.isNaN(until.getTime())) {
        setResult({
          kind: "amber",
          title: t("verify.offline.unknown"),
          detail: t("offline.detail.noValidity"),
          claims,
        });
        return;
      }
      if (until <= new Date()) {
        setResult({
          kind: "red",
          title: t("verdict.expired"),
          detail: `${t("offline.detail.expired")} ${until.toLocaleDateString()}.`,
          claims,
        });
        return;
      }
      setResult({
        kind: "green",
        title: t("verify.offline.valid"),
        detail: `${t("offline.detail.validPrefix")} ${until.toLocaleDateString()}. ${t("offline.detail.onlineNote")}`,
        claims,
      });
    } finally {
      setBusy(false);
    }
  }

  const toneCls: Record<OfflineVerdict["kind"], string> = {
    green:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300",
    amber:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300",
    red: "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300",
  };
  const icon = result?.kind === "green" ? "✓" : result?.kind === "amber" ? "!" : "✕";

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <Link
            href="/verify/PRM-CERT-2026-00001"
            className="inline-flex items-center text-xs font-medium text-zinc-500 transition-colors hover:text-accent-700 dark:hover:text-accent-300"
          >
            {t("offline.backOnline")}
          </Link>
          <ConnectionBadge online={online} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
          {t("offline.modeTitle", "Offline Verification Mode")}
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          {t("offline.intro")}
        </p>
        {/* review: OFFLINE MODE · LAST SYNCED 2 MIN AGO — offline readiness is a
            feature, not a fallback. Amber/blue pill mirrors the ConnectionBadge. */}
        <p
          className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${
            online
              ? "bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-700"
              : "bg-blue-50 text-blue-700 ring-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-700"
          }`}
        >
          {online ? t("offline.onlineMode", "ONLINE MODE") : t("offline.offlineMode", "OFFLINE MODE")}
          <span aria-hidden="true" className="opacity-50">·</span>
          {t("offline.lastSynced", "LAST SYNCED")}{" "}
          <span className="normal-case">
            {lastSyncedLabel ?? t("offline.never", "never")}
          </span>
        </p>
        <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11px] leading-snug text-blue-800 dark:border-blue-800/40 dark:bg-blue-950/40 dark:text-blue-300">
          {t(
            "offline.explain",
            "No internet connection is required to validate previously downloaded verification data. Cryptographic checks run entirely on this device."
          )}
        </p>
        {/* Key cache status — tells the officer whether offline use will work */}
        {keyReady !== null && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                keyReady
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
              }`}
            >
              {keyReady ? "✓" : "!"}
            </span>
            {keyReady
              ? t("offline.keyReady", "Verification key downloaded — ready for offline use")
              : t("offline.keyMissing", "Connect once to download the verification key")}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <label
          htmlFor="offline-payload"
          className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
        >
          {t("verify.offline.placeholder")}
        </label>
        <textarea
          id="offline-payload"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
          placeholder="https://…/verify/offline#pmnm.v1=eyJ2Ijo…  —or—  eyJhbGciOiJFZERTQSJ9.eyJ….<sig>"
        />

        <button onClick={onVerify} disabled={busy || text.trim().length === 0} className="btn btn-primary mt-3 w-full">
          {busy ? t("offline.verifying", "Verifying…") : t("verify.offline.button")}
        </button>

        <div aria-live="polite">
          {result && (
            <div className={`mt-5 rounded-xl border p-4 text-sm ${toneCls[result.kind]}`}>
              <div className="flex items-center gap-2 font-bold">
                <span aria-hidden="true" className="text-lg">
                  {icon}
                </span>
                <span>{result.title}</span>
              </div>
              <p className="mt-1 text-xs opacity-90">{result.detail}</p>
              {result.claims && (
                <pre className="mt-3 max-h-48 overflow-auto rounded bg-black/80 p-2.5 font-mono text-[10px] text-emerald-300">
                  {JSON.stringify(result.claims, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}