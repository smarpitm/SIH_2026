"use client";

import { create } from "zustand";
import type { UserDTO } from "@/packages/shared/types";

// accessToken lives in zustand MEMORY only — the durable session is the
// httpOnly pm_refresh cookie (set by the API); a full page reload recovers
// it via POST /api/v1/auth/refresh on the first 401 (components/api-client.ts).
// user is persisted to localStorage for header/render UX only.
export interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  setAuth: (user: UserDTO, token: string) => void;
  /** AUDIT FINDING #71: persist the rotated access token after a 401 refresh
   *  so subsequent fetches reuse it instead of re-refreshing on every call. */
  setAccessToken: (token: string) => void;
  logout: () => void;
  rehydrate: () => void;
}

const USER_KEY = "pm_user";

export function readStoredUser(): UserDTO | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserDTO) : null;
  } catch {
    return null;
  }
}

// AUDIT FINDING #23: these cookies are renamed to make the intent impossible to
// miss — pm_ui_session_hint (presence) + pm_ui_role_hint (role hint) are
// CLIENT-SET UI hints ONLY. The server remains the authority; middleware is UX.
// server remains authority; middleware is UX.
function setSessionCookies(role: string) {
  if (typeof document === "undefined") return;
  document.cookie = "pm_ui_session_hint=1; path=/; max-age=604800; SameSite=Lax";
  document.cookie = `pm_ui_role_hint=${encodeURIComponent(role)}; path=/; max-age=604800; SameSite=Lax`;
}

function clearSessionCookies() {
  if (typeof document === "undefined") return;
  document.cookie = "pm_ui_session_hint=; path=/; max-age=0;";
  document.cookie = "pm_ui_role_hint=; path=/; max-age=0;";
  // legacy names (pre-rename) — clear them so stale cookies cannot confuse UX
  document.cookie = "pm_session=; path=/; max-age=0;";
  document.cookie = "pm_role=; path=/; max-age=0;";
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setAuth: (user, accessToken) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    setSessionCookies(user.role);
    set({ user, accessToken });
  },
  setAccessToken: (accessToken) => set({ accessToken }),
  logout: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(USER_KEY);
    }
    clearSessionCookies();
    set({ user: null, accessToken: null });
  },
  // call once from a client component effect (post-hydration) to restore the
  // persisted user without SSR/hydration mismatch.
  rehydrate: () => set({ user: readStoredUser() }),
}));
