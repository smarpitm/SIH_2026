"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store";
import { api } from "@/components/api-client";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang } = useTranslation();
  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // restore persisted user after hydration (accessToken intentionally not
  // persisted — api-client recovers it via /auth/refresh on first 401)
  useEffect(() => {
    useAuthStore.getState().rehydrate();
  }, []);

  async function handleLogout() {
    try {
      // API clears the httpOnly pm_refresh cookie
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // clear locally regardless — never trap the user in a session
    }
    logout();
    router.push("/login");
  }

  const navLinks = [
    { href: "/verify/PRM-CERT-2026-00001", label: "Verify" },
    { href: "/trader", label: "Trader" },
    { href: "/officer", label: "Officer" },
    { href: "/admin", label: "Admin" },
    { href: "/docs", label: "Docs" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Wordmark Logo */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-900 font-bold text-white shadow-sm dark:bg-white dark:text-zinc-900">
              प्र
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-wider text-zinc-900 dark:text-white">
                PRAMANAM
              </span>
              <span className="hidden text-[10px] font-medium tracking-tight text-zinc-500 sm:inline-block">
                Legal Metrology Verification
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Language switcher & Auth CTAs */}
        <div className="flex items-center gap-2">
          {/* Language Toggle Placeholder */}
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="Toggle Language (English / हिन्दी)"
            aria-label="Language Toggle"
          >
            <span className="text-zinc-400 font-normal">🌐</span>
            <span>{lang === "en" ? "EN" : "HI"}</span>
          </button>

          {/* User status or Login/Register */}
          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="max-w-[160px] truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {user.name}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {user.role}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-1 sm:flex">
              <Link
                href="/login"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              >
                Register
              </Link>
            </div>
          )}

          {/* Mobile hamburger button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 md:hidden dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="Toggle navigation menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-zinc-200 bg-white px-4 pb-4 pt-2 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
              {user ? (
                <div className="flex items-center justify-between py-1">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {user.name}{" "}
                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {user.role}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="text-xs text-red-600 font-medium"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center rounded-md border border-zinc-200 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center rounded-md bg-zinc-900 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-zinc-900"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
