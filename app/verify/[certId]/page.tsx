"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { verdictView } from "@/components/verdict";
import { useTranslation } from "@/lib/i18n";
import type { BadgeDTO } from "@/packages/shared/types";

// lib/public/badge.ts sends EXACTLY 5 anchors with these English labels — map each
// to its N1 i18n key so ?lang=hi flips the label; unknown labels render as-is.
const ANCHOR_KEYS: Record<string, string> = {
  "Instrument Serial": "verify.anchors.serial",
  Owner: "verify.anchors.owner",
  "Issued By": "verify.anchors.issuedBy",
  "Valid Until": "verify.anchors.validUntil",
  Category: "verify.anchors.category",
};

export default function VerifyPage() {
  const { certId } = useParams<{ certId: string }>();
  const router = useRouter();
  const { t } = useTranslation();

  const [badge, setBadge] = useState<BadgeDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [serverError, setServerError] = useState(false);
  // AUDIT FINDING #100/#22: a serial number can match certificates in multiple
  // districts — surface the disambiguation candidates instead of a raw 404.
  const [candidates, setCandidates] = useState<{ certId: string; district: string }[]>([]);
  const [typedId, setTypedId] = useState("");
  // review: a verification event should feel like a real event — mint one ID per
  // page load (client-side only; the public registry keeps no per-lookup log)
  const [vrfId] = useState(() => `VRF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);

  const load = useCallback(() => {
    setLoading(true);
    setNotFound(false);
    setServerError(false);
    setCandidates([]);

    // AUDIT FINDING #100: the typed form may carry an instrument SERIAL, which
    // the [certId] route cannot resolve. On NOT_FOUND fall back to the
    // rate-limited /lookup?q= endpoint (matches certId OR serial, with #22
    // multi-district disambiguation) instead of showing a false "not found".
    fetch(`/api/v1/public/certificates/${certId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j && j.ok && j.data) {
          setBadge(j.data);
          return;
        }
        if (j && !j.ok && j.error?.code === "NOT_FOUND") {
          return fetch(`/api/v1/public/certificates/lookup?q=${encodeURIComponent(certId)}`)
            .then((r) => r.json())
            .then((l) => {
              const d = l && l.ok ? l.data : null;
              if (d && typeof d === "object" && "verdict" in d) {
                setBadge(d as BadgeDTO);
              } else if (d && d.ambiguous && Array.isArray(d.candidates)) {
                setCandidates(d.candidates);
                setNotFound(true);
              } else {
                setNotFound(true);
              }
            });
        }
        // server/network fault — do NOT masquerade as "record not found"
        setServerError(true);
      })
      .catch(() => setServerError(true))
      .finally(() => setLoading(false));
  }, [certId]);

  useEffect(() => {
    load();
  }, [load]);

  function onTypedLookup(e: FormEvent) {
    e.preventDefault();
    if (!typedId.trim()) return;
    router.push(`/verify/${encodeURIComponent(typedId.trim())}`);
  }

  // shared typed-ID fallback card (not-found branch + badge view) — never printed
  const lookupCard = (
    <div className="no-print rounded-xl border border-zinc-200 bg-white p-5 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
      <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {t("verify.typedFallback", "Search Another Certificate by Number")}
      </h2>
      <p className="mt-0.5 text-xs text-zinc-400">
        {t("verify.typedHint")}
      </p>
      <form onSubmit={onTypedLookup} className="mt-3 flex gap-2">
        <input
          type="text"
          value={typedId}
          onChange={(e) => setTypedId(e.target.value)}
          placeholder="e.g. PRM-CERT-2026-00001"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs text-zinc-900 placeholder-zinc-400 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
        />
        <button
          type="submit"
          className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
        >
          {t("verify.typedButton", "Check")}
        </button>
      </form>
      <div className="mt-3 text-right">
        <Link
          href="/verify/offline"
          className="text-[11px] text-zinc-500 underline hover:text-zinc-900 dark:hover:text-white"
        >
          {t("verify.offlineLink")}
        </Link>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-lg py-12 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-white" />
        <p className="mt-3 text-sm text-zinc-500">{t("verify.verifying")}</p>
      </div>
    );
  }

  if (serverError) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="rounded-2xl border border-zinc-300 bg-zinc-50 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 font-bold text-zinc-700 text-xl dark:bg-zinc-800 dark:text-zinc-300">
            !
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-white">
            {t("verify.unavailableTitle")}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t("verify.unavailablePrefix")}{" "}
            <span className="font-mono font-bold text-zinc-900 dark:text-white">{certId}</span>.
            {t("verify.unavailableSuffix")}
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-5 rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
          >
            {t("common.retry")}
          </button>
        </div>
        {lookupCard}
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-6">
        {/* amber per the lookup contract — NOT_FOUND is "check the ID", never a raw 404 */}
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm dark:border-amber-800/50 dark:bg-amber-950/30">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold text-xl dark:bg-amber-950 dark:text-amber-300">
            !
          </div>
          <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-white">
            {t("verdict.notFound", "Certificate Not Found")}
          </h1>
          <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">
            {t(
              "verify.notFoundHint",
              "No record found — check the ID printed on the certificate"
            )}
            :{" "}
            <span className="font-mono font-bold text-zinc-900 dark:text-white">{certId}</span>
          </p>

          {/* AUDIT FINDING #100/#22: serial matched certificates in multiple
              districts — offer the candidates instead of a dead end */}
          {candidates.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-800/40 dark:bg-zinc-900">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                {t(
                  "verify.ambiguous",
                  "This number matches certificates in multiple districts — pick one:"
                )}
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {candidates.map((c) => (
                  <Link
                    key={c.certId}
                    href={`/verify/${encodeURIComponent(c.certId)}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-1.5 text-xs transition outline-none hover:border-accent-400 hover:bg-accent-50 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:hover:border-accent-400/40 dark:hover:bg-accent-400/10"
                  >
                    <span className="font-mono font-semibold text-zinc-900 dark:text-white">
                      {c.certId}
                    </span>
                    <span className="text-zinc-500 dark:text-zinc-400">{c.district}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <Link
              href="/verify/PRM-CERT-2026-00001"
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-center text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
            >
              {t("verify.tryDemo")}
            </Link>
            <Link
              href="/verify/offline"
              className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              {t("verify.offlineSticker")}
            </Link>
          </div>
        </div>

        {lookupCard}
      </div>
    );
  }

  if (!badge) return null;

  const view = verdictView(badge.verdict, badge.signatureValid);

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      {/* K15: print doubles as the certificate handout (nav/footer/.no-print hidden via globals.css) */}
      <div className="no-print text-right">
        <button
          type="button"
          onClick={() => window.print()}
          className="text-xs font-semibold text-zinc-500 underline hover:text-zinc-900 dark:hover:text-white"
        >
          {t("verify.printHandout")}
        </button>
      </div>

      {/* G6 hero: colour verdict within 1.5s; icon + word accompany every colour */}
      <Badge
        verdict={badge.signatureValid ? badge.verdict : "CHECK_FAILED"}
        word={t(view.wordKey)}
        subtitle={t(view.subKey ?? "verify.officialCert")}
        size="hero"
      />

      {/* review: verification event metadata — turns a lookup into a verifiable moment */}
      {badge.signatureValid && (
        <p className="no-print -mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="text-emerald-600 dark:text-emerald-400">✓</span>
            {t("verify.verifiedNow", "Verified just now")}{" "}
            <span className="tabular-nums">
              {new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </span>
          <span className="font-mono">
            {t("verify.vrfId", "Verification ID")}: {vrfId}
          </span>
        </p>
      )}

      {!badge.signatureValid && (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300">
          → {t("verify.reportAction", "Report to your Local Legal Metrology office")}
        </p>
      )}

      {/* Verification Summary — the four questions any third party asks, each
          answered explicitly (icon + word, never colour alone). */}
      <section className="card p-5" aria-label={t("verify.summaryTitle", "Verification Summary")}>
        <h2 className="section-title mb-3">
          {t("verify.summaryTitle", "Verification Summary")}
        </h2>
        <ul className="space-y-2.5 text-sm">
          {[
            {
              ok: badge.signatureValid,
              label: t("verify.sum.authentic", "Certificate Authentic"),
              desc: t("verify.sum.authenticDesc", "Ed25519 signature verified against the public register"),
            },
            {
              ok: badge.signatureValid,
              label: t("verify.sum.issuedBy", "Issued by Authorized Officer"),
              desc: t(
                "verify.sum.issuedByDesc",
                badge.anchors.find((a) => a.label === "Issued By")?.value ?? "—"
              ),
            },
            {
              ok: badge.signatureValid,
              label: t("verify.sum.registered", "Instrument Registered"),
              desc: t(
                "verify.sum.registeredDesc",
                badge.anchors.find((a) => a.label === "Instrument Serial")?.value ?? "—"
              ),
            },
            {
              ok: badge.verdict === "VALID" && badge.signatureValid,
              label: t("verify.sum.valid", "Currently Valid"),
              desc:
                badge.verdict === "VALID"
                  ? t(
                      "verify.sum.validDesc",
                      badge.anchors.find((a) => a.label === "Valid Until")?.value ?? ""
                    )
                  : t("verify.sum.notValid", "Certificate is not in a valid state"),
            },
          ].map((item) => (
            <li key={item.label} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  item.ok
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                }`}
              >
                {item.ok ? "✓" : "✕"}
              </span>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                  {item.label}
                </span>
                <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {item.desc}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Certificate Meta Details Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              {t("verify.certIdentifier")}
            </span>
            <div className="font-mono text-lg font-bold text-zinc-950 dark:text-white">
              {badge.certId}
            </div>
          </div>
          {badge.signatureValid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              {t("verify.signedBadge")}
            </span>
          )}
        </div>

        {/* Anchors as Definition List (<dl>) */}
        <div className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
            {t("verify.anchorsTitle")}
          </h2>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {/* server guarantees exactly 5 anchors; slice defensively anyway */}
            {badge.anchors.slice(0, 5).map((anchor) => (
              <div
                key={anchor.label}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t(ANCHOR_KEYS[anchor.label] ?? "", anchor.label)}
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
          <summary className="cursor-pointer select-none px-4 py-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            ▸ {t("verify.history", "View Verification Audit & Event History")} (
            {badge.history.length})
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

      {lookupCard}
    </div>
  );
}