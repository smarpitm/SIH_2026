"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { useTranslation } from "@/lib/i18n";
import { api, ApiError } from "@/components/api-client";

// AUDIT FINDING #110: invited officers log in with a one-time temporary
// credential (User.mustChangePassword=true, POST /auth/login returns
// mustChangePassword) but had no UI to rotate it — /login now routes here when
// the flag is set. Mirrors the server schema on
// POST /api/v1/auth/change-password: min 8, max 72, at least one digit.

function ChangePasswordForm() {
  const { t } = useTranslation();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const accessToken = useAuthStore((s) => s.accessToken);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const logout = useAuthStore((s) => s.logout);

  // The accessToken lives in memory only, so a hard reload on this page starts
  // with it null. Recover it via the still-live pm_refresh cookie (same
  // semantics as refreshAccessToken in components/api-client.ts); if the
  // cookie is dead too, there is no authenticated session → back to /login.
  useEffect(() => {
    if (accessToken) return;
    fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          ok: boolean;
          data?: { accessToken: string };
        } | null;
        const token = res.ok && body?.ok ? body.data!.accessToken : null;
        if (token) setAccessToken(token);
        else router.replace("/login?from=/change-password");
      })
      .catch(() => router.replace("/login?from=/change-password"));
  }, [accessToken, setAccessToken, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldError(null);
    setErrorMessage(null);

    if (newPassword !== confirmPassword) {
      setFieldError(t("cp.mismatch", "Passwords do not match."));
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 72 || !/\d/.test(newPassword)) {
      setFieldError(t("cp.policyHint", "At least 8 characters, including a digit."));
      return;
    }

    setLoading(true);
    try {
      await api("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      // AUDIT FINDING #72: the API revoked EVERY live refresh family of this
      // user — this device's pm_refresh cookie is dead too. Sign out cleanly
      // (clear the cookie via the idempotent /logout) and re-login with the
      // new password.
      logout();
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(
        () => {}
      );
      router.push("/login?passwordChanged=1");
    } catch (e) {
      setErrorMessage(e instanceof ApiError ? e.message : t("auth.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-md shadow-zinc-950/5 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="mb-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950 text-base text-white dark:bg-white dark:text-zinc-950"
          >
            🔑
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            {t("cp.title", "Set a New Password")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t(
              "cp.subtitle",
              "Your account uses a one-time temporary credential. Choose a new password to secure it."
            )}
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
          >
            <div className="font-semibold">{t("cp.failedHead", "Password update failed")}</div>
            <div>{errorMessage}</div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="cp-current" className="field-label">
              {t("cp.current", "Current Password")}
            </label>
            <input
              id="cp-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="field-input"
            />
          </div>

          <div>
            <label htmlFor="cp-new" className="field-label">
              {t("cp.new", "New Password")}
            </label>
            <input
              id="cp-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="field-input"
            />
            <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
              {t("cp.policyHint", "At least 8 characters, including a digit.")}
            </p>
          </div>

          <div>
            <label htmlFor="cp-confirm" className="field-label">
              {t("cp.confirm", "Confirm New Password")}
            </label>
            <input
              id="cp-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="field-input"
            />
            {fieldError && (
              <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                {fieldError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !accessToken}
            className="btn btn-primary w-full"
          >
            {loading ? t("cp.updating", "Updating…") : t("cp.update", "Update Password")}
          </button>

          <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            🔒{" "}
            {t(
              "cp.sessionNote",
              "For your security, all signed-in sessions are ended after the password change."
            )}
          </p>
        </form>
      </div>
    </div>
  );
}

export default function ChangePasswordPage() {
  return <ChangePasswordForm />;
}
