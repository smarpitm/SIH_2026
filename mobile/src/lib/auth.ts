import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { UserDTO } from "./types";

const TOKEN_KEY = "pramanam.accessToken";
const USER_KEY = "pramanam.user";

interface AuthState {
  ready: boolean;
  token: string | null;
  user: UserDTO | null;
  hydrate: () => Promise<void>;
  signIn: (token: string, user: UserDTO) => Promise<void>;
  setToken: (token: string | null) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  token: null,
  user: null,

  hydrate: async () => {
    try {
      const [token, userJson] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);
      set({
        ready: true,
        token,
        user: userJson ? (JSON.parse(userJson) as UserDTO) : null,
      });
    } catch {
      set({ ready: true });
    }
  },

  signIn: async (token, user) => {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED }),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      }),
    ]);
    set({ token, user });
  },

  setToken: async (token) => {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
    set({ token });
  },

  signOut: async () => {
    await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]);
    set({ token: null, user: null });
  },
}));
