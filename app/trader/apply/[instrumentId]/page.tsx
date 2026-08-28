"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

type Step = 1 | 2 | 3;

export default function ApplyPage() {
  const { instrumentId } = useParams<{ instrumentId: string }>();
  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<"NEW" | "RE_VERIFICATION">("NEW");
  const [declared, setDeclared] = useState(false);
  const [out, setOut] = useState("");

  async function createAndPay() {
    // 1) create application, 2) mock-pay, 3) submit
    const create = await fetch("/api/v1/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instrumentId: instrumentId as string, type }),
    });
    const created = await create.json();
    const applicationId = created.data?.[0]?.id ?? "app_stub";

    const pay = await fetch(`/api/v1/applications/${applicationId}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const payRes = await pay.json();

    const submit = await fetch(`/api/v1/applications/${applicationId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const submitRes = await submit.json();

    setOut(JSON.stringify({ created, pay: payRes, submit: submitRes }, null, 2));
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Apply</h1>
      <p className="mt-1 text-sm text-muted-foreground">Instrument {instrumentId}</p>

      <div className="mt-4 flex gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <span key={s} className={`rounded-full px-3 py-1 ${step === s ? "bg-foreground text-background" : "bg-gray-100"}`}>
            {s}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="mt-4 flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input type="radio" checked={type === "NEW"} onChange={() => setType("NEW")} /> New
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={type === "RE_VERIFICATION"} onChange={() => setType("RE_VERIFICATION")} /> Re-verification
          </label>
          <button className="mt-3 rounded bg-foreground px-3 py-2 text-background" onClick={() => setStep(2)}>Next</button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
            I declare the instrument details are accurate and consent to inspection.
          </label>
          <button
            disabled={!declared}
            onClick={() => setStep(3)}
            className="rounded bg-foreground px-3 py-2 text-background disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Demo fee: ₹100</p>
          <button
            onClick={createAndPay}
            className="rounded bg-foreground px-3 py-2 font-medium text-background"
          >
            Pay & submit
          </button>
        </div>
      )}

      <pre className="mt-4 overflow-auto rounded border bg-gray-50 p-3 text-xs">{out}</pre>
    </div>
  );
}