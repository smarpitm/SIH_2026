"use client";

import { useState, type FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const from = searchParams.get("from");

  const [email, setEmail] = useState("ravi@demo.in");
  const [password, setPassword] = useState("Passw0rd!demo");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setAuth = useAuthStore((state) => state.setAuth);

  // Demo accounts helper
  const demoAccounts = [
    { label: "Trader (Ravi)", email: "ravi@demo.in", role: "TRADER" },
    { label: "Officer (LMO)", email: "lmo.guntur@demo.in", role: "LMO" },
    { label: "GATC Centre", email: "gatc@demo.in", role: "GATC" },
    { label: "Admin", email: "admin@demo.in", role: "ADMIN" },
  ];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (json && json.ok && json.data) {
        const { user, accessToken } = json.data;

        // 1. Store in Zustand store
        setAuth(user, accessToken);

        // 2. Set pm_session cookie for client & middleware access
        const cookieVal = encodeURIComponent(accessToken || "demo_token");
        document.cookie = `pm_session=${cookieVal}; path=/; max-age=604800; SameSite=Lax`;

        // 3. Role-based redirect
        if (from && from.startsWith("/")) {
          router.push(from);
        } else {
          switch (user.role) {
            case "TRADER":
              router.push("/trader");
              break;
            case "LMO":
            case "GATC":
              router.push("/officer");
              break;
            case "ADMIN":
              router.push("/admin");
              break;
            default:
              router.push("/trader");
          }
        }
      } else {
        setErrorMessage(json?.error?.message ?? "Authentication failed. Please check your credentials.");
      }
    } catch {
      setErrorMessage("Network error. Could not connect to authentication service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Sign in to PRAMANAM
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Legal Metrology Verification Portal
          </p>
        </div>

        {/* Registered success banner */}
        {registered && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800/40 dark:bg-green-950/40 dark:text-green-300">
            ✓ Registration successful! You can now sign in with your credentials.
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
          >
            <div className="font-semibold">Sign in failed</div>
            <div>{errorMessage}</div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              required
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Password
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white dark:focus:ring-white"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Demo Quick Presets */}
        <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Quick demo presets:
          </span>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {demoAccounts.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => {
                  setEmail(acc.email);
                  setPassword("Passw0rd!demo");
                }}
                className="truncate rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-semibold text-zinc-900 underline dark:text-white">
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-sm text-zinc-500">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}