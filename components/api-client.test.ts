// Self-check for components/api-client.ts: Bearer attach, envelope parsing,
// 401 -> refresh ONCE -> retry, second 401 -> clear store + /login, single-flight refresh.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.stubGlobal("window", { location: { href: "" } });
vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
});
vi.stubGlobal("document", { cookie: "" });

import { api, ApiError } from "./api-client";
import { useAuthStore } from "@/lib/store";

type Step = { status: number; body: unknown };

function scriptedFetch(steps: Step[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => {
    const step = steps.shift();
    if (!step) throw new Error("unexpected extra fetch call");
    return Promise.resolve(
      new Response(JSON.stringify(step.body), {
        status: step.status,
        headers: { "Content-Type": "application/json" },
      })
    );
  });
}

const okEnvelope = (data: unknown) => ({ ok: true, data });
const errEnvelope = (message = "expired") => ({ ok: false, error: { code: "AUTH_REQUIRED", message } });

const browserStub = () => ({
  location: { href: "" },
  localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
});

beforeEach(() => {
  useAuthStore.setState({ user: null, accessToken: "tok1" });
  vi.stubGlobal("window", browserStub());
  vi.stubGlobal("document", { cookie: "" });
});

describe("api-client", () => {
  it("attaches Bearer token and unwraps the envelope", async () => {
    const f = scriptedFetch([{ status: 200, body: okEnvelope({ hello: 1 }) }]);
    vi.stubGlobal("fetch", f);
    await expect(api("/api/v1/x")).resolves.toEqual({ hello: 1 });
    expect(f.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer tok1" });
  });

  it("on 401: refreshes ONCE then retries with the new token", async () => {
    const f = scriptedFetch([
      { status: 401, body: errEnvelope() },
      { status: 200, body: okEnvelope({ accessToken: "tok2" }) }, // /auth/refresh
      { status: 200, body: okEnvelope({ done: true }) }, // retry
    ]);
    vi.stubGlobal("fetch", f);
    await expect(api("/api/v1/instruments")).resolves.toEqual({ done: true });
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls[1][0]).toBe("/api/v1/auth/refresh");
    expect(f.mock.calls[2][1]?.headers).toMatchObject({ Authorization: "Bearer tok2" });
  });

  it("on second 401: clears the store, redirects to /login, throws ApiError", async () => {
    const f = scriptedFetch([
      { status: 401, body: errEnvelope() },
      { status: 200, body: okEnvelope({ accessToken: "tok2" }) },
      { status: 401, body: errEnvelope() },
    ]);
    vi.stubGlobal("fetch", f);
    await expect(api("/api/v1/instruments")).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect((window as { location: { href: string } }).location.href).toBe("/login");
  });

  it("throws ApiError carrying envelope code/message on ok:false", async () => {
    vi.stubGlobal(
      "fetch",
      scriptedFetch([
        { status: 409, body: { ok: false, error: { code: "CONFLICT", message: "Email already registered" } } },
      ])
    );
    const err = await api("/api/v1/auth/register").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("CONFLICT");
    expect((err as ApiError).message).toBe("Email already registered");
  });

  it("single-flight: concurrent 401s share ONE refresh call", async () => {
    const f = scriptedFetch([
      { status: 401, body: errEnvelope() }, // call A original
      { status: 401, body: errEnvelope() }, // call B original
      { status: 200, body: okEnvelope({ accessToken: "tok2" }) }, // refresh (once)
      { status: 200, body: okEnvelope({ a: 1 }) }, // retry A
      { status: 200, body: okEnvelope({ b: 2 }) }, // retry B
    ]);
    vi.stubGlobal("fetch", f);
    const [a, b] = await Promise.all([api("/api/v1/x"), api("/api/v1/y")]);
    expect(a).toEqual({ a: 1 });
    expect(b).toEqual({ b: 2 });
    expect(f).toHaveBeenCalledTimes(5);
    expect(f.mock.calls[2][0]).toBe("/api/v1/auth/refresh");
  });

  it("does not refresh-and-redirect on auth endpoints (login failure surfaces as error)", async () => {
    const f = scriptedFetch([{ status: 401, body: errEnvelope("Invalid email or password") }]);
    vi.stubGlobal("fetch", f);
    const err = await api("/api/v1/auth/login", { method: "POST", body: "{}" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Invalid email or password");
    expect(f).toHaveBeenCalledTimes(1); // no refresh attempt
    expect(useAuthStore.getState().accessToken).toBe("tok1"); // no store nuke
  });
});