"use client";

import { useState } from "react";
import Link from "next/link";
import { parseQrPayload } from "@/lib/crypto/qr";
import { verifyCredential } from "@/lib/crypto/jws";
import { useTranslation } from "@/lib/i18n";

// The pubkey is fetched ONCE from /.well-known/pramanam-public-key and cached in
// localStorage — after that the verify path makes ZERO network calls (PRD M5.4).
// ponytail: cache never expires; key rotation (DECISION DOC G.4) bumps this key.
const LS_PUBKEY = "pm_pubkey_jwk";

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
    const r = await fetch("/api/v1/.well-known/pramanam-public-key");
    const j = await r.json();
    if (j?.ok && j.data?.kty === "OKP" && j.data?.x) {
      localStorage.setItem(LS_PUBKEY, JSON.stringify(j.data));
      return j.data as PubKeyJwk;
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

  async function onVerify() {
    setBusy(true);
    setResult(null);
    try {
      // accepts the pmnm.v1 QR envelope OR a bare compact JWS (Smarpit's isomorphic parser)
      const parsed = parseQrPayload(text);
      if (!parsed) {
        setResult({
          kind: "red",
          title: t("verify.offline.invalid", "TAMPERED OR UNREADABLE PAYLOAD"),
          detail:
            "Not a pmnm.v1 envelope and not a readable 3-segment compact JWS (header.payload.signature).",
        });
        return;
      }

      const jwk = await getPubKeyJwk();
      if (!jwk) {
        setResult({
          kind: "amber",
          title: t("verify.offline.unknown", "VERIFICATION KEY NOT CACHED"),
          detail:
            "Connect to the internet once to fetch the Pramanam public key — after that this page verifies fully offline.",
        });
        return;
      }

      const v = await verifyCredential(parsed.jws, jwk);
      if (!v.valid) {
        setResult({
          kind: "red",
          title: t("verdict.tampered", "CHECK FAILED — POSSIBLE FAKE"),
          detail:
            v.reason === "BAD_SIGNATURE"
              ? "Signature does not match the Pramanam public key — the payload was modified or was not issued by Pramanam. Report to your Local Legal Metrology office."
              : "The payload could not be decoded as a signed Pramanam certificate.",
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
          title: t("verify.offline.unknown", "SIGNATURE VERIFIED — VALIDITY UNKNOWN OFFLINE"),
          detail:
            "Signature is authentic but the signed claims carry no readable validity date.",
          claims,
        });
        return;
      }
      if (until <= new Date()) {
        setResult({
          kind: "red",
          title: t("verdict.expired", "EXPIRED"),
          detail: `Signature is authentic but the certificate expired on ${until.toLocaleDateString()}.`,
          claims,
        });
        return;
      }
      setResult({
        kind: "green",
        title: t("verify.offline.valid", "SIGNATURE VERIFIED (Ed25519)"),
        detail: `Valid until ${until.toLocaleDateString()}. Revocation status cannot be checked offline — verify online for the registry verdict.`,
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
        <Link
          href="/verify/PRM-CERT-2026-00001"
          className="mb-2 inline-flex items-center text-xs font-medium text-zinc-500 transition-colors hover:text-accent-700 dark:hover:text-accent-300"
        >
          ← Back to Online Verification
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
          {t("verify.offline.title", "Offline Sticker Payload Verifier")}
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Ed25519 verification of the signed payload in your browser — after the first
          key fetch, no network is used.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <label
          htmlFor="offline-payload"
          className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
        >
          {t("verify.offline.placeholder", "Sticker Payload / pmnm.v1 Envelope / JWS")}
        </label>
        <textarea
          id="offline-payload"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs text-zinc-900 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
          placeholder="https://…/verify/offline#pmnm.v1=eyJ2Ijo…  —or—  eyJhbGciOiJFZERTQSJ9.eyJ….<sig>"
        />

        <button
          onClick={onVerify}
          disabled={busy || text.trim().length === 0}
          className="mt-3 w-full rounded-full bg-zinc-950 py-2.5 text-xs font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
        >
          {busy ? "…" : t("verify.offline.button", "Validate Offline Signature & Claims")}
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