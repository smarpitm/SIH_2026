"use client";

import { useState, type FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/components/api-client";
import type { UserDTO } from "@/packages/shared/types";

function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const emailParam = searchParams.get("email");
  const from = searchParams.get("from");

  const [email, setEmail] = useState(emailParam || (registered ? "" : "ravi@demo.in"));
  const [password, setPassword] = useState(registered ? "" : "Passw0rd!demo");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setAuth = useAuthStore((state) => state.setAuth);

  // Demo accounts helper
  const demoAccounts = [
    { k: "auth.demoTrader", label: "Trader (Ravi)", email: "ravi@demo.in", role: "TRADER" },
    { k: "auth.demoOfficer", label: "Officer (LMO)", email: "lmo.guntur@demo.in", role: "LMO" },
    { k: "auth.demoGatc", label: "GATC Centre", email: "gatc@demo.in", role: "GATC" },
    { k: "auth.demoAdmin", label: "Admin", email: "admin@demo.in", role: "ADMIN" },
  ];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      // Real login: API sets the httpOnly pm_refresh cookie itself; we keep the
      // accessToken in zustand (memory) and the user in localStorage via setAuth.
      const data = await api<{ accessToken: string; user: UserDTO }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      setAuth(data.user, data.accessToken);

      // Role-based redirect
      if (from && from.startsWith("/")) {
        router.push(from);
      } else {
        switch (data.user.role) {
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
    } catch (e) {
      setErrorMessage(
        e instanceof ApiError ? e.message : t("auth.networkError")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            {t("auth.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("auth.subtitle")}
          </p>
        </div>

        {/* Registered success banner */}
        {registered && (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800/40 dark:bg-green-950/40 dark:text-green-300">
            {t("auth.registeredBanner")}
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
          >
            <div className="font-semibold">{t("auth.failedHead")}</div>
            <div>{errorMessage}</div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              {t("auth.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              required
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t("auth.password")}
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm transition outline-none focus:border-accent-600 focus:ring-2 focus:ring-accent/30 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-accent-400 dark:focus:ring-accent/40"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center rounded-full bg-zinc-950 py-2.5 text-sm font-semibold text-white shadow-md shadow-zinc-950/20 transition outline-none hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:shadow-black/20 dark:hover:bg-zinc-200"
          >
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>

        {/* Demo Quick Presets */}
        <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            {t("auth.demoPresets")}
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
                className="truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-left text-xs font-medium text-zinc-700 transition outline-none hover:border-accent-300 hover:bg-accent-50 hover:text-accent-800 focus-visible:ring-2 focus-visible:ring-accent dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-accent-400/40 dark:hover:bg-accent-400/10 dark:hover:text-accent-300"
              >
                {t(acc.k, acc.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="font-semibold text-zinc-950 underline outline-none transition-colors hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-accent dark:text-white dark:hover:text-accent-300">
            {t("auth.registerHere")}
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