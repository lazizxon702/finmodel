import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  Warehouse,
  ArrowDownUp,
  Menu,
  PhoneCall,
  UserCheck,
  BadgeDollarSign,
  CreditCard,
  Wallet,
  PieChart,
  CalendarCheck,
  Users,
  UsersRound,
  Handshake,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/cn';

interface BottomNavProps {
  onOpenSidebar: () => void;
}

interface TabDef {
  to: string;
  /** navShort.ts dagi menu.short.<key> */
  key: string;
  icon: LucideIcon;
  exact?: boolean;
}

const TAB: Record<string, TabDef> = {
  dashboard: { to: '/', key: 'dashboard', icon: LayoutDashboard, exact: true },
  deals: { to: '/deals', key: 'deals', icon: Layers },
  warehouse: { to: '/warehouse', key: 'warehouse', icon: Warehouse },
  sales: { to: '/sales', key: 'sales', icon: BadgeDollarSign },
  debtors: { to: '/debtors', key: 'debtors', icon: CreditCard },
  leads: { to: '/leads', key: 'leads', icon: PhoneCall },
  hr: { to: '/hr', key: 'hr', icon: UserCheck },
  daily: { to: '/daily', key: 'daily', icon: CalendarCheck },
  dds: { to: '/dds', key: 'dds', icon: ArrowDownUp },
  balance: { to: '/balance', key: 'balance', icon: Wallet },
  finances: { to: '/finances', key: 'finances', icon: PieChart },
  agents: { to: '/agents', key: 'agents', icon: Users },
  team: { to: '/team', key: 'team', icon: UsersRound },
  trust: { to: '/trust', key: 'trust', icon: Handshake },
};

// Rol bo'yicha pastki paneldagi asosiy tablar (faqat shu rolga ruxsat etilgan marshrutlar)
function tabsForRole(role?: string): TabDef[] {
  switch (role) {
    case 'STOREKEEPER':
      return [TAB.warehouse, TAB.deals];
    case 'SELLER':
      return [TAB.sales, TAB.warehouse, TAB.debtors];
    case 'CALL_CENTER_AGENT':
    case 'CALL_CENTER_HEAD':
      return [TAB.leads, TAB.deals, TAB.hr];
    case 'HR_MANAGER':
      return [TAB.hr, TAB.daily];
    case 'OPERATOR':
      return [TAB.deals];
    case 'AGENT':
      return [TAB.deals, TAB.agents, TAB.team];
    case 'CFO':
      return [TAB.dds, TAB.balance, TAB.finances, TAB.debtors];
    case 'CASHIER':
      return [TAB.dds, TAB.trust, TAB.daily, TAB.balance];
    case 'COO':
    case 'MANAGER':
      return [TAB.deals, TAB.warehouse, TAB.sales, TAB.debtors];
    case 'VIEWER':
      return [TAB.dashboard, TAB.finances, TAB.trust];
    default:
      // Super admin
      return [TAB.dashboard, TAB.deals, TAB.warehouse, TAB.dds];
  }
}

export const BottomNav: React.FC<BottomNavProps> = ({ onOpenSidebar }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { notifications } = useSocket();
  const location = useLocation();

  const mainTabs = tabsForRole(user?.role);
  const isTabActive = (tab: TabDef) =>
    tab.exact ? location.pathname === tab.to : location.pathname === tab.to || location.pathname.startsWith(tab.to + '/');
  const isOtherActive = !mainTabs.some(isTabActive);

  const itemClass = (active: boolean) =>
    cn(
      'relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight transition-colors',
      active ? 'font-semibold text-accent' : 'font-medium text-fg-muted hover:text-fg'
    );

  // Ikonka atrofidagi "tabletka": faol tabda yumshoq brend foni
  const iconWrap = (active: boolean) =>
    cn('relative flex h-8 w-14 items-center justify-center rounded-full transition-colors', active && 'bg-brand-soft');

  return (
    <nav
      aria-label={t('layout.bottom_nav')}
      className="no-print fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgb(var(--shadow-color)/0.18)] backdrop-blur-md lg:hidden"
    >
      <div
        className="mx-auto grid h-16 max-w-md items-stretch"
        style={{ gridTemplateColumns: `repeat(${mainTabs.length + 1}, minmax(0, 1fr))` }}
      >
        {mainTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab);
          return (
            <NavLink key={tab.to} to={tab.to} className={itemClass(active)} aria-current={active ? 'page' : undefined}>
              <span className={iconWrap(active)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="max-w-full truncate">{t(`menu.short.${tab.key}`)}</span>
            </NavLink>
          );
        })}

        {/* Oxirgi tab: to'liq menyu */}
        <button type="button" onClick={onOpenSidebar} className={itemClass(isOtherActive)} aria-label={t('layout.open_menu')}>
          <span className={iconWrap(isOtherActive)}>
            <Menu className="h-5 w-5" aria-hidden="true" />
            {notifications.length > 0 && (
              <span
                className="absolute right-3 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger-solid"
                aria-label={t('layout.new_notifications', { count: notifications.length })}
              />
            )}
          </span>
          <span className="max-w-full truncate">{t('menu.all')}</span>
        </button>
      </div>
    </nav>
  );
};
export default BottomNav;
