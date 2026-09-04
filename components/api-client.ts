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
 * Shared authenticated fetch (audit finding #55): attaches `Authorization:
 * Bearer`, and on 401 refreshes ONCE (single-flight) then retries; on a second
 * 401 it clears the store and redirects to /login. Used by both `api()` for
 * JSON envelopes and ExportButtons for blob downloads, so token-refresh
 * behavior can never drift between the two call paths.
 * Auth endpoints manage their own credentials — a 401 there is a form error,
 * not an expired session, so they never refresh-and-redirect.
 */
export async function authorizedRequest(
  path: string,
  init?: RequestInit,
  opts: { isAuthPath?: boolean } = {}
): Promise<Response> {
  const token = useAuthStore.getState().accessToken;

  let res = await fetch(path, { ...init, headers: headers(init, token) });

  const isAuthPath = opts.isAuthPath ?? path.startsWith("/api/v1/auth/");
  if (res.status === 401 && !isAuthPath) {
    const fresh = await refreshAccessToken();
    if (!fresh) sessionExpired();
    res = await fetch(path, { ...init, headers: headers(init, fresh) });
    if (res.status === 401) sessionExpired();
  }
  return res;
}

/**
 * Fetch wrapper for the ApiResponse envelope. See authorizedRequest for the
 * 401-refresh semantics. Throws ApiError when the envelope is ok:false.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authorizedRequest(path, init);

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