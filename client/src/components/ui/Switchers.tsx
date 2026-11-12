import React from 'react';
import { Moon, Sun, Languages } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTranslation, type Language } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { SegmentedControl } from './Tabs';

const LANGUAGE_LABELS: Record<Language, string> = { uz: 'UZ', ru: 'RU', en: 'EN' };
const LANGUAGE_NAMES: Record<Language, string> = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };

interface LanguageSwitcherProps {
  /** segmented — uchta tugma (UZ | RU | EN); cycle — bitta ixcham tugma, bosilganda keyingi tilga o'tadi */
  variant?: 'segmented' | 'cycle';
  className?: string;
}

/** Til almashtirgich. Tanlov localStorage['finmodel_lang'] da saqlanadi (LanguageContext). */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ variant = 'segmented', className }) => {
  const { language, languages, setLanguage, toggleLanguage, t } = useTranslation();

  if (variant === 'cycle') {
    return (
      <button
        type="button"
        onClick={toggleLanguage}
        aria-label={`${t('layout.language')}: ${LANGUAGE_NAMES[language]}`}
        title={`${t('layout.language')}: ${LANGUAGE_NAMES[language]}`}
        className={cn(
          'inline-flex h-11 min-w-touch items-center justify-center gap-1 rounded-control border border-line bg-surface px-2 text-xs font-semibold text-fg-secondary transition-colors hover:border-line-strong hover:text-fg sm:h-10',
          className
        )}
      >
        <Languages className="h-4 w-4" aria-hidden="true" />
        {LANGUAGE_LABELS[language]}
      </button>
    );
  }

  return (
    <SegmentedControl
      size="sm"
      ariaLabel={t('layout.language')}
      items={languages.map((lang) => ({ value: lang, label: <span title={LANGUAGE_NAMES[lang]}>{LANGUAGE_LABELS[lang]}</span> }))}
      value={language}
      onChange={setLanguage}
      className={className}
    />
  );
};

interface ThemeToggleProps {
  /** Ikonka yonida matn ko'rsatish (sidebar ichida qulay) */
  withLabel?: boolean;
  className?: string;
}

/** Dark / light rejim almashtirgich. Tanlov localStorage['finmodel_theme'] da saqlanadi (ThemeContext). */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ withLabel, className }) => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const label = theme === 'dark' ? t('layout.theme_to_light') : t('layout.theme_to_dark');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-11 min-w-touch items-center justify-center gap-2 rounded-control border border-line bg-surface px-2.5 text-xs font-semibold text-fg-secondary transition-colors hover:border-line-strong hover:text-fg sm:h-10',
        className
      )}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
      {withLabel && <span>{theme === 'dark' ? t('layout.theme_light') : t('layout.theme_dark')}</span>}
    </button>
  );
};
