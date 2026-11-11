import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  Warehouse,
  ArrowDownUp,
  Menu,
  Sparkles,
  PhoneCall,
  UserCheck,
  BadgeDollarSign,
  CreditCard,
  Wallet,
  PieChart
} from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';

interface BottomNavProps {
  onOpenSidebar: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onOpenSidebar }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { notifications } = useSocket();
  const location = useLocation();

  const getTabsForRole = () => {
    switch (user?.role) {
      case 'STOREKEEPER':
        return [
          { to: '/warehouse', label: t('menu.warehouse', 'Ombor'), icon: Warehouse },
          { to: '/deals', label: t('menu.deals', 'Bitimlar'), icon: Layers },
        ];
      case 'SELLER':
        return [
          { to: '/sales', label: t('menu.sales', 'Sotuvlar'), icon: BadgeDollarSign },
          { to: '/warehouse', label: t('menu.warehouse', 'Ombor'), icon: Warehouse },
          { to: '/debtors', label: t('menu.debtors', 'Qarzlar'), icon: CreditCard },
        ];
      case 'CALL_CENTER_AGENT':
      case 'CALL_CENTER_HEAD':
        return [
          { to: '/leads', label: t('menu.leads', 'Lidlar'), icon: PhoneCall },
          { to: '/deals', label: t('menu.deals', 'Bitimlar'), icon: Layers },
          { to: '/hr', label: t('menu.hr', 'Vazifalar'), icon: UserCheck },
        ];
      case 'HR_MANAGER':
        return [
          { to: '/hr', label: t('menu.hr', 'HR / Tabel'), icon: UserCheck },
          { to: '/daily', label: t('menu.daily', 'Kunlik'), icon: Layers },
        ];
      case 'OPERATOR':
        return [
          { to: '/deals', label: t('menu.deals', 'Bitimlar'), icon: Layers },
          { to: '/warehouse', label: t('menu.warehouse', 'Ombor'), icon: Warehouse },
          { to: '/debtors', label: t('menu.debtors', 'Qarzlar'), icon: CreditCard },
        ];
      case 'CFO':
        return [
          { to: '/dds', label: t('menu.dds', 'DDS'), icon: ArrowDownUp },
          { to: '/balance', label: t('menu.balance', 'Balans'), icon: Wallet },
          { to: '/finances', label: t('menu.finances', 'P&L'), icon: PieChart },
          { to: '/debtors', label: t('menu.debtors', 'Qarzlar'), icon: CreditCard },
        ];
      default:
        // Super Admin & others
        return [
          { to: '/', label: t('menu.dashboard', 'SWOT'), icon: LayoutDashboard, exact: true },
          { to: '/deals', label: t('menu.deals', 'Bitimlar'), icon: Layers },
          { to: '/warehouse', label: t('menu.warehouse', 'Ombor'), icon: Warehouse },
          { to: '/dds', label: t('menu.dds', 'DDS'), icon: ArrowDownUp },
        ];
    }
  };

  const mainTabs = getTabsForRole();
  const isOtherActive = !mainTabs.some((tab) =>
    tab.exact ? location.pathname === tab.to : location.pathname.startsWith(tab.to)
  );

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200/90 dark:border-slate-800/90 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.5)] transition-colors duration-200 pb-[env(safe-area-inset-bottom)]"
    >
      <div 
        className="grid h-16 max-w-md mx-auto items-stretch px-1"
        style={{ gridTemplateColumns: `repeat(${mainTabs.length + 1}, minmax(0, 1fr))` }}
      >
        {mainTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.exact
            ? location.pathname === tab.to
            : location.pathname.startsWith(tab.to);

          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center relative py-1 transition-all duration-150 active:scale-95 group ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-extrabold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 shadow-sm'
                    : 'group-hover:bg-slate-100 dark:group-hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-5 h-5 stroke-[2.2]" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_6px_#10b981]" />
              )}
            </NavLink>
          );
        })}

        {/* 5th Tab: Menu Drawer Toggle */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className={`flex flex-col items-center justify-center relative py-1 transition-all duration-150 active:scale-95 group ${
            isOtherActive
              ? 'text-cyan-600 dark:text-cyan-400 font-extrabold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-semibold'
          }`}
        >
          <div
            className={`p-1.5 rounded-xl relative transition-all ${
              isOtherActive
                ? 'bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 shadow-sm'
                : 'group-hover:bg-slate-100 dark:group-hover:bg-slate-800/60'
            }`}
          >
            <Menu className="w-5 h-5 stroke-[2.2]" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
            )}
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500" />
            )}
          </div>
          <span className="text-[10px] tracking-tight mt-0.5 leading-none flex items-center gap-0.5">
            <span>{t('menu.all', 'Barchasi')}</span>
          </span>
          {isOtherActive && (
            <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 shadow-[0_0_6px_#06b6d4]" />
          )}
        </button>
      </div>
    </nav>
  );
};
export default BottomNav;
