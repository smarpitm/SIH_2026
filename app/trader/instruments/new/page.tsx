"use client";

import { useState, type FormEvent } from "react";
import { INSTRUMENT_CATEGORIES, DISTRICTS } from "@/packages/shared/constants";

export default function NewInstrumentPage() {
  const [form, setForm] = useState({
    category: "WEIGHBRIDGE",
    make: "",
    model: "",
    serialNumber: "",
    capacity: "",
    district: "Guntur",
    address: "",
  });
  const [out, setOut] = useState("");

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/v1/instruments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setOut(JSON.stringify(await r.json(), null, 2));
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Register instrument</h1>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <select value={form.category} onChange={(e) => set("category", e.target.value)} className="rounded border px-3 py-2">
          {INSTRUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Make" className="rounded border px-3 py-2" required />
        <input value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Model" className="rounded border px-3 py-2" required />
        <input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} placeholder="Serial number" className="rounded border px-3 py-2" required />
        <input value={form.capacity} onChange={(e) => set("capacity", e.target.value)} placeholder="Capacity" className="rounded border px-3 py-2" required />
        <select value={form.district} onChange={(e) => set("district", e.target.value)} className="rounded border px-3 py-2">
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Address" className="rounded border px-3 py-2" required />
        <button className="rounded bg-foreground px-3 py-2 font-medium text-background">Save</button>
      </form>
      <pre className="mt-4 overflow-auto rounded border bg-gray-50 p-3 text-xs">{out}</pre>
    </div>
  );
}