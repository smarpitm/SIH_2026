"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DISTRICTS, type Role } from "@/packages/shared/constants";
import { api, ApiError } from "@/components/api-client";
import { useTranslation } from "@/lib/i18n";

export default function RegisterPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "TRADER" as Role,
    orgName: "",
    district: "Guntur",
  });

  const [loading, setLoading] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[] | null>(null);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // the register API validates with Zod and returns details as flatten():
  // { formErrors: string[], fieldErrors: Record<string, string[]> } — render them
  // as readable per-field lines instead of the generic envelope message.
  function readableErrors(details: unknown): string[] {
    if (!details || typeof details !== "object") return [];
    const d = details as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const label = (field: string) => field.charAt(0).toUpperCase() + field.slice(1);
    return [
      ...(d.formErrors ?? []),
      ...Object.entries(d.fieldErrors ?? {}).flatMap(([field, msgs]) =>
        msgs.map((m) => `${label(field)}: ${m}`)
      ),
    ];
  }

  // must mirror lib/auth/dto contract enforced by POST /api/v1/auth/register:
  // min 8 chars + at least one digit (checked here so the user never hits a 400 blind)
  const passwordValid = form.password.length >= 8 && /\d/.test(form.password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessages(null);

    if (!passwordValid) {
      setErrorMessages([t("reg.passwordError")]);
      return;
    }

    setLoading(true);
    try {
      // orgName is z.string().min(1).optional() on the server — an empty string
      // FAILS validation, so omit the key entirely unless it was actually filled
      // (the UI only collects it for LMO/GATC).
      const { orgName, ...withoutOrg } = form;
      await api("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify(orgName ? form : withoutOrg),
      });
      // Redirect to /login with registered query param and email
      router.push(`/login?registered=true&email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const msgs = readableErrors(err.details);
        setErrorMessages(msgs.length ? msgs : [err.message]);
      } else {
        setErrorMessages([t("reg.networkError")]);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="card p-6 sm:p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            {t("reg.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t("reg.subtitle")}
          </p>
        </div>

        {errorMessages && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-300"
          >
            <div className="font-semibold">{t("reg.errorHead")}</div>
            {errorMessages.length === 1 ? (
              <div>{errorMessages[0]}</div>
            ) : (
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {errorMessages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="field-label">
              {t("reg.name")}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder={t("reg.phName")}
              required
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label">
              {t("reg.email")}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="e.g. name@domain.in"
              required
              className="field-input"
            />
          </div>

          <div>
            <label className="field-label">
              {t("reg.password")}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              placeholder={t("reg.passwordHint")}
              required
              className="field-input"
            />
            {/* rule from POST /api/v1/auth/register (MA1): min 8 + at least one digit */}
            <p
              className={`mt-1 text-[11px] ${
                form.password && !passwordValid
                  ? "font-medium text-amber-600 dark:text-amber-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              {t("reg.passwordRule")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">
                {t("reg.role")}
              </label>
              <select
                value={form.role}
                onChange={(e) => updateField("role", e.target.value as Role)}
                className="field-input"
              >
                <option value="TRADER">{t("reg.roleTrader")}</option>
                <option value="LMO">{t("reg.roleLmo")}</option>
                <option value="GATC">{t("reg.roleGatc")}</option>
              </select>
            </div>

            <div>
              <label className="field-label">
                {t("reg.jurisdiction")}
              </label>
              <select
                value={form.district}
                onChange={(e) => updateField("district", e.target.value)}
                className="field-input"
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Org / Centre Name: Shown ONLY for non-TRADER (LMO / GATC) */}
          {form.role !== "TRADER" && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
              <label className="field-label">
                {t("reg.orgName")}
              </label>
              <input
                type="text"
                value={form.orgName}
                onChange={(e) => updateField("orgName", e.target.value)}
                placeholder={t("reg.phOrg")}
                required
                className="field-input"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                {t("reg.orgRequired")}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary mt-2 w-full"
          >
            {loading ? t("reg.creating") : t("reg.create")}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {t("reg.already")}{" "}
          <Link href="/login" className="font-semibold text-zinc-950 underline outline-none transition-colors hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-accent dark:text-white dark:hover:text-accent-300">
            {t("reg.signIn")}
          </Link>
        </div>
      </div>
    </div>
  );
}