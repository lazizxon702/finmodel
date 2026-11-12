import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  Warehouse,
  BadgeDollarSign,
  CreditCard,
  Users,
  TrendingUp,
  ArrowDownUp,
  Wallet,
  CalendarCheck,
  Calculator,
  Bot,
  Receipt,
  PieChart,
  Settings2,
  X,
  Smartphone,
  PhoneCall,
  UserCheck,
  ShieldCheck,
  Handshake,
  UsersRound,
  FileSpreadsheet,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { useRealtime, useSocket } from '../context/SocketContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/cn';
import { LanguageSwitcher, ThemeToggle } from './ui/Switchers';

// ---------------------------------------------------------------------------
// RBAC: rolning bosh sahifasi va ruxsat etilgan marshrutlari.
// Yangi marshrut qo'shilsa: (1) shu yerda rollarga bering, (2) pastdagi MENU ga yozing,
// (3) App.tsx da <Route> va sarlavha kalitini qo'shing, (4) nav.ts ga menu.*/title.* tarjimasini yozing.
// ---------------------------------------------------------------------------
export const ROLE_DEFAULT_HOME: Record<string, string> = {
  ADMIN: '/',
  CFO: '/dds',
  COO: '/deals',
  CALL_CENTER_HEAD: '/leads',
  CALL_CENTER_AGENT: '/leads',
  OPERATOR: '/deals',
  AGENT: '/deals',
  STOREKEEPER: '/warehouse',
  SELLER: '/sales',
  HR_MANAGER: '/hr',
  VIEWER: '/',
  MANAGER: '/deals',
  CASHIER: '/dds'
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    '/', '/leads', '/deals', '/warehouse', '/sales', '/debtors', '/agents',
    '/agents-swot', '/hr', '/dds', '/trust', '/balance', '/daily', '/finmodel',
    '/bot-deals', '/bot-payments', '/finances', '/references', '/users', '/team'
  ],
  CFO: [
    '/dds', '/trust', '/balance', '/debtors', '/daily', '/finances', '/finmodel', '/agents', '/references'
  ],
  COO: [
    '/deals', '/warehouse', '/sales', '/leads', '/debtors', '/agents', '/agents-swot', '/daily', '/trust'
  ],
  CALL_CENTER_HEAD: [
    '/leads', '/hr', '/deals', '/agents', '/agents-swot'
  ],
  CALL_CENTER_AGENT: [
    '/leads', '/deals', '/hr'
  ],
  // Operator faqat bitim kiritadi
  OPERATOR: [
    '/deals'
  ],
  // Agent: bitimlar, o'z kabineti (/agents) va operatorlarini boshqarish (/team)
  AGENT: [
    '/deals', '/agents', '/team'
  ],
  STOREKEEPER: [
    '/warehouse', '/deals'
  ],
  SELLER: [
    '/sales', '/warehouse', '/debtors'
  ],
  HR_MANAGER: [
    '/hr', '/daily'
  ],
  VIEWER: [
    '/', '/finances', '/finmodel', '/agents-swot', '/trust'
  ],
  MANAGER: ['/deals', '/warehouse', '/sales', '/debtors', '/agents', '/daily', '/trust'],
  CASHIER: ['/dds', '/daily', '/balance', '/bot-payments', '/trust']
};

/** Berilgan yo'l rol uchun ochiqmi. `/agents` ruxsati `/agents-swot` ni OCHMAYDI (aniq yoki ichki yo'l). */
export function isPathAllowed(role: string | undefined, pathname: string): boolean {
  const allowed = ROLE_PERMISSIONS[role || 'OPERATOR'] || ROLE_PERMISSIONS.OPERATOR;
  return allowed.some((p) => p === pathname || (p !== '/' && pathname.startsWith(p + '/')));
}

interface MenuItem {
  to: string;
  /** nav.ts dagi kalit: menu.<key> va menu.<key>_sub */
  key: string;
  icon: LucideIcon;
}

