import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { LanguageProvider, useTranslation } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar, ROLE_DEFAULT_HOME, isPathAllowed } from './components/Sidebar';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ExportModal } from './components/ExportModal';
import { InstallAppModal } from './components/InstallAppModal';
import { AIAssistantModal } from './components/AIAssistantModal';
import { NotificationSettings } from './components/NotificationSettings';
import { onPushNavigate } from './services/push';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { DealsPage } from './pages/DealsPage';
import { WarehousePage } from './pages/WarehousePage';
import { SalesPage } from './pages/SalesPage';
import { DebtorsPage } from './pages/DebtorsPage';
import { AgentsPage } from './pages/AgentsPage';
import { AgentSwotPage } from './pages/AgentSwotPage';
import { DdsPage } from './pages/DdsPage';
import { BalancePage } from './pages/BalancePage';
import { DailyAccountingPage } from './pages/DailyAccountingPage';
import { FinModelPage } from './pages/FinModelPage';
import { FinancesSummaryPage } from './pages/FinancesSummaryPage';
import { BotDealsPage } from './pages/BotDealsPage';
import { BotPaymentsPage } from './pages/BotPaymentsPage';
import { ReferencesPage } from './pages/ReferencesPage';
import { LeadsPage } from './pages/LeadsPage';
import { HrManagementPage } from './pages/HrManagementPage';
import { UsersPage } from './pages/UsersPage';
import { LoginPage } from './pages/LoginPage';
import { TrustPage } from './pages/TrustPage';
import { TeamPage } from './pages/TeamPage';
import { StoresPage } from './pages/StoresPage';
import { DaftarPage } from './pages/DaftarPage';
import { StoreDetailPage } from './pages/StoreDetailPage';
import { LoadingBlock } from './components/ui';

