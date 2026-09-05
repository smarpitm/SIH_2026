"use client";

import { useState, useEffect, useCallback } from "react";

export type Theme = "light" | "dark";

const LS_KEY = "pm_theme";

// module-level so every useTheme() instance shares one theme; instances
// subscribe and re-render when the toggle flips (same pattern as useTranslation).
let current: Theme = "light";
const subscribers = new Set<(t: Theme) => void>();

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function apply(t: Theme) {
  current = t;
  try {
    localStorage.setItem(LS_KEY, t);
  } catch {
    // private mode — theme just won't persist
  }
  if (typeof document !== "undefined") {
    // `dark` class flips Tailwind's dark: variants; color-scheme keeps native
    // scrollbars/form controls consistent with the chosen theme.
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.style.colorScheme = t;
  }
  subscribers.forEach((s) => s(t));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(current);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // persisted choice wins; otherwise follow the OS preference (and let the
    // hydration-render stay neutral so it never fights the server markup).
    const stored = localStorage.getItem(LS_KEY);
    const initial: Theme =
      stored === "dark" || stored === "light" ? stored : systemTheme();
    if (initial !== current) apply(initial);
    setThemeState(current);
    subscribers.add(setThemeState);
    return () => {
      subscribers.delete(setThemeState);
    };
  }, []);

  const setTheme = useCallback((t: Theme) => apply(t), []);

  return { theme, setTheme, mounted };
}
