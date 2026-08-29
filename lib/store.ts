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

// pm_session (presence) + pm_role exist ONLY for middleware UX.
// server remains authority; middleware is UX.
function setSessionCookies(role: string) {
  if (typeof document === "undefined") return;
  document.cookie = "pm_session=1; path=/; max-age=604800; SameSite=Lax";
  document.cookie = `pm_role=${encodeURIComponent(role)}; path=/; max-age=604800; SameSite=Lax`;
}

function clearSessionCookies() {
  if (typeof document === "undefined") return;
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