// Layout wrapper for authenticated pages
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Push bildirishnoma bosilganda tegishli sahifaga o'tish (faqat native ilovada ishlaydi)
  useEffect(() => {
    onPushNavigate((path) => navigate(path));
    return () => onPushNavigate(null);
  }, [navigate]);

  // Marshrut → sarlavha kaliti (i18n/modules/nav.ts dagi title.*)
  const TITLE_KEYS: Record<string, string> = {
    '/': 'title.dashboard',
    '/deals': 'title.deals',
    '/warehouse': 'title.warehouse',
    '/sales': 'title.sales',
    '/inventory': 'title.warehouse',
    '/debtors': 'title.debtors',
    '/agents': 'title.agents',
    '/agents-swot': 'title.agents_swot',
    '/dds': 'title.dds',
    '/trust': 'title.trust',
    '/stores': 'title.stores',
    '/qodir-ledger': 'title.qodir_ledger',
    '/daftar': 'title.daftar',
    '/team': 'title.team',
    '/balance': 'title.balance',
    '/daily': 'title.daily',
    '/finmodel': 'title.finmodel',
    '/finances': 'title.finances',
    '/bot-deals': 'title.bot_deals',
    '/bot-payments': 'title.bot_payments',
    '/references': 'title.references',
    '/leads': 'title.leads',
    '/hr': 'title.hr',
    '/users': 'title.users',
    '/handover': 'title.handover',
  };
  // Ichki yo'llar (masalan /stores/:storeId) uchun alohida sarlavha; bo'lmasa eng uzun mos ota yo'lniki olinadi
  const PREFIX_TITLE_KEYS: Record<string, string> = {
    '/stores': 'title.store_detail',
  };
  const getPageTitle = (pathname: string): string => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    if (TITLE_KEYS[path]) return t(TITLE_KEYS[path]);
    const parent = Object.keys({ ...TITLE_KEYS, ...PREFIX_TITLE_KEYS })
      .filter((p) => p !== '/' && path.startsWith(p + '/'))
      .sort((a, b) => b.length - a.length)[0];
    return t((parent && (PREFIX_TITLE_KEYS[parent] || TITLE_KEYS[parent])) || 'title.default');
  };

  return (
    <div className="flex min-h-screen bg-app text-fg">
      {/* Sidebar navigation */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        onOpenInstall={() => setInstallOpen(true)}
        onOpenExport={() => setExportOpen(true)}
        onOpenNotifications={() => setNotificationsOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenExport={() => setExportOpen(true)}
          onOpenInstall={() => setInstallOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          title={getPageTitle(location.pathname)}
        />

        <main className="mx-auto w-full min-w-0 max-w-[1920px] flex-1 px-3 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav onOpenSidebar={() => setSidebarOpen(true)} />

      {/* Export to Excel / Sheets modal */}
      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />

      {/* Install Mobile App / APK Modal */}
      <InstallAppModal isOpen={installOpen} onClose={() => setInstallOpen(false)} />

      {/* Bildirishnoma sozlamalari (Telegram, push) */}
      <NotificationSettings open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />

      {/* 3D Smart AI ERP Assistant */}
      <AIAssistantModal />
    </div>
  );
};

// Protected route guard with strict role-based access control
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <LoadingBlock label={t('common.system_loading')} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const userRole = user.role || 'OPERATOR';
  const defaultHome = ROLE_DEFAULT_HOME[userRole] || '/';

  // Qat'iy RBAC: ruxsat etilmagan yo'l — rolning bosh sahifasiga qaytariladi
  if (!isPathAllowed(userRole, location.pathname)) {
    return <Navigate to={defaultHome} replace />;
  }

  return <AppLayout>{children}</AppLayout>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <SocketProvider>
              <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/deals" element={<ProtectedRoute><DealsPage /></ProtectedRoute>} />
                <Route path="/warehouse" element={<ProtectedRoute><WarehousePage /></ProtectedRoute>} />
                <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
                <Route path="/inventory" element={<Navigate to="/warehouse" replace />} />
                <Route path="/debtors" element={<ProtectedRoute><DebtorsPage /></ProtectedRoute>} />
                <Route path="/agents" element={<ProtectedRoute><AgentsPage /></ProtectedRoute>} />
                <Route path="/agents-swot" element={<ProtectedRoute><AgentSwotPage /></ProtectedRoute>} />
                <Route path="/dds" element={<ProtectedRoute><DdsPage /></ProtectedRoute>} />
                <Route path="/trust" element={<ProtectedRoute><TrustPage /></ProtectedRoute>} />
                <Route path="/stores" element={<ProtectedRoute><StoresPage /></ProtectedRoute>} />
                <Route path="/stores/:storeId" element={<ProtectedRoute><StoreDetailPage /></ProtectedRoute>} />
                <Route path="/qodir-ledger" element={<ProtectedRoute><StoreDetailPage qodir /></ProtectedRoute>} />
                <Route path="/daftar" element={<ProtectedRoute><DaftarPage /></ProtectedRoute>} />
                <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
                <Route path="/balance" element={<ProtectedRoute><BalancePage /></ProtectedRoute>} />
                <Route path="/daily" element={<ProtectedRoute><DailyAccountingPage /></ProtectedRoute>} />
                <Route path="/finmodel" element={<ProtectedRoute><FinModelPage /></ProtectedRoute>} />
                <Route path="/finances" element={<ProtectedRoute><FinancesSummaryPage /></ProtectedRoute>} />
                <Route path="/bot-deals" element={<ProtectedRoute><BotDealsPage /></ProtectedRoute>} />
                <Route path="/bot-payments" element={<ProtectedRoute><BotPaymentsPage /></ProtectedRoute>} />
                <Route path="/references" element={<ProtectedRoute><ReferencesPage /></ProtectedRoute>} />
                <Route path="/leads" element={<ProtectedRoute><LeadsPage /></ProtectedRoute>} />
                <Route path="/hr" element={<ProtectedRoute><HrManagementPage /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
                <Route path="/handover" element={<Navigate to="/" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </SocketProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};
export default App;