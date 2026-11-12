import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, type Dict, type I18nModule, type Language, type TVars } from '../i18n/types';

export type { Language } from '../i18n/types';

// ---------------------------------------------------------------------------
// Lug'atlar: i18n/modules/*.ts fayllari avtomatik yig'iladi.
// Yangi modul qo'shish uchun FAQAT i18n/modules/<modul>.ts faylini yarating —
// bu faylga tegish shart emas.
// ---------------------------------------------------------------------------
const moduleFiles = import.meta.glob<{ default: I18nModule }>('../i18n/modules/*.ts', { eager: true });

const translations: Record<Language, Dict> = { uz: {}, ru: {}, en: {} };

for (const [path, mod] of Object.entries(moduleFiles)) {
  const dict = mod?.default;
  if (!dict) continue;
  for (const lang of LANGUAGES) {
    const entries = dict[lang] || {};
    if (import.meta.env.DEV) {
      for (const key of Object.keys(entries)) {
        if (key in translations[lang]) {
          console.warn(`[i18n] Takrorlangan kalit "${key}" (${lang}) — ${path}`);
        }
      }
    }
    Object.assign(translations[lang], entries);
  }
}

const STORAGE_KEY = 'finmodel_lang';

// Dev rejimida yetishmayotgan kalit haqida faqat bir marta ogohlantiramiz
const warnedKeys = new Set<string>();

function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === null || value === undefined ? match : String(value);
  });
}

/**
 * Tarjima funksiyasi (React'dan tashqarida ham ishlatish mumkin).
 * Tartib: joriy til → uz → fallback → key.
 *   translate('uz', 'common.save')
 *   translate('ru', 'x.title', 'Zaxira matn')
 *   translate('en', 'x.count', { count: 3 })
 *   translate('en', 'x.count', 'Jami {count}', { count: 3 })
 */
export function translate(
  language: Language,
  key: string,
  fallbackOrVars?: string | TVars,
  vars?: TVars
): string {
  const fallback = typeof fallbackOrVars === 'string' ? fallbackOrVars : undefined;
  const values = typeof fallbackOrVars === 'object' && fallbackOrVars !== null ? fallbackOrVars : vars;

  const current = translations[language]?.[key];
  if (current !== undefined) return interpolate(current, values);

  if (import.meta.env.DEV) {
    const mark = `${language}:${key}`;
    if (!warnedKeys.has(mark)) {
      warnedKeys.add(mark);
      console.warn(`[i18n] Kalit topilmadi: "${key}" (${language})`);
    }
  }

  const uz = translations.uz[key];
  if (uz !== undefined) return interpolate(uz, values);
  return interpolate(fallback ?? key, values);
}

export type TFunction = (key: string, fallbackOrVars?: string | TVars, vars?: TVars) => string;

interface LanguageContextType {
  language: Language;
  languages: Language[];
  setLanguage: (lang: Language) => void;
  /** Keyingi tilga o'tadi: uz → ru → en → uz */
  toggleLanguage: () => void;
  t: TFunction;
}

function readSavedLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'uz' || saved === 'ru' || saved === 'en') return saved;
  } catch {
    // localStorage yopiq bo'lishi mumkin
  }
  return 'uz';
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'uz',
  languages: LANGUAGES,
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key, fallbackOrVars, vars) => translate('uz', key, fallbackOrVars, vars),
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(readSavedLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // e'tiborsiz
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    const next = LANGUAGES[(LANGUAGES.indexOf(language) + 1) % LANGUAGES.length];
    setLanguage(next);
  }, [language, setLanguage]);

  // <html lang="..."> — ekran o'quvchilar va brauzer uchun
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback<TFunction>(
    (key, fallbackOrVars, vars) => translate(language, key, fallbackOrVars, vars),
    [language]
  );

  const value = useMemo(
    () => ({ language, languages: LANGUAGES, setLanguage, toggleLanguage, t }),
    [language, setLanguage, toggleLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useTranslation = () => useContext(LanguageContext);
export const useLanguage = () => useContext(LanguageContext);
