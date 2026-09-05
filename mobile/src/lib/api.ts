import { useAuthStore } from "./auth";
import type { ApiResponse } from "./types";

/**
 * Backend base URL. Override per build with:
 *   EXPO_PUBLIC_API_URL=https://your-backend.example.com eas build ...
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "") || "https://pramanam.onrender.com";

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

function headers(init: RequestInit | undefined, token: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// single-flight refresh — mirrors the web client (components/api-client.ts):
// parallel 401s share ONE POST /auth/refresh (cookie rotation is destructive).
let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= fetch(`${API_URL}/api/v1/auth/refresh`, { method: "POST" })
    .then(async (res) => {
      const body = (await res.json().catch(() => null)) as ApiResponse<{
        accessToken: string;
        user: never;
      }> | null;
      if (!res.ok || !body?.ok) return null;
      // refresh also hands back the user; persist both
      await useAuthStore.getState().setToken(body.data.accessToken);
      return body.data.accessToken;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function sessionExpired(): Promise<never> {
  await useAuthStore.getState().signOut();
  throw new ApiError("AUTH_REQUIRED", "Session expired — please log in again", 401);
}

/**
 * Authenticated fetch: attaches Bearer, on 401 refreshes ONCE (single-flight)
 * then retries; on a second 401 clears the store. The refresh cookie rides on
 * React Native's native cookie jar, exactly like the browser cookie on web.
 */
export async function authorizedRequest(
  path: string,
  init?: RequestInit,
  opts: { isAuthPath?: boolean } = {}
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const token = useAuthStore.getState().token;

  let res = await fetch(url, {
    ...init,
    headers: headers(init, token),
    credentials: "same-origin",
  });

  const isAuthPath = opts.isAuthPath ?? path.includes("/auth/");
  if (res.status === 401 && !isAuthPath) {
    const fresh = await refreshAccessToken();
    if (!fresh) await sessionExpired();
    res = await fetch(url, { ...init, headers: headers(init, fresh), credentials: "same-origin" });
    if (res.status === 401) await sessionExpired();
  }
  return res;
}

/** Fetch wrapper for the ApiResponse envelope. Throws ApiError when ok:false. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authorizedRequest(path, init);
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) throw new ApiError("INTERNAL", "Malformed response from server", res.status);
  if (!body.ok) throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  return body.data;
}

/** Public (no-auth) JSON fetch against the envelope. */
export async function publicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const res = await fetch(url, { ...init, headers: headers(init, null) });
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) throw new ApiError("INTERNAL", "Malformed response from server", res.status);
  if (!body.ok) throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  return body.data;
}
