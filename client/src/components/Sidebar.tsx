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
  Store,
  BookOpen,
  ClipboardList,
  ClipboardPen,
  FileSpreadsheet,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { useRealtime, useSocket } from '../context/SocketContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/cn';
import { BrandMark } from './ui/BrandMark';


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
  REGISTRATURA: '/deals',
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
    '/bot-deals', '/bot-payments', '/finances', '/references', '/users', '/team',
    '/registratura', '/stores', '/qodir-ledger', '/daftar'
  ],
  CFO: [
    '/dds', '/trust', '/stores', '/qodir-ledger', '/daftar', '/balance', '/debtors', '/daily', '/finances', '/finmodel', '/agents', '/references'
  ],
  COO: [
    '/deals', '/warehouse', '/sales', '/leads', '/debtors', '/agents', '/agents-swot', '/daily', '/trust',
    '/stores', '/qodir-ledger', '/daftar'
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
  // Registratura: faqat bitimlar (chek kiritadi, tahrirlay/o'chira olmaydi)
  REGISTRATURA: [
    '/deals'
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
    '/', '/deals', '/finances', '/finmodel', '/agents-swot', '/trust', '/stores', '/qodir-ledger', '/daftar'
  ],
  MANAGER: ['/deals', '/warehouse', '/sales', '/debtors', '/agents', '/daily', '/trust', '/stores', '/qodir-ledger', '/daftar'],
  CASHIER: ['/dds', '/daily', '/balance', '/bot-payments', '/trust', '/stores', '/qodir-ledger', '/daftar']
};

/** Berilgan yo'l rol uchun ochiqmi. `/agents` ruxsati `/agents-swot` ni OCHMAYDI (aniq yoki ichki yo'l). */
export function isPathAllowed(role: string | undefined, pathname: string): boolean {
  const allowed = ROLE_PERMISSIONS[role || 'OPERATOR'] || ROLE_PERMISSIONS.OPERATOR;
  return allowed.some((p) => p === pathname || (p !== '/' && pathname.startsWith(p + '/')));
}

type MenuGroup = 'main' | 'sales' | 'finance' | 'team' | 'settings';

interface MenuItem {
  to: string;
  /** nav.ts dagi kalit: menu.<key> (nom) va menu.<key>_sub (tavsif — faqat title/hover da) */
  key: string;
  icon: LucideIcon;
  group: MenuGroup;
}

// Bo'limlar mazmun bo'yicha: Savdo (mijoz → bitim → tovar → qarz), Moliya (pul va hisobot),
// Jamoa (agentlar, xodimlar), Sozlamalar. Tartib — ish jarayoni ketma-ketligida.
const MENU: MenuItem[] = [
  { to: '/', key: 'dashboard', icon: LayoutDashboard, group: 'main' },

  { to: '/leads', key: 'leads', icon: PhoneCall, group: 'sales' },
  { to: '/deals', key: 'deals', icon: Layers, group: 'sales' },
  { to: '/bot-deals', key: 'bot_deals', icon: Bot, group: 'sales' },
  { to: '/sales', key: 'sales', icon: BadgeDollarSign, group: 'sales' },
  { to: '/warehouse', key: 'warehouse', icon: Warehouse, group: 'sales' },
  { to: '/debtors', key: 'debtors', icon: CreditCard, group: 'sales' },

  { to: '/dds', key: 'dds', icon: ArrowDownUp, group: 'finance' },
  { to: '/trust', key: 'trust', icon: Handshake, group: 'finance' },
  { to: '/stores', key: 'stores', icon: Store, group: 'finance' },
  { to: '/qodir-ledger', key: 'qodir_ledger', icon: BookOpen, group: 'finance' },
  { to: '/daftar', key: 'daftar', icon: ClipboardList, group: 'finance' },
  { to: '/balance', key: 'balance', icon: Wallet, group: 'finance' },
  { to: '/daily', key: 'daily', icon: CalendarCheck, group: 'finance' },
  { to: '/bot-payments', key: 'bot_payments', icon: Receipt, group: 'finance' },
  { to: '/finances', key: 'finances', icon: PieChart, group: 'finance' },
  { to: '/finmodel', key: 'finmodel', icon: Calculator, group: 'finance' },

  { to: '/agents', key: 'agents', icon: Users, group: 'team' },
  { to: '/agents-swot', key: 'agents_swot', icon: TrendingUp, group: 'team' },
  { to: '/team', key: 'team', icon: UsersRound, group: 'team' },
  { to: '/registratura', key: 'registratura', icon: ClipboardPen, group: 'team' },
  { to: '/hr', key: 'hr', icon: UserCheck, group: 'team' },

  { to: '/references', key: 'references', icon: Settings2, group: 'settings' },
  { to: '/users', key: 'users', icon: ShieldCheck, group: 'settings' },
];

