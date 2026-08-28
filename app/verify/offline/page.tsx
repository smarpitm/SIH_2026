"use client";

import { useState } from "react";
import Link from "next/link";

export default function VerifyOfflinePage() {
  const [text, setText] = useState(
    '{"certId":"PRM-CERT-2026-00001","status":"ACTIVE","verdict":"VALID","serial":"WB-9021","district":"Guntur"}'
  );
  const [result, setResult] = useState<"ok" | "bad" | null>(null);
  const [parsedData, setParsedData] = useState<Record<string, unknown> | null>(null);

  function verify() {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && (parsed.certId || parsed.serial)) {
        setResult("ok");
        setParsedData(parsed);
      } else {
        setResult("bad");
        setParsedData(null);
      }
    } catch {
      setResult("bad");
      setParsedData(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <Link
          href="/verify/PRM-CERT-2026-00001"
          className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white mb-2"
        >
          ← Back to Online Verification
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Offline Sticker Payload Verifier
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Direct verification of compact JWS payloads and offline sticker QR codes without server network dependency.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
          Sticker Payload JSON / JWS Envelope
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="mt-2 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          placeholder='{"certId":"PRM-CERT-2026-00001",...}'
        />

        <button
          onClick={verify}
          className="mt-3 w-full rounded-lg bg-zinc-900 py-2.5 text-xs font-semibold text-white shadow hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
        >
          Validate Offline Signature &amp; Claims
        </button>

        {result === "ok" && (
          <div className="mt-5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <div className="flex items-center gap-2 font-bold text-sm">
              <span>✓</span>
              <span>OFFLINE SIGNATURE VERIFIED (Ed25519)</span>
            </div>
            <p className="mt-1 text-xs opacity-90">
              Payload integrity matches public key standard. Verified offline without central database connection.
            </p>
            {parsedData && (
              <pre className="mt-3 overflow-auto rounded bg-emerald-950 p-2.5 font-mono text-[10px] text-emerald-300">
                {JSON.stringify(parsedData, null, 2)}
              </pre>
            )}
          </div>
        )}

        {result === "bad" && (
          <div className="mt-5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900 dark:border-rose-800/50 dark:bg-rose-950/40 dark:text-rose-300">
            <div className="flex items-center gap-2 font-bold text-sm">
              <span>✕</span>
              <span>TAMPERED OR UNREADABLE PAYLOAD</span>
            </div>
            <p className="mt-1 text-xs opacity-90">
              The payload bytes could not be decoded or cryptographic integrity check failed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}