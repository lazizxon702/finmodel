import React from 'react';
import { Menu, FileSpreadsheet, LogOut, UserCheck, Languages, Sun, Moon, Smartphone, Bot, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenExport: () => void;
  onOpenInstall?: () => void;
  title: string;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar, onOpenExport, onOpenInstall, title }) => {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-16 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl border-b border-slate-200/90 dark:border-slate-800/90 sticky top-0 z-30 px-2.5 sm:px-4 lg:px-8 flex items-center justify-between shadow-sm dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)] transition-colors duration-200">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2">
        <button
          onClick={onOpenSidebar}
          aria-label="Open Navigation Menu"
          className="lg:hidden p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all active:scale-95 border border-slate-200 dark:border-slate-800 shadow-sm shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-xs sm:text-base lg:text-lg font-black text-slate-800 dark:text-white tracking-tight truncate">
          {title}
        </h2>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3.5 shrink-0">
        {/* Light / Dark Mode Toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? "Yorug' rejimga o'tish (Light mode)" : "Qorong'u rejimga o'tish (Dark mode)"}
          className="btn-3d flex items-center justify-center p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-amber-400 shadow-inner transition-all duration-200 active:scale-95"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="hidden sm:inline text-amber-300 ml-1.5">Light</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline text-slate-700 ml-1.5">Dark</span>
            </>
          )}
        </button>

        {/* Mobile Single Tap Language Switcher */}
        <button
          onClick={() => setLanguage(language === 'uz' ? 'ru' : 'uz')}
          className="sm:hidden btn-3d flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-200 shadow-inner active:scale-95"
          title="Tilni almashtirish / Сменить язык"
        >
          <span className="text-sm">{language === 'uz' ? '🇺🇿' : '🇷🇺'}</span>
          <span>{language === 'uz' ? 'UZ' : 'RU'}</span>
        </button>

        {/* Desktop 3D Dual Language Switcher (UZ / RU) */}
        <div className="hidden sm:flex items-center p-1 bg-slate-100 dark:bg-slate-900 border border-slate-300/80 dark:border-slate-800 rounded-xl shadow-inner">
          <button
            onClick={() => setLanguage('uz')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${
              language === 'uz'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_2px_8px_rgba(6,182,212,0.3)] scale-[1.02]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="text-sm">🇺🇿</span>
            <span>UZ</span>
          </button>
          <button
            onClick={() => setLanguage('ru')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${
              language === 'ru'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_2px_8px_rgba(6,182,212,0.3)] scale-[1.02]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span className="text-sm">🇷🇺</span>
            <span>RU</span>
          </button>
        </div>

        {/* 3D Export Button */}
        <button
          onClick={onOpenExport}
          title={t('header.export_full', 'Google Sheets / Excel\'ga yuklash')}
          className="btn-3d inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_2px_0_0_#065f46,0_4px_12px_rgba(16,185,129,0.25)] hover:from-emerald-500 hover:to-teal-500 transition-all active:scale-95"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
          <span className="hidden md:inline">{t('header.export_full', 'Google Sheets / Excel')}</span>
        </button>

        {/* Macmobi AI Agent Button */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-ai-assistant'))}
          title="Macmobi AI Agent (Gemini AI)"
          className="btn-3d inline-flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white shadow-[0_2px_0_0_#4338ca,0_4px_12px_rgba(99,102,241,0.3)] hover:brightness-110 transition-all active:scale-95"
        >
          <Bot className="w-4 h-4 text-white" />
          <span className="hidden xl:inline">Macmobi AI Agent</span>
          <span className="xl:hidden hidden sm:inline">AI Agent</span>
          <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
        </button>

        {/* Install Mobile App / APK Button */}
        {onOpenInstall && (
          <button
            onClick={onOpenInstall}
            title="Telefonga o'rnatish (APK / App)"
            className="btn-3d flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-teal-500/10 to-emerald-500/10 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-300/80 dark:border-emerald-800/80 hover:bg-emerald-500/20 transition-all active:scale-95"
          >
            <Smartphone className="w-4 h-4 text-emerald-500 animate-pulse" />
            <span className="hidden xl:inline">Ilovani o'rnatish (APK)</span>
            <span className="xl:hidden hidden sm:inline">APK</span>
          </button>
        )}

        {/* User Profile Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-slate-200 dark:border-slate-800 text-xs">
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 flex items-center justify-center text-cyan-600 dark:text-cyan-400 font-bold shadow-inner">
            <UserCheck className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div className="hidden lg:block leading-tight text-left">
            <p className="font-bold text-slate-800 dark:text-white truncate max-w-[140px]">{user?.fullName || t('header.user', 'Foydalanuvchi')}</p>
            <p className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold tracking-wider uppercase truncate max-w-[140px]">
              {user?.role === 'ADMIN' ? 'Super Admin' :
               user?.role === 'CFO' ? 'Moliya Direktori' :
               user?.role === 'COO' ? 'Operatsion Rahbar' :
               user?.role === 'CALL_CENTER_HEAD' ? 'Koll-markaz Rahbari' :
               user?.role === 'CALL_CENTER_AGENT' ? 'Koll-markaz Xodimi' :
               user?.role === 'OPERATOR' ? 'Katta Operator' :
               user?.role === 'STOREKEEPER' ? 'Bosh Omborchi' :
               user?.role === 'SELLER' ? 'Katta Sotuvchi' :
               user?.role === 'HR_MANAGER' ? 'HR Mas\'uli' :
               user?.role === 'VIEWER' ? 'Kuzatuvchi' :
               user?.role || 'OPERATOR'}
            </p>
          </div>
          <button
            onClick={logout}
            title={t('header.logout', 'Chiqish')}
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
export default Header;
