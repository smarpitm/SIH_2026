"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import type { BadgeDTO } from "@/packages/shared/types";

export default function VerifyPage() {
  const { certId } = useParams<{ certId: string }>();
  const router = useRouter();

  const [badge, setBadge] = useState<BadgeDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [typedId, setTypedId] = useState("");

  useEffect(() => {
    setLoading(true);
    setNotFound(false);

    fetch(`/api/v1/public/certificates/${certId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j && j.ok && j.data) {
          setBadge(j.data);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [certId]);

  function onTypedLookup(e: FormEvent) {
    e.preventDefault();
    if (!typedId.trim()) return;
    router.push(`/verify/${encodeURIComponent(typedId.trim())}`);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-lg py-12 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
        <p className="mt-3 text-sm text-zinc-500">Verifying cryptographic certificate…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm dark:border-rose-800/40 dark:bg-zinc-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700 font-bold text-xl dark:bg-rose-950 dark:text-rose-300">
            ✕
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-white">
            Certificate Not Found / Unverified
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            No active or archived certificate matches the query identifier{" "}
            <span className="font-mono font-bold text-zinc-900 dark:text-white">{certId}</span>.
          </p>

          <div className="mt-6 flex flex-col gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Link
              href="/verify/PRM-CERT-2026-00001"
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-center text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
            >
              Try Demo Certificate (PRM-CERT-2026-00001)
            </Link>
            <Link
              href="/verify/offline"
              className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              Verify Offline Sticker Payload
            </Link>
          </div>
        </div>

        {/* Typed Lookup Fallback */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Manual Certificate Number Lookup
          </h2>
          <form onSubmit={onTypedLookup} className="mt-3 flex gap-2">
            <input
              type="text"
              value={typedId}
              onChange={(e) => setTypedId(e.target.value)}
              placeholder="e.g. PRM-CERT-2026-00001"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
            >
              Verify
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!badge) return null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      {/* Hero Badge Verdict (min 15vh font size on mobile) */}
      <Badge verdict={badge.verdict} size="hero" />

      {/* Certificate Meta Details Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Certificate Identifier
            </span>
            <div className="font-mono text-lg font-bold text-zinc-900 dark:text-white">
              {badge.certId}
            </div>
          </div>
          {badge.signatureValid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              ✓ Ed25519 Signed
            </span>
          )}
        </div>

        {/* Anchors as Definition List (<dl>) */}
        <div className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
            Statutory Certificate Anchors
          </h2>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {badge.anchors.map((anchor) => (
              <div
                key={anchor.label}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {anchor.label}
                </dt>
                <dd className="font-medium text-zinc-900 dark:text-white text-right">
                  {anchor.label.toLowerCase().includes("until") || anchor.label.toLowerCase().includes("date")
                    ? new Date(anchor.value).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : anchor.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Verification History in <details> */}
        <details className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-800/40">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300 select-none">
            ▸ View Verification Audit &amp; Event History ({badge.history.length})
          </summary>
          <ul className="space-y-2 px-4 pb-3 pt-1 border-t border-zinc-200/60 dark:border-zinc-700/50">
            {badge.history.map((h, i) => (
              <li key={i} className="text-xs flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                <span className="font-mono text-[11px] text-zinc-400">
                  {new Date(h.at).toLocaleDateString()}
                </span>
                <span className="text-zinc-700 dark:text-zinc-300">• {h.what}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>

      {/* Manual Typed-ID Fallback Input Form */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Search Another Certificate by Number
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Scan QR or manually type the certificate identifier printed on the physical stamp sticker.
        </p>
        <form onSubmit={onTypedLookup} className="mt-3 flex gap-2">
          <input
            type="text"
            value={typedId}
            onChange={(e) => setTypedId(e.target.value)}
            placeholder="e.g. PRM-CERT-2026-00001"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
          >
            Check
          </button>
        </form>

        <div className="mt-3 text-right">
          <Link
            href="/verify/offline"
            className="text-[11px] text-zinc-500 underline hover:text-zinc-900 dark:hover:text-white"
          >
            Offline JWS sticker payload verifier →
          </Link>
        </div>
      </div>
    </div>
  );
}