const MENU: MenuItem[] = [
  { to: '/', key: 'dashboard', icon: LayoutDashboard },
  { to: '/leads', key: 'leads', icon: PhoneCall },
  { to: '/deals', key: 'deals', icon: Layers },
  { to: '/team', key: 'team', icon: UsersRound },
  { to: '/warehouse', key: 'warehouse', icon: Warehouse },
  { to: '/sales', key: 'sales', icon: BadgeDollarSign },
  { to: '/debtors', key: 'debtors', icon: CreditCard },
  { to: '/agents', key: 'agents', icon: Users },
  { to: '/agents-swot', key: 'agents_swot', icon: TrendingUp },
  { to: '/hr', key: 'hr', icon: UserCheck },
  { to: '/dds', key: 'dds', icon: ArrowDownUp },
  { to: '/trust', key: 'trust', icon: Handshake },
  { to: '/balance', key: 'balance', icon: Wallet },
  { to: '/daily', key: 'daily', icon: CalendarCheck },
  { to: '/finmodel', key: 'finmodel', icon: Calculator },
  { to: '/bot-deals', key: 'bot_deals', icon: Bot },
  { to: '/bot-payments', key: 'bot_payments', icon: Receipt },
  { to: '/finances', key: 'finances', icon: PieChart },
  { to: '/references', key: 'references', icon: Settings2 },
  { to: '/users', key: 'users', icon: ShieldCheck },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInstall?: () => void;
  onOpenExport?: () => void;
  onOpenNotifications?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenInstall, onOpenExport, onOpenNotifications }) => {
  const { user } = useAuth();
  const { notifications } = useSocket();
  const { t } = useTranslation();

  const userRole = user?.role || 'OPERATOR';

  // ADMIN: tasdiq kutayotgan bitimlar soni ("Bitimlar" yonidagi nishon). Xato bo'lsa nishon ko'rinmaydi.
  const isAdmin = user?.role === 'ADMIN';
  const [pendingDeals, setPendingDeals] = useState(0);
  const loadPendingDeals = useCallback(() => {
    axios
      .get('/api/deals/pending-count')
      .then((res) => setPendingDeals(Number(res.data?.count) || 0))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (isAdmin) loadPendingDeals();
    else setPendingDeals(0);
  }, [isAdmin, loadPendingDeals]);
  useRealtime('deals:updated', loadPendingDeals, isAdmin);
  const allowedPaths = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['OPERATOR'];
  const visibleMenuItems = userRole === 'ADMIN' ? MENU : MENU.filter((item) => allowedPaths.includes(item.to));

  const utilityButton =
    'flex min-h-touch w-full items-center gap-3 rounded-control px-3 text-left text-sm font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg';

  return (
    <>
      {/* Mobil: orqa fon */}
      {isOpen && <div className="fixed inset-0 z-40 bg-overlay/60 lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={cn(
          'no-print fixed bottom-0 left-0 top-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface text-fg',
          'pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out lg:translate-x-0',
          isOpen ? 'translate-x-0 shadow-pop lg:shadow-none' : '-translate-x-full'
        )}
      >
        {/* Brend */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/macmobi-icon.png"
              alt=""
              className="h-9 w-9 shrink-0 rounded-control border border-line bg-surface-2 object-contain p-0.5"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-fg">Macmobi ERP</p>
              <p className="truncate text-xs text-fg-muted">{t(`roles.${userRole}`, t('roles.unknown'))}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('layout.close_menu')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigatsiya */}
        <nav aria-label={t('layout.main_nav')} className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isPendingBadge = item.to === '/deals' && isAdmin;
            const badge = item.to === '/bot-payments' ? notifications.length : isPendingBadge ? pendingDeals : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  cn(
                    'group flex min-h-touch items-center gap-3 rounded-control px-3 py-1.5 transition-colors',
                    isActive ? 'bg-brand text-brand-fg' : 'text-fg-secondary hover:bg-surface-2 hover:text-fg'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-medium">{t(`menu.${item.key}`)}</span>
                      <span className={cn('block truncate text-xs', isActive ? 'text-brand-fg/75' : 'text-fg-muted')}>
                        {t(`menu.${item.key}_sub`)}
                      </span>
                    </span>
                    {badge > 0 && (
                      <span
                        aria-label={t(isPendingBadge ? 'notifications.pending_badge' : 'layout.new_notifications', { count: badge })}
                        title={isPendingBadge ? t('notifications.pending_badge', { count: badge }) : undefined}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                          isActive ? 'bg-brand-fg/20 text-brand-fg' : isPendingBadge ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Yordamchi amallar */}
        <div className="shrink-0 space-y-0.5 border-t border-line px-3 py-2">
          {onOpenExport && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExport();
              }}
              className={cn(utilityButton, 'md:hidden')}
            >
              <FileSpreadsheet className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="truncate">{t('header.export_full')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent('open-ai-assistant'));
            }}
            className={utilityButton}
          >
            <Bot className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate">{t('layout.ai_agent')}</span>
              <span className="block truncate text-xs font-normal text-fg-muted">{t('layout.ai_agent_sub')}</span>
            </span>
          </button>
          {onOpenNotifications && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNotifications();
              }}
              className={utilityButton}
            >
              <Bell className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate">{t('notifications.menu')}</span>
                <span className="block truncate text-xs font-normal text-fg-muted">{t('notifications.menu_sub')}</span>
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenInstall?.();
            }}
            className={utilityButton}
          >
            <Smartphone className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="min-w-0 leading-tight">
              <span className="block truncate">{t('layout.install_app')}</span>
              <span className="block truncate text-xs font-normal text-fg-muted">{t('layout.install_app_sub')}</span>
            </span>
          </button>
        </div>

        {/* Til, mavzu, vaqt zonasi */}
        <div className="shrink-0 border-t border-line px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <LanguageSwitcher />
            <ThemeToggle withLabel />
          </div>
          <p className="mt-2 text-xs text-fg-muted">{t('layout.tashkent_time')}: Asia/Tashkent (UTC+5)</p>
        </div>
      </aside>
    </>
  );
};
