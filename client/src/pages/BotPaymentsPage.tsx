import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { 
  CreditCard, FileSpreadsheet, Plus, CheckCircle, Search, RefreshCw, 
  TrendingUp, DollarSign, UserCheck, ShieldCheck, AlertCircle, Calendar, Trash2
} from 'lucide-react';
import { formatMoney, formatDateTime, formatDate, formatPercent } from '../utils/format';
import { AmountInput } from '../components/AmountInput';

interface BotPayment {
  id: string;
  botDealId: string | null;
  receiptNumber: string | null;
  dateTime: string;
  operatorId: string;
  stage: string | null;
  paymentType: string;
  currencyAmount: number;
  exchangeRate: number;
  amountUzs: number;
  isVerified: boolean;
  botDeal?: any;
}

interface OperatorReport {
  id: string;
  agentName: string;
  date: string;
  operatorName: string;
  appName: string;
  calculatedPct: number;
  productName: string;
  actualPrice: number;
  purchasePrice: number;
  paidAmount: number;
  profit: number;
  storeName: string | null;
  checkNumber: string | null;
  responsible: string | null;
}

export const BotPaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'OPERATOR_REPORTS'>('PAYMENTS');
  
  // Tab 1 state
  const [payments, setPayments] = useState<BotPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [searchPayments, setSearchPayments] = useState('');

  // Tab 2 state
  const [reports, setReports] = useState<OperatorReport[]>([]);
  const [reportTotals, setReportTotals] = useState({ totalActual: 0, totalPurchase: 0, totalPaid: 0, totalProfit: 0 });
  const [loadingReports, setLoadingReports] = useState(true);
  const [searchReports, setSearchReports] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    agentName: 'Asadbek',
    date: new Date().toISOString().split('T')[0],
    operatorName: '',
    appName: 'Imanum',
    calculatedPct: 0.22,
    productName: '',
    actualPrice: '',
    storeName: 'Denov',
    checkNumber: '',
    responsible: 'Laziz',
  });

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const fetchPayments = async () => {
    try {
      setLoadingPayments(true);
      const res = await axios.get('/api/bot/payments');
      setPayments(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const fetchReports = async () => {
    try {
      setLoadingReports(true);
      const res = await axios.get('/api/bot/operator-reports');
      setReports(res.data.reports || []);
      setReportTotals(res.data.totals || { totalActual: 0, totalPurchase: 0, totalPaid: 0, totalProfit: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchReports();
  }, []);

  const handleVerifyPayment = async (id: string, current: boolean) => {
    try {
      await axios.post(`/api/bot/payments/${id}/verify`, { isVerified: !current });
      setPayments(payments.map(p => p.id === id ? { ...p, isVerified: !current } : p));
    } catch (err) {
      console.error(err);
      alert('Tasdiqlashda xatolik yuz berdi');
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await axios.post('/api/bot/operator-reports', formData);
      setShowAddModal(false);
      setStatusMsg('Chek hisoboti muvaffaqiyatli saqlandi');
      fetchReports();
      setTimeout(() => setStatusMsg(''), 4000);
      setFormData({
        agentName: 'Asadbek',
        date: new Date().toISOString().split('T')[0],
        operatorName: '',
        appName: 'Imanum',
        calculatedPct: 0.22,
        productName: '',
        actualPrice: '',
        storeName: 'Denov',
        checkNumber: '',
        responsible: 'Laziz',
      });
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Saqlashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!window.confirm("Haqiqatdan ham bu chek hisobotini o'chirmoqchimisiz?")) return;
    try {
      await axios.delete(`/api/bot/operator-reports/${id}`);
      fetchReports();
    } catch (err: any) {
      alert("O'chirishda xatolik: " + (err.response?.data?.error || err.message));
    }
  };

  const handleClearAllReports = async () => {
    const conf = window.prompt("Barcha chek hisobotlarini tozalash uchun administrator kodini kiriting:");
    if (!conf) return;
    try {
      // Kod serverda tekshiriladi; faqat ADMIN roli bajara oladi
      await axios.delete('/api/bot/operator-reports/all', { data: { confirmCode: conf } });
      fetchReports();
      alert("Barcha chek hisobotlari o'chirildi!");
    } catch (err: any) {
      alert("Tozalashda xatolik: " + (err.response?.data?.error || err.message));
    }
  };

  const filteredPayments = payments.filter(p => {
    const s = searchPayments.toLowerCase();
    return (
      (p.receiptNumber && p.receiptNumber.toLowerCase().includes(s)) ||
      (p.operatorId && p.operatorId.toLowerCase().includes(s)) ||
      (p.paymentType && p.paymentType.toLowerCase().includes(s)) ||
      (p.stage && p.stage.toLowerCase().includes(s))
    );
  });

  const filteredReports = reports.filter(r => {
    const s = searchReports.toLowerCase();
    return (
      r.operatorName.toLowerCase().includes(s) ||
      r.agentName.toLowerCase().includes(s) ||
      r.appName.toLowerCase().includes(s) ||
      r.productName.toLowerCase().includes(s) ||
      (r.checkNumber && r.checkNumber.toLowerCase().includes(s)) ||
      (r.storeName && r.storeName.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-7 h-7 text-indigo-600" />
            Bot To'lovlari va Operatorlar (Платежи_Бота & БОТ ТР)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Telegram to'lov cheklari nazorati, operatorlar bo'yicha hisob-kitoblar va foyda taqsimoti
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'OPERATOR_REPORTS' && (
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
              <button
                type="button"
                onClick={handleClearAllReports}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-bold shadow-sm transition"
                title="Barcha chek hisobotlarini tozalash"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Cheklarni tozalash
              </button>
              )}
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                Yangi chek qo'shish
              </button>
            </div>
          )}
          <button
            onClick={() => { fetchPayments(); fetchReports(); }}
            className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 bg-white shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          {statusMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto no-scrollbar">
        <nav className="flex space-x-4 sm:space-x-8 min-w-max">
          <button
            onClick={() => setActiveTab('PAYMENTS')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition ${
              activeTab === 'PAYMENTS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Bot to'lovlari (Платежи_Бота)
            <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-indigo-100 text-indigo-800">
              {payments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('OPERATOR_REPORTS')}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition ${
              activeTab === 'OPERATOR_REPORTS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Operatorlar hisoboti (БОТ ТР)
            <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-emerald-100 text-emerald-800">
              {reports.length}
            </span>
          </button>
        </nav>
      </div>

      {/* TAB 1: Bot to'lovlari (Платежи_Бота) */}
      {activeTab === 'PAYMENTS' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Chek raqami, operator, to'lov turi yoki bosqich bo'yicha qidirish..."
                value={searchPayments}
                onChange={(e) => setSearchPayments(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3">Sana / Vaqt</th>
                    <th className="py-3 px-3">Chek Raqami</th>
                    <th className="py-3 px-3">Operator ID</th>
                    <th className="py-3 px-3">Bosqich</th>
                    <th className="py-3 px-3">To'lov Turi</th>
                    <th className="py-3 px-3 text-right">Valyuta Summasi</th>
                    <th className="py-3 px-3 text-right">Kurs</th>
                    <th className="py-3 px-3 text-right">UZS Summasi</th>
                    <th className="py-3 px-3 text-center">Tasdiqlash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingPayments ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        To'lovlar yuklanmoqda...
                      </td>
                    </tr>
                  ) : filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-400">
                        To'lov yozuvlari topilmadi
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-indigo-50/20 transition">
                        <td className="py-3 px-3 font-medium text-gray-700 whitespace-nowrap">
                          {formatDateTime(p.dateTime)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-semibold text-gray-900">
                          {p.receiptNumber || '-'}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-gray-600">
                          {p.operatorId}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-800">
                            {p.stage || 'Asosiy'}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-medium text-gray-800">
                          {p.paymentType}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right font-medium text-gray-700">
                          {Number(p.currencyAmount).toLocaleString('ru-RU')}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right text-gray-500">
                          {Number(p.exchangeRate).toLocaleString('ru-RU')}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right font-bold text-indigo-600">
                          {formatMoney(p.amountUzs)}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleVerifyPayment(p.id, p.isVerified)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                              p.isVerified
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {p.isVerified ? 'Tasdiqlangan' : 'Tasdiqlanmagan'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Operatorlar hisoboti (БОТ ТР) */}
      {activeTab === 'OPERATOR_REPORTS' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Haqiqiy tovar narxi</span>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatMoney(reportTotals.totalActual)}</p>
              <span className="text-xs text-gray-400">Jami cheklar bo'yicha</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm bg-gradient-to-br from-white to-blue-50">
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Bizning xarid narxi</span>
              <p className="text-xl font-bold text-blue-900 mt-1">{formatMoney(reportTotals.totalPurchase)}</p>
              <span className="text-xs text-blue-600">Chegirma qo'llangandan keyin</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm bg-gradient-to-br from-white to-amber-50">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">To'langan summa</span>
              <p className="text-xl font-bold text-amber-900 mt-1">{formatMoney(reportTotals.totalPaid)}</p>
              <span className="text-xs text-amber-600">Mijozga to'langan ulush</span>
            </div>
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm bg-gradient-to-br from-white to-emerald-50">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Sof Foyda</span>
              <p className="text-xl font-bold text-emerald-800 mt-1">{formatMoney(reportTotals.totalProfit)}</p>
              <span className="text-xs text-emerald-600 font-medium">Xarid narxi - To'langan</span>
            </div>
          </div>

          {/* Search */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Operator, agent, ilova, tovar, do'kon yoki chek raqami bo'yicha qidiruv..."
                value={searchReports}
                onChange={(e) => setSearchReports(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3">Sana</th>
                    <th className="py-3 px-3">Chek №</th>
                    <th className="py-3 px-3">Operator</th>
                    <th className="py-3 px-3">Agent</th>
                    <th className="py-3 px-3">Ilova / Bank</th>
                    <th className="py-3 px-3 text-right">Hisoblangan %</th>
                    <th className="py-3 px-3">Tovar nomi</th>
                    <th className="py-3 px-3 text-right">Haqiqiy Narx</th>
                    <th className="py-3 px-3 text-right">Xarid Narxi</th>
                    <th className="py-3 px-3 text-right">To'langan Summa</th>
                    <th className="py-3 px-3 text-right font-bold text-emerald-700">Foyda</th>
                    <th className="py-3 px-3">Do'kon</th>
                    <th className="py-3 px-3 text-center">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingReports ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-gray-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Hisobotlar yuklanmoqda...
                      </td>
                    </tr>
                  ) : filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-gray-400">
                        Hisobot qatorlari topilmadi (Cheklar 0)
                      </td>
                    </tr>
                  ) : (
                    filteredReports.map((r) => (
                      <tr key={r.id} className="hover:bg-indigo-50/20 transition">
                        <td className="py-3 px-3 whitespace-nowrap text-gray-700 font-medium">
                          {formatDate(r.date)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-semibold text-gray-900">
                          {r.checkNumber || '-'}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-medium text-gray-800">
                          {r.operatorName}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-gray-600">
                          {r.agentName}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {r.appName}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right font-semibold text-indigo-600">
                          {formatPercent(r.calculatedPct)}
                        </td>
                        <td className="py-3 px-3 font-medium text-gray-800">
                          {r.productName}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right text-gray-700">
                          {formatMoney(r.actualPrice)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right text-gray-700 font-medium">
                          {formatMoney(r.purchasePrice)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right text-amber-700 font-medium">
                          {formatMoney(r.paidAmount)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-right font-bold text-emerald-700">
                          {formatMoney(r.profit)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-gray-600">
                          {r.storeName || '-'}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteReport(r.id)}
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition"
                            title="Chekni o'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Operator Report Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl overflow-y-auto max-h-[92vh]">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800 shrink-0">
              <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Yangi Operator Cheki Qo'shish
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateReport} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sana</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Chek raqami</label>
                  <input
                    type="text"
                    placeholder="Masalan: 124589"
                    value={formData.checkNumber}
                    onChange={(e) => setFormData({ ...formData, checkNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Operator F.I.O.</label>
                  <input
                    type="text"
                    required
                    placeholder="Masalan: Boburjon"
                    value={formData.operatorName}
                    onChange={(e) => setFormData({ ...formData, operatorName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Agent ismi</label>
                  <input
                    type="text"
                    required
                    value={formData.agentName}
                    onChange={(e) => setFormData({ ...formData, agentName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ilova / Provayder</label>
                  <select
                    value={formData.appName}
                    onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="Imanum">Imanum</option>
                    <option value="Variant">Variant</option>
                    <option value="Alif 6 oylik">Alif 6 oylik</option>
                    <option value="Alif online">Alif online</option>
                    <option value="Uzum Nasiya">Uzum Nasiya</option>
                    <option value="Payme Nasiya">Payme Nasiya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Hisoblangan stavka %</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.calculatedPct}
                    onChange={(e) => setFormData({ ...formData, calculatedPct: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tovar nomi</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: iPhone 15 Pro 128GB"
                  value={formData.productName}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">Haqiqiy narx (UZS)</label>
                  <AmountInput
                    required
                    placeholder="12 500 000"
                    value={formData.actualPrice}
                    onChange={(val) => setFormData({ ...formData, actualPrice: String(val || '') })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Do'kon / Hamkor</label>
                  <input
                    type="text"
                    value={formData.storeName}
                    onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {formData.actualPrice && (
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bizning xarid narxi:</span>
                    <span className="font-semibold text-gray-900">
                      {formatMoney(Number(formData.actualPrice) * (1 - formData.calculatedPct))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">To'langan (70%):</span>
                    <span className="font-semibold text-amber-700">
                      {formatMoney(Number(formData.actualPrice) * 0.70)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-indigo-200 pt-1">
                    <span className="font-semibold text-indigo-900">Kutilayotgan sof foyda:</span>
                    <span className="font-bold text-emerald-700">
                      {formatMoney(
                        Number(formData.actualPrice) * (1 - formData.calculatedPct) - Number(formData.actualPrice) * 0.70
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default BotPaymentsPage;