const GROUP_ORDER: MenuGroup[] = ['main', 'sales', 'finance', 'team', 'settings'];

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

  // Bo'sh guruhlar ko'rsatilmaydi; bitta-ikkita bandi bor rollarda (operator) sarlavha ham ortiqcha
  const groups = GROUP_ORDER.map((group) => ({ group, items: visibleMenuItems.filter((item) => item.group === group) })).filter(
    (g) => g.items.length > 0
  );
  const showGroupLabels = visibleMenuItems.length > 4;

  // Yordamchi amallar (faqat mobil menyuda — desktopda ular yuqori panelda turadi)
  const utilityButton =
    'flex min-h-touch w-full items-center gap-3 rounded-control px-3 text-left text-sm font-medium text-nav-muted transition-colors hover:bg-white/[0.07] hover:text-white';

  return (
    <>
      {/* Mobil: orqa fon */}
      {isOpen && <div className="fixed inset-0 z-[45] bg-overlay/60 backdrop-blur-[2px] lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={cn(
          'fm-nav no-print fixed bottom-0 left-0 top-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-white/[0.06]',
          'pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-out lg:translate-x-0',
          isOpen ? 'translate-x-0 shadow-pop lg:shadow-none' : '-translate-x-full'
        )}
      >
        {/* Brend */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-9 w-9" />
            <div className="min-w-0">
              <p className="truncate font-display text-[17px] font-bold leading-tight tracking-tight text-white">
                Macmobi <span className="align-middle text-[11px] font-semibold tracking-[0.18em] text-nav-muted">ERP</span>
              </p>
              <p className="truncate text-xs leading-snug text-nav-muted">{t(`roles.${userRole}`, t('roles.unknown'))}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('layout.close_menu')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-nav-muted transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigatsiya — bo'limlarga guruhlangan, bir qatorli bandlar (tavsif faqat title da) */}
        <nav aria-label={t('layout.main_nav')} className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
          {groups.map(({ group, items }, groupIndex) => (
            <div key={group} className={cn(groupIndex > 0 && 'mt-4')}>
              {showGroupLabels && group !== 'main' && (
                <p className="mb-1 px-3 text-xs font-semibold text-nav-muted/70">{t(`menu.group.${group}`)}</p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isPendingBadge = item.to === '/deals' && isAdmin;
                  const badge = item.to === '/bot-payments' ? notifications.length : isPendingBadge ? pendingDeals : 0;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        onClick={() => onClose()}
                        title={t(`menu.${item.key}_sub`)}
                        className={({ isActive }) =>
                          cn(
                            'group flex min-h-touch items-center gap-3 rounded-control px-3 text-sm transition-colors lg:min-h-[2.375rem]',
                            isActive
                              ? 'bg-brand font-semibold text-white shadow-[0_8px_20px_-8px_rgb(var(--brand)/0.9)]'
                              : 'font-medium text-nav-muted hover:bg-white/[0.07] hover:text-white'
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              className={cn('h-[18px] w-[18px] shrink-0', !isActive && 'opacity-80 group-hover:opacity-100')}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate">{t(`menu.${item.key}`)}</span>
                            {badge > 0 ? (
                              <span
                                aria-label={t(isPendingBadge ? 'notifications.pending_badge' : 'layout.new_notifications', { count: badge })}
                                title={isPendingBadge ? t('notifications.pending_badge', { count: badge }) : undefined}
                                className={cn(
                                  'min-w-[1.375rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums leading-tight',
                                  isPendingBadge ? 'bg-spark text-nav' : 'bg-danger-solid text-white'
                                )}
                              >
                                {badge}
                              </span>
                            ) : (
                              // Logotipdagi to'q sariq nuqta — faol band belgisi
                              isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-spark" aria-hidden="true" />
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Yordamchi amallar — faqat mobil menyuda (desktopda yuqori panelda bor) */}
        <div className="shrink-0 space-y-0.5 border-t border-white/10 px-3 py-2 lg:hidden">
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
            title={t('layout.ai_agent_sub')}
            className={cn(utilityButton, 'md:hidden')}
          >
            <Bot className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="truncate">{t('layout.ai_agent')}</span>
          </button>
          {onOpenNotifications && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNotifications();
              }}
              title={t('notifications.menu_sub')}
              className={cn(utilityButton, 'md:hidden')}
            >
              <Bell className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="truncate">{t('notifications.menu')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenInstall?.();
            }}
            title={t('layout.install_app_sub')}
            className={utilityButton}
          >
            <Smartphone className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="truncate">{t('layout.install_app')}</span>
          </button>
        </div>

        {/* Vaqt zonasi (til va mavzu almashtirgichlari yuqori panelda) */}
        <p className="shrink-0 border-t border-white/10 px-6 py-3 text-xs text-nav-muted/80">
          {t('layout.tashkent_time')}: UTC+5
        </p>
      </aside>
    </>
  );
};
