import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { LanguageProvider, useTranslation } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar, ROLE_PERMISSIONS, ROLE_DEFAULT_HOME } from './components/Sidebar';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ExportModal } from './components/ExportModal';
import { InstallAppModal } from './components/InstallAppModal';
import { AIAssistantModal } from './components/AIAssistantModal';

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

// Layout wrapper for authenticated pages
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();

  const getPageTitle = (pathname: string): string => {
    switch (pathname) {
      case '/':
        return t('title.dashboard', 'SWOT Boshqaruv Paneli');
      case '/deals':
        return t('title.deals', 'Bitimlar va Ombor');
      case '/warehouse':
        return t('title.warehouse', 'Ombor (Sklad) Nazorati');
      case '/sales':
        return t('title.sales', 'Sotuvlar va Marja');
      case '/inventory':
        return t('title.warehouse', 'Ombor (Sklad) Nazorati');
      case '/debtors':
        return t('title.debtors', 'Qarzdorlar Ro\'yxati');
      case '/agents':
        return t('title.agents', 'Agentlar komissiyasi');
      case '/agents-swot':
        return t('title.agents_swot', 'Agentliklar SWOT tahlili');
      case '/dds':
        return t('title.dds', 'Pul harakati — DDS');
      case '/balance':
        return t('title.balance', 'Sheriklar Balansi va Depozitlar');
      case '/daily':
        return t('title.daily', 'Kunlik hisob va Kassa tahlili');
      case '/finmodel':
        return t('title.finmodel', '12 oylik Moliyaviy Model va P&L');
      case '/finances':
        return t('title.finances', 'Boshqaruv Balansi va Moliya');
      case '/bot-deals':
        return t('title.bot_deals', 'Telegram Bot Bitimlari');
      case '/bot-payments':
        return t('title.bot_payments', 'Bot To\'lovlari va Cheklar');
      case '/references':
        return t('title.references', 'Spravochniklar va Qoidalar');
      case '/leads':
        return t('title.leads', 'Lidlar va Koll-markaz (CRM)');
      case '/hr':
        return t('title.hr', 'HR, Davomat va Vazifalar');
      case '/users':
        return t('title.users', 'Foydalanuvchilar va Rollar Boshqaruvi');
      case '/handover':
        return t('title.handover', 'Topshirish-qabul, KPI va FOT');
      default:
        return t('title.default', 'Pul va tovar hisobi tizimi');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100 flex transition-colors duration-200">
      {/* Sidebar navigation */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        onOpenInstall={() => setInstallOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-72">
        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenExport={() => setExportOpen(true)}
          onOpenInstall={() => setInstallOpen(true)}
          title={getPageTitle(location.pathname)}
        />

        <main className="flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 w-full max-w-[1920px] mx-auto min-w-0 pb-24 lg:pb-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav onOpenSidebar={() => setSidebarOpen(true)} />

      {/* Export to Excel / Sheets modal */}
      <ExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} />

      {/* Install Mobile App / APK Modal */}
      <InstallAppModal isOpen={installOpen} onClose={() => setInstallOpen(false)} />

      {/* 3D Smart AI ERP Assistant */}
      <AIAssistantModal />
    </div>
  );
};

// Protected route guard with strict role-based access control
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-300">Tizim yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const userRole = user.role || 'OPERATOR';
  const allowed = ROLE_PERMISSIONS[userRole] || ['/deals'];
  const defaultHome = ROLE_DEFAULT_HOME[userRole] || '/';

  // Strict RBAC: If path is not allowed, redirect directly to role's home workspace
  const currentPath = location.pathname;
  const isAllowed = allowed.some((p) => p === currentPath || (p !== '/' && currentPath.startsWith(p)));

  if (!isAllowed) {
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