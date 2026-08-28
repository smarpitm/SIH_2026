"use client";

import { create } from "zustand";
import type { UserDTO } from "@/packages/shared/types";

export interface AuthState {
  user: UserDTO | null;
  accessToken: string | null;
  setAuth: (user: UserDTO | null, token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  logout: () => {
    // Clear session cookie
    if (typeof document !== "undefined") {
      document.cookie = "pm_session=; path=/; max-age=0;";
    }
    set({ user: null, accessToken: null });
  },
}));
