"use client";

import type { ApiResponse } from "@/packages/shared/types";
import { useAuthStore } from "@/lib/store";

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function headers(init: RequestInit | undefined, token: string | null): HeadersInit {
  return {
    // JSON by default; skip for FormData (multipart uploads) so the browser sets the boundary
    ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...init?.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// single-flight: parallel 401s share ONE POST /auth/refresh (cookie rotation is
// destructive — concurrent refreshes would trigger reuse-detection family revoke)
let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then(async (res) => {
      const body = (await res.json().catch(() => null)) as ApiResponse<{ accessToken: string }> | null;
      return res.ok && body?.ok ? body.data.accessToken : null;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function sessionExpired(): never {
  useAuthStore.getState().logout();
  window.location.href = "/login";
  throw new ApiError("AUTH_REQUIRED", "Session expired — please log in again", 401);
}

/**
 * Fetch wrapper for the ApiResponse envelope. Attaches `Authorization: Bearer`,
 * on 401 refreshes ONCE and retries, on second 401 clears the store and
 * redirects to /login. Throws ApiError when the envelope is ok:false.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().accessToken;

  let res = await fetch(path, { ...init, headers: headers(init, token) });

  // auth endpoints manage their own credentials — a 401 there is a form error,
  // not an expired session, so never refresh-and-redirect from them.
  const isAuthPath = path.startsWith("/api/v1/auth/");
  if (res.status === 401 && !isAuthPath) {
    const fresh = await refreshAccessToken();
    if (!fresh) sessionExpired();
    res = await fetch(path, { ...init, headers: headers(init, fresh) });
    if (res.status === 401) sessionExpired();
  }

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) throw new ApiError("INTERNAL", "Malformed response from server", res.status);
  if (!body.ok) {
    throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  }
  return body.data;
}

/**
 * Extract per-field messages from a VALIDATION_ERROR envelope's details
 * (Zod flatten(): { formErrors, fieldErrors }). Returns null when there are
 * no field errors (caller should fall back to the generic message).
 */
export function zodFieldErrors(details: unknown): Record<string, string[]> | null {
  if (!details || typeof details !== "object") return null;
  const fe = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  return fe && Object.keys(fe).length > 0 ? fe : null;
}