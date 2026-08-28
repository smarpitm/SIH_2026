"use client";

import { useState, type FormEvent } from "react";
import { ROLES, DISTRICTS } from "@/packages/shared/constants";

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "TRADER",
    orgName: "",
    district: "Guntur",
  });
  const [out, setOut] = useState("");

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setOut(JSON.stringify(await r.json(), null, 2));
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold">Register</h1>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Name" className="rounded border px-3 py-2" required />
        <input value={form.email} onChange={(e) => set("email", e.target.value)} type="email" placeholder="Email" className="rounded border px-3 py-2" required />
        <input value={form.password} onChange={(e) => set("password", e.target.value)} type="password" placeholder="Password" className="rounded border px-3 py-2" required />
        <select value={form.role} onChange={(e) => set("role", e.target.value)} className="rounded border px-3 py-2">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input value={form.orgName} onChange={(e) => set("orgName", e.target.value)} placeholder="Org / Centre name" className="rounded border px-3 py-2" />
        <select value={form.district} onChange={(e) => set("district", e.target.value)} className="rounded border px-3 py-2">
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button className="rounded bg-foreground px-3 py-2 font-medium text-background">Create account</button>
      </form>
      <pre className="mt-4 overflow-auto rounded border bg-gray-50 p-3 text-xs">{out}</pre>
    </div>
  );
}