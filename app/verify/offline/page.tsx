"use client";

import { useState } from "react";

export default function VerifyOfflinePage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<"ok" | "bad" | null>(null);

  function verify() {
    try {
      const parsed = JSON.parse(text);
      setResult(parsed && typeof parsed === "object" ? "ok" : "bad");
    } catch {
      setResult("bad");
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Offline verify</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Paste the JSON payload printed on the certificate sticker.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="mt-4 w-full rounded border px-3 py-2 font-mono text-xs"
        placeholder='{"certId":"PRM-CERT-2026-00001",...}'
      />
      <button onClick={verify} className="mt-3 rounded bg-foreground px-3 py-2 font-medium text-background">
        Verify offline
      </button>
      {result === "ok" && (
        <div className="mt-4 rounded border border-green-300 bg-green-50 p-4 text-green-800">
          SIGNATURE VERIFIED (stub)
        </div>
      )}
      {result === "bad" && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-4 text-red-800">
          TAMPERED / UNREADABLE
        </div>
      )}
    </div>
  );
}