/**
 * Lightweight i18n — no external dependencies.
 * Uses React context + simple key lookup with interpolation.
 *
 * Usage:
 *   const { t, locale, setLocale } = useI18n();
 *   t("header.title") → "MejoraContactos"
 *   t("stats.contacts", { count: 42 }) → "42 contactos"
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { es } from "./locales/es";
import { en } from "./locales/en";

export type Locale = "es" | "en";

const LOCALES: Record<Locale, Record<string, string>> = { es, en };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const LOCALE_STORAGE_KEY = "__mc_locale__";

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch { /* private browsing */ }

  // Detect browser language
  const browserLang = navigator.language?.slice(0, 2)?.toLowerCase();
  if (browserLang === "es") return "es";
  return "en"; // default
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try { localStorage.setItem(LOCALE_STORAGE_KEY, newLocale); } catch { /* ok */ }
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    const dict = LOCALES[locale] || LOCALES.es;
    let value = dict[key] || LOCALES.es[key] || key;

    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }

    return value;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
