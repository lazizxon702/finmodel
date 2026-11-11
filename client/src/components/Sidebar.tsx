import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Layers,
  Package,
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
  Sparkles,
  Smartphone,
  Download,
  PhoneCall,
  UserCheck,
  ShieldCheck
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

export const ROLE_DEFAULT_HOME: Record<string, string> = {
  ADMIN: '/',
  CFO: '/dds',
  COO: '/deals',
  CALL_CENTER_HEAD: '/leads',
  CALL_CENTER_AGENT: '/leads',
  OPERATOR: '/deals',
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
    '/agents-swot', '/hr', '/dds', '/balance', '/daily', '/finmodel',
    '/bot-deals', '/bot-payments', '/finances', '/references', '/users'
  ],
  CFO: [
    '/dds', '/balance', '/debtors', '/daily', '/finances', '/finmodel', '/agents', '/references'
  ],
  COO: [
    '/deals', '/warehouse', '/sales', '/leads', '/debtors', '/agents', '/agents-swot', '/daily'
  ],
  CALL_CENTER_HEAD: [
    '/leads', '/hr', '/deals', '/agents', '/agents-swot'
  ],
  CALL_CENTER_AGENT: [
    '/leads', '/deals', '/hr'
  ],
  OPERATOR: [
    '/deals', '/warehouse', '/debtors', '/bot-deals'
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
    '/', '/finances', '/finmodel', '/agents-swot'
  ],
  MANAGER: ['/deals', '/warehouse', '/sales', '/debtors', '/agents', '/daily'],
  CASHIER: ['/dds', '/daily', '/balance', '/bot-payments']
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInstall?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenInstall }) => {
  const { user } = useAuth();
  const { notifications } = useSocket();
  const { t } = useTranslation();

  const menuItems = [
    { to: '/', label: t('menu.dashboard', 'Dashboard'), sub: t('menu.dashboard_sub', 'SWOT дате'), icon: LayoutDashboard },
    { to: '/leads', label: t('menu.leads', 'Lidlar (CRM)'), sub: t('menu.leads_sub', 'Koll-markaz & Jamoalar'), icon: PhoneCall, highlight: true },
    { to: '/deals', label: t('menu.deals', 'Bitimlar'), sub: t('menu.deals_sub', 'Bitimlar va ombor'), icon: Layers, highlight: true },
    { to: '/warehouse', label: t('menu.warehouse', 'Ombor'), sub: t('menu.warehouse_sub', 'Qurilmalar va prixod'), icon: Warehouse },
    { to: '/sales', label: t('menu.sales', 'Sotuvlar'), sub: t('menu.sales_sub', 'Sotuvlar va marja'), icon: BadgeDollarSign },
    { to: '/debtors', label: t('menu.debtors', 'Qarzdorlar'), sub: t('menu.debtors_sub', 'Qarz hisobi va muddatlar'), icon: CreditCard },
    { to: '/agents', label: t('menu.agents', 'Agentlar'), sub: t('menu.agents_sub', 'Агент'), icon: Users },
    { to: '/agents-swot', label: t('menu.agents_swot', 'Agentliklar tahlili'), sub: t('menu.agents_swot_sub', 'SWOT Агентства'), icon: TrendingUp },
    { to: '/hr', label: t('menu.hr', 'HR va Davomat'), sub: t('menu.hr_sub', 'Xodimlar, Tabel & Maosh'), icon: UserCheck, highlight: true },
    { to: '/dds', label: t('menu.dds', 'Pul harakati — DDS'), sub: t('menu.dds_sub', 'Транзакции ДДС'), icon: ArrowDownUp },
    { to: '/balance', label: t('menu.balance', 'Balans / Depozitlar'), sub: t('menu.balance_sub', 'Баланс'), icon: Wallet },
    { to: '/daily', label: t('menu.daily', 'Kunlik hisob'), sub: t('menu.daily_sub', 'Ежедневный Учет'), icon: CalendarCheck },
    { to: '/finmodel', label: t('menu.finmodel', 'Moliyaviy model'), sub: t('menu.finmodel_sub', 'Фин Модель'), icon: Calculator },
    { to: '/bot-deals', label: t('menu.bot_deals', 'Bot bitimlari'), sub: t('menu.bot_deals_sub', 'Сделки Бот'), icon: Bot },
    { to: '/bot-payments', label: t('menu.bot_payments', 'Telegram cheklar'), sub: t('menu.bot_payments_sub', 'Платежи Бота / БОТ ТР'), icon: Receipt, badge: notifications.length },
    { to: '/finances', label: t('menu.finances', 'P&L, Kassa va Balans'), sub: t('menu.finances_sub', 'Финансы Свод'), icon: PieChart },
    { to: '/references', label: t('menu.references', 'Spravochniklar'), sub: t('menu.references_sub', 'Sozlamalar & Stavkalar'), icon: Settings2 },
    { to: '/users', label: t('menu.users', 'Foydalanuvchilar va Rollar'), sub: t('menu.users_sub', 'Login, parol & boshqaruv'), icon: ShieldCheck, highlight: true },
  ];

  const userRole = user?.role || 'OPERATOR';
  const allowedPaths = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['OPERATOR'];
  const visibleMenuItems = userRole === 'ADMIN'
    ? menuItems
    : menuItems.filter((item) => allowedPaths.includes(item.to));

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-md lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col border-r border-slate-200/90 dark:border-slate-800/80 shadow-[10px_0_30px_rgba(0,0,0,0.06)] dark:shadow-[10px_0_30px_rgba(0,0,0,0.35)] transition-all duration-300 ease-in-out lg:translate-x-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header with 3D Depth */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200/90 dark:border-slate-800/90 bg-white/90 dark:bg-slate-950/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <img 
              src="/macmobi-icon.png" 
              alt="Macmobi ERP" 
              className="w-10 h-10 rounded-2xl object-contain shadow-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5 transform hover:scale-105 transition-transform" 
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-extrabold text-sm leading-tight text-slate-900 dark:text-white tracking-wide">
                  Macmobi ERP
                </h1>
                <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400 animate-pulse" />
              </div>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold tracking-wide">biznesni boshqarish tizimi</p>
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 border border-slate-200 dark:border-slate-700">
                {user?.role === 'ADMIN' ? 'Super Admin (Barchasi)' :
                 user?.role === 'CFO' ? 'Moliya Kabineti' :
                 user?.role === 'COO' ? 'Operatsion Boshqaruv' :
                 user?.role === 'CALL_CENTER_HEAD' ? 'Koll-markaz Rahbari' :
                 user?.role === 'CALL_CENTER_AGENT' ? 'Koll-markaz Xodimi' :
                 user?.role === 'OPERATOR' ? 'Operator Kabineti' :
                 user?.role === 'STOREKEEPER' ? 'Omborchi Kabineti' :
                 user?.role === 'SELLER' ? 'Sotuvchi Kabineti' :
                 user?.role === 'HR_MANAGER' ? 'HR & Tabel Kabineti' :
                 user?.role === 'VIEWER' ? 'Kuzatuvchi Kabineti' : user?.role || 'Foydalanuvchi'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation list with 3D items */}
        <nav className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1.5 custom-scrollbar">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-[0_4px_16px_rgba(16,185,129,0.3)] border-t border-white/20 transform scale-[1.02]'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white hover:translate-x-1 border border-transparent hover:border-slate-200 dark:hover:border-slate-800'
                  }`
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/50 group-hover:bg-slate-200 dark:group-hover:bg-slate-700/50 text-slate-700 dark:text-slate-300 transition-colors">
                    <Icon className="w-4 h-4 flex-shrink-0" />
                  </div>
                  <div className="truncate leading-tight">
                    <p className="truncate font-bold">{item.label}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-400 font-medium truncate group-hover:text-slate-600 dark:group-hover:text-slate-300">
                      {item.sub}
                    </p>
                  </div>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span className="pill-3d px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-500 text-slate-950 shadow-sm animate-pulse">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Macmobi AI Agent Action */}
        <div className="px-3.5 pb-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent('open-ai-assistant'));
            }}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-300/80 dark:border-indigo-800/80 hover:border-indigo-400 text-left transition-all group active:scale-98 shadow-sm"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/30 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="truncate leading-tight">
                <p className="text-xs font-black text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors truncate flex items-center gap-1">
                  <span>Macmobi AI Agent</span>
                  <Sparkles className="w-3 h-3 text-amber-500 animate-pulse" />
                </p>
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold truncate">
                  Aqlli AI maslahatchi
                </p>
              </div>
            </div>
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 group-hover:rotate-12 transition-transform" />
          </button>
        </div>

        {/* Install Mobile App Banner */}
        <div className="px-3.5 pb-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenInstall?.();
            }}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 dark:from-emerald-950/40 dark:to-cyan-950/40 border border-emerald-300/80 dark:border-emerald-800/80 hover:border-emerald-400 text-left transition-all group active:scale-98 shadow-sm"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30 shrink-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="truncate leading-tight">
                <p className="text-xs font-black text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors truncate">
                  Telefonga O'rnatish
                </p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold truncate">
                  Android APK & iOS ilova
                </p>
              </div>
            </div>
            <Download className="w-4 h-4 text-emerald-500 shrink-0 group-hover:translate-y-0.5 transition-transform" />
          </button>
        </div>

        {/* 3D Footer Card */}
        <div className="p-3.5 border-t border-slate-200/90 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60">
          <div className="p-3 rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] text-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="font-medium text-[11px]">Toshkent vaqti</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
            </div>
            <p className="text-[11px] font-bold text-slate-900 dark:text-white mt-1">Asia/Tashkent (UTC+5)</p>
          </div>
        </div>
      </aside>
    </>
  );
};
