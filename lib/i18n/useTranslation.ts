"use client";

import { useState, useEffect, useCallback } from "react";
import { en } from "./en";
import { hi } from "./hi";

export type Lang = "en" | "hi";

// N1 contract (lib/i18n is Nishka's): key set frozen, English fallback holds while
// hi.ts fills. Hook extended in place for K5 so the Header toggle + ?lang= actually
// flip verdict/anchor words — export contract { t, lang, setLang } unchanged.
const DICTS: Record<Lang, Record<string, string>> = {
  en,
  hi,
};

const LS_KEY = "pm_lang";

// module-level so every useTranslation() instance (Header + pages) shares one
// language; instances subscribe and re-render when the toggle flips.
let current: Lang = "en";
const subscribers = new Set<(l: Lang) => void>();

function apply(l: Lang) {
  current = l;
  try {
    localStorage.setItem(LS_KEY, l);
  } catch {
    // private mode — language just won't persist
  }
  // keep <html lang> in sync for a11y/screen readers (WCAG checkpoint in the
  // accessibility deck) — client-only module, so document is always available
  if (typeof document !== "undefined") {
    document.documentElement.lang = l;
  }
  subscribers.forEach((s) => s(l));
}

// PURE lookup — active lang first, then English fallback, then caller fallback.
export function translate(lang: Lang, key: string, fallback?: string): string {
  return DICTS[lang][key] ?? en[key] ?? fallback ?? key;
}

export function useTranslation() {
  const [lang, setLangState] = useState<Lang>(current);

  useEffect(() => {
    // ?lang=hi wins for the page load; else the persisted toggle choice.
    const q = new URLSearchParams(window.location.search).get("lang");
    const initial: Lang =
      q === "hi" || q === "en" ? q : localStorage.getItem(LS_KEY) === "hi" ? "hi" : "en";
    if (initial !== current) apply(initial);
    setLangState(current);
    subscribers.add(setLangState);
    return () => {
      subscribers.delete(setLangState);
    };
  }, []);

  const setLang = useCallback((l: Lang) => apply(l), []);
  const t = useCallback((key: string, fallback?: string) => translate(lang, key, fallback), [lang]);

  return { t, lang, setLang };
}