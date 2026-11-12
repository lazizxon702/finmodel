import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'finmodel_theme';

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
});

// Mavzuni <html> va <body> ga qo'llaydi. Ranglar index.css dagi :root / .dark tokenlaridan keladi.
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const other: Theme = theme === 'dark' ? 'light' : 'dark';
  root.classList.add(theme);
  root.classList.remove(other);
  document.body.classList.add(theme);
  document.body.classList.remove(other);

  // Mobil brauzer / PWA yuqori paneli rangi ham mavzuga mos bo'lsin
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1218' : '#f3f5f7');
}

function readSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage yopiq bo'lishi mumkin — standart qiymatga qaytamiz
  }
  return 'dark'; // Standart rejim — dark
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = readSavedTheme();
    // Birinchi chizishdan oldin qo'llaymiz — rejim "miltillab" almashmasin
    if (typeof document !== 'undefined') applyTheme(initial);
    return initial;
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // e'tiborsiz
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => setThemeState(newTheme);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
