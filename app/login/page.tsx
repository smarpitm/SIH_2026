"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("ravi@demo.in");
  const [password, setPassword] = useState("");
  const [out, setOut] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setOut("...");
    const r = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setOut(JSON.stringify(await r.json(), null, 2));
  }

  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-bold">Login</h1>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="rounded border px-3 py-2" required />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="rounded border px-3 py-2" required />
        <button className="rounded bg-foreground px-3 py-2 font-medium text-background">Sign in</button>
      </form>
      <p className="mt-3 text-sm">
        New here?{" "}
        <Link href="/register" className="text-blue-600 underline">
          Create an account
        </Link>
      </p>
      <pre className="mt-4 overflow-auto rounded border bg-gray-50 p-3 text-xs">{out}</pre>
    </div>
  );
}