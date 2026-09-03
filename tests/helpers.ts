// Shared helpers for the HTTP-level vitest suites.
// Plain fetch against a running dev server — no SDKs, no route-handler imports.
// NOTE: deliberately NOT named BASE_URL — Vite injects process.env.BASE_URL="/".
export const BASE_URL = process.env.PRAMANAM_TEST_URL || "http://localhost:3000";

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export async function call<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: Envelope<T> }> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const body = (await res.json().catch(() => ({}))) as Envelope<T>;
  return { status: res.status, body };
}

export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export function jsonInit(token: string, method: string, payload: unknown): RequestInit {
  return {
    method,
    headers: { ...auth(token), "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function login(email: string, password = "Passw0rd!demo"): Promise<string> {
  const { body } = await call<{ accessToken: string }>("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!body.ok || !body.data) throw new Error(`login failed for ${email}: ${JSON.stringify(body)}`);
  return body.data.accessToken;
}

/** Deterministic polling: retry fn() until it yields a non-null value or the
 *  timeout elapses. No fixed sleeps — only bounded polling. */
export async function until<T>(
  fn: () => Promise<T | null | undefined>,
  { timeoutMs = 10000, stepMs = 250, label = "condition" } = {}
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value !== null && value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

/** Fail fast with an actionable message when the dev server is not running. */
export async function expectServerUp(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/v1/public/stats`);
  } catch {
    throw new Error(
      `dev server not reachable at ${BASE_URL} — run "npm run dev" (and db:push/db:seed) before npm test`
    );
  }
}