"use client";

import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { OBSERVATION_CONFIG } from "@/packages/shared/constants";
import { PhotoInput } from "@/components/PhotoInput";

export default function OfficerJobPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const fields = OBSERVATION_CONFIG.default;
  const [values, setValues] = useState<Record<string, string | boolean>>(Object.fromEntries(fields.map((f) => [f.key, f.type === "boolean" ? false : ""])));
  const [gps, setGps] = useState<string>("");
  const [result, setResult] = useState<"PASS" | "FAIL" | null>(null);
  const [out, setOut] = useState("");

  function captureGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setGps(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
    }, () => setGps("unavailable"));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!result) return;
    const r = await fetch("/api/v1/inspections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicationId: applicationId as string, result, gps, values }),
    });
    setOut(JSON.stringify(await r.json(), null, 2));
  }

  // Mobile-first single-column layout.
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Inspection</h1>
      <p className="mt-1 text-sm text-muted-foreground">Application {applicationId}</p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium">{f.label}</label>
            {f.type === "boolean" ? (
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={Boolean(values[f.key])}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
              />
            ) : (
              <textarea
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                rows={3}
                value={String(values[f.key])}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            )}
          </div>
        ))}

        <div>
          <button type="button" onClick={captureGps} className="rounded border px-3 py-2 text-sm">
            Capture location
          </button>
          {gps && <span className="ml-2 text-sm text-muted-foreground">{gps}</span>}
        </div>

        <PhotoInput name="inspector-photo" />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setResult("PASS")}
            className={`flex-1 rounded px-3 py-2 font-medium ${result === "PASS" ? "bg-green-600 text-white" : "bg-gray-100"}`}
          >
            PASS
          </button>
          <button
            type="button"
            onClick={() => setResult("FAIL")}
            className={`flex-1 rounded px-3 py-2 font-medium ${result === "FAIL" ? "bg-red-600 text-white" : "bg-gray-100"}`}
          >
            FAIL
          </button>
        </div>

        <button className="rounded bg-foreground px-3 py-2 font-medium text-background">Submit report</button>
      </form>

      <pre className="mt-4 overflow-auto rounded border bg-gray-50 p-3 text-xs">{out}</pre>
    </div>
  );
}