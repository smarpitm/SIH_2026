"use client";

import { useState, useCallback } from "react";

// TODO(Nishka): full translation dictionary implementation — English fallback
export function useTranslation() {
  const [lang, setLangState] = useState<"en" | "hi">("en");

  const setLang = useCallback((l: "en" | "hi") => {
    setLangState(l);
  }, []);

  const t = useCallback((key: string, fallback?: string) => {
    return fallback ?? key;
  }, []);

  return { t, lang, setLang };
}