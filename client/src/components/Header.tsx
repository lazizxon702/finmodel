import React from 'react';
import { Menu, FileSpreadsheet, LogOut, Smartphone, Bot, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { LanguageSwitcher, ThemeToggle } from './ui/Switchers';

interface HeaderProps {
  onOpenSidebar: () => void;
  onOpenExport: () => void;
  onOpenInstall?: () => void;
  onOpenNotifications?: () => void;
  title: string;
}

// Yuqori paneldagi ikonka-tugmalar uchun umumiy klass (44px mobil, 40px desktop)
const iconButton =
  'inline-flex h-11 min-w-touch shrink-0 items-center justify-center gap-2 rounded-control border border-line bg-surface px-2.5 text-xs font-semibold text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg sm:h-10';

export const Header: React.FC<HeaderProps> = ({ onOpenSidebar, onOpenExport, onOpenInstall, onOpenNotifications, title }) => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const fullName = user?.fullName || t('header.user');
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-4 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t('layout.open_menu')}
          className={`${iconButton} lg:hidden`}
        >
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="truncate text-sm font-semibold tracking-tight text-fg sm:text-base">{title}</h2>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {/* Til: mobilda bitta ixcham tugma, sm+ da uch segment */}
        <LanguageSwitcher variant="cycle" className="sm:hidden" />
        <LanguageSwitcher className="hidden sm:inline-flex" />

        <ThemeToggle />

        {/* Eksport — mobilda yon menyuda */}
        <button type="button" onClick={onOpenExport} title={t('header.export_full')} className={`${iconButton} hidden md:inline-flex`}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          <span className="hidden xl:inline">{t('header.export_short')}</span>
        </button>

        {/* AI yordamchi — mobilda yon menyuda */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-ai-assistant'))}
          title={t('layout.ai_agent')}
          className={`${iconButton} hidden md:inline-flex`}
        >
          <Bot className="h-4 w-4" aria-hidden="true" />
          <span className="hidden xl:inline">{t('layout.ai_agent_short')}</span>
        </button>

        {/* Bildirishnoma sozlamalari — mobilda yon menyuda */}
        {onOpenNotifications && (
          <button
            type="button"
            onClick={onOpenNotifications}
            title={t('notifications.menu')}
            aria-label={t('notifications.menu')}
            className={`${iconButton} hidden md:inline-flex`}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {/* Ilovani o'rnatish — mobilda yon menyuda */}
        {onOpenInstall && (
          <button type="button" onClick={onOpenInstall} title={t('layout.install_app')} className={`${iconButton} hidden lg:inline-flex`}>
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            <span className="hidden 2xl:inline">{t('layout.install_app_short')}</span>
          </button>
        )}

        {/* Foydalanuvchi */}
        <div className="flex items-center gap-2 border-l border-line pl-2 sm:pl-3">
          <div
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-accent sm:flex"
            aria-hidden="true"
          >
            {initials || '?'}
          </div>
          <div className="hidden min-w-0 leading-tight lg:block">
            <p className="max-w-[160px] truncate text-sm font-medium text-fg">{fullName}</p>
            <p className="max-w-[160px] truncate text-xs text-fg-muted">
              {t(`roles.${user?.role || 'OPERATOR'}`, t('roles.unknown'))}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label={t('header.logout')}
            title={t('header.logout')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger sm:h-10 sm:w-10"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
};
export default Header;
