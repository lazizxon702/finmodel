import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  CreditCard,
  Search,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Phone,
  DollarSign,
  Clock,
  History,
  X,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { formatMoney, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { AmountInput } from '../components/AmountInput';

export const DebtorsPage: React.FC = () => {
  const { t } = useTranslation();

  const [debtors, setDebtors] = useState<any[]>([]);
  const [totalDebtSum, setTotalDebtSum] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [overdueFilter, setOverdueFilter] = useState<'ALL' | 'OVERDUE'>('ALL');

  // Repayment Modal
  const [selectedDebtor, setSelectedDebtor] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [accountType, setAccountType] = useState<'CASH' | 'BANK_CARD' | 'SETTLEMENT_ACCOUNT'>('CASH');
  const [paidBy, setPaidBy] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccessMsg, setPaySuccessMsg] = useState('');

  // History modal
  const [historyDebtor, setHistoryDebtor] = useState<any | null>(null);

  useEffect(() => {
    fetchDebtors();
  }, [search]);

  const fetchDebtors = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/debtors?search=${encodeURIComponent(search)}`);
      setDebtors(res.data.items || []);
      setTotalDebtSum(res.data.totalDebtSum || 0);
    } catch (err) {
      console.error('Fetch debtors error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPay = (debtor: any) => {
    setSelectedDebtor(debtor);
    setPayAmount(debtor.debtRemainder);
    setPaidBy(debtor.customerName);
    setAccountType('CASH');
    setPayNote('');
    setPayError('');
    setPaySuccessMsg('');
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtor) return;
    if (payAmount <= 0) {
      setPayError('To\'lov summasi 0 dan katta bo\'lishi shart');
      return;
    }

    try {
      setPaying(true);
      setPayError('');
      const res = await axios.post(`/api/debtors/${selectedDebtor.id}/payment`, {
        amount: payAmount,
        accountType,
        paidBy,
        note: payNote,
      });

      setPaySuccessMsg(res.data.message);
      setTimeout(() => {
        setSelectedDebtor(null);
        fetchDebtors();
      }, 1200);
    } catch (err: any) {
      setPayError(err.response?.data?.error || err.message);
    } finally {
      setPaying(false);
    }
  };

  const filtered = debtors.filter((d) => {
    if (overdueFilter === 'OVERDUE') return d.isOverdue;
    return true;
  });

  const overdueCount = debtors.filter((d) => d.isOverdue).length;

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-rose-500 dark:text-rose-400" />
            <span>{t('menu.debtors', 'Qarzdorlar Ro\'yxati')}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Mijozlarning qarz qoldiqlari, to'lov muddatlari, qarzni kamaytirish va kassaga qabul qilish
          </p>
        </div>
      </div>

      {/* 3D KPI Metrics Cards (Sonomed Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Debt */}
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/90 p-5 rounded-3xl relative overflow-hidden shadow-sm dark:shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Jami Qoldiq Qarz
            </span>
            <div className="w-9 h-9 rounded-2xl bg-rose-500/20 text-rose-500 dark:text-rose-400 flex items-center justify-center border border-rose-500/30">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
            {formatMoney(totalDebtSum)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Kompaniyaga qaytarilishi kerak
          </div>
        </div>

        {/* Debtors Count */}
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/90 p-5 rounded-3xl relative overflow-hidden shadow-sm dark:shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Faol Qarzdorlar
            </span>
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {debtors.length} ta
          </div>
          <div className="mt-1 text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold">
            To'lov kutayotgan cheklar
          </div>
        </div>

        {/* Overdue */}
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/90 p-5 rounded-3xl relative overflow-hidden shadow-sm dark:shadow-xl">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Muddati O'tgan
            </span>
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-500 dark:text-amber-400 flex items-center justify-center border border-amber-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-amber-500 dark:text-amber-400 tracking-tight">
            {overdueCount} ta
          </div>
          <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400/90 font-medium">
            Shoshilinch undiruv talab qilinadi
          </div>
        </div>

        {/* Security Rule Card */}
        <div className="card-3d bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/80 dark:to-slate-900/90 border border-indigo-200 dark:border-indigo-800/60 p-5 rounded-3xl relative overflow-hidden shadow-sm dark:shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
              Qarz Blokirovkasi
            </span>
            <Sparkles className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          </div>
          <div className="mt-2 text-xs font-bold text-slate-900 dark:text-white leading-relaxed">
            Qarzdorlarga tovar chiqarish taqiqlangan!
          </div>
          <div className="mt-1 text-[11px] text-slate-600 dark:text-indigo-200">
            Faqat administrator kodi orqali ruxsat etiladi.
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm dark:shadow-lg">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Mijoz ismi, telefon, tovar yoki chek raqami bo'yicha qidiruv..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-inner"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setOverdueFilter('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
              overdueFilter === 'ALL'
                ? 'bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 shadow-md shadow-cyan-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700'
            }`}
          >
            Barchasi ({debtors.length})
          </button>
          <button
            type="button"
            onClick={() => setOverdueFilter('OVERDUE')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              overdueFilter === 'OVERDUE'
                ? 'bg-rose-600 dark:bg-rose-500 text-white shadow-md shadow-rose-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Muddati o'tganlar ({overdueCount})</span>
          </button>
        </div>
      </div>

      {/* 3D Table */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm dark:shadow-xl overflow-hidden flex flex-col">
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-rose-600 dark:text-rose-400">{filtered.length} ta qarzdor</span>
        </div>
        <div className="table-scroll-container custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="table-sticky-head bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 shadow-sm">
              <tr>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Chek №</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Sana</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Mijoz / Telefon</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Do'kon</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Tovar</th>
                <th className="px-4 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Sotuv narxi</th>
                <th className="px-4 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">To'langan</th>
                <th className="px-4 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Qoldiq Qarz</th>
                <th className="px-4 py-3.5 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">To'lov muddati</th>
                <th className="px-4 py-3.5 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Holat</th>
                <th className="px-4 py-3.5 text-center sticky right-0 top-0 bg-slate-100 dark:bg-slate-950 z-30 shadow-md whitespace-nowrap">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                    Qarzdorlik ma'lumotlari yuklanmoqda...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400">
                    Hech qanday qarzdorlik topilmadi
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-mono font-bold text-cyan-600 dark:text-cyan-400">
                      №{d.dealNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(d.date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white text-xs">{d.customerName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{d.customerPhone}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                      {d.storeName}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{d.productName}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{d.imeiBarcode}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">
                      {formatMoney(d.salePrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(d.receivedFromBuyer)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-rose-600 dark:text-rose-400 text-sm">
                      {formatMoney(d.debtRemainder)}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {d.debtDueDate ? (
                        <div className="inline-flex flex-col items-center">
                          <span className={`text-[11px] font-semibold ${
                            d.isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-700 dark:text-slate-300'
                          }`}>
                            {formatDate(d.debtDueDate)}
                          </span>
                          {d.isOverdue && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 mt-0.5 animate-pulse">
                              Muddati o'tgan!
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className={`pill-3d inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                        d.receivedFromBuyer > 0
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                      }`}>
                        {d.receivedFromBuyer > 0 ? 'Qisman to\'langan' : 'To\'lanmagan'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap sticky right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 shadow-sm">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenPay(d)}
                          className="btn-3d py-1.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:translate-y-[1px] transition"
                          title="Qarzni to'lash yoki kamaytirish"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          <span>Qarzni yopish / Kamaytirish</span>
                        </button>
                        {d.payments && d.payments.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setHistoryDebtor(d)}
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="To'lovlar tarixi"
                          >
                            <History className="w-4 h-4 text-cyan-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Repayment Modal */}
      {selectedDebtor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full sm:max-w-md bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-xs text-slate-200 overflow-y-auto max-h-[92vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Qarzni to'lash / Kamaytirish</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Chek №{selectedDebtor.dealNumber} - {selectedDebtor.customerName}
                </p>
              </div>
              <button
                onClick={() => setSelectedDebtor(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Debt Highlight */}
            <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block font-medium">Hozirgi qarz:</span>
                <span className="text-lg font-black text-rose-400">
                  {formatMoney(selectedDebtor.debtRemainder)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block font-medium">To'lovdan keyin:</span>
                <span className="text-lg font-black text-emerald-400">
                  {formatMoney(Math.max(0, selectedDebtor.debtRemainder - (Number(payAmount) || 0)))}
                </span>
              </div>
            </div>

            {payError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
                {payError}
              </div>
            )}

            {paySuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{paySuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handlePaySubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  To'lanayotgan summa (UZS) *
                </label>
                <AmountInput
                  required
                  placeholder="Summani kiriting..."
                  value={payAmount}
                  onChange={(val) => setPayAmount(val)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-bold text-emerald-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setPayAmount(selectedDebtor.debtRemainder)}
                    className="px-2 py-0.5 rounded-lg text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
                  >
                    To'liq yopish (100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(Math.round(selectedDebtor.debtRemainder / 2))}
                    className="px-2 py-0.5 rounded-lg text-[10px] bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700"
                  >
                    Yarmini to'lash (50%)
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Qaysi kassaga tushsin (To'lov usuli) *
                </label>
                <select
                  value={accountType}
                  onChange={(e: any) => setAccountType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                >
                  <option value="CASH">Naqd kassa (Cash)</option>
                  <option value="BANK_CARD">Bank kartasi (Humo / Uzcard)</option>
                  <option value="SETTLEMENT_ACCOUNT">Hisob-raqam (Raschyotniy schet)</option>
                </select>
                <p className="text-[10px] text-cyan-400/80 mt-1">
                  ✓ Ushbu summa avtomatik ravishda DDS Kassa kirimiga yoziladi.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Kim to'ladi (FISH)</label>
                <input
                  type="text"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  placeholder="Mijoz ismi..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Izoh (Sabab)</label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="Qarz to'lovi haqida izoh..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDebtor(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:translate-y-[1px] disabled:opacity-50"
                >
                  {paying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>To'lovni qabul qilish & Kassaga kiritish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {historyDebtor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full sm:max-w-lg bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-xs text-slate-200 overflow-y-auto max-h-[92vh]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <History className="w-4 h-4 text-cyan-400" />
                  <span>To'lovlar tarixi</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Chek №{historyDebtor.dealNumber} - {historyDebtor.customerName}
                </p>
              </div>
              <button
                onClick={() => setHistoryDebtor(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {historyDebtor.payments && historyDebtor.payments.length > 0 ? (
                historyDebtor.payments.map((p: any) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-emerald-400 block text-sm">
                        +{formatMoney(p.amount)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {p.accountType} • {p.paidBy || 'Mijoz'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-slate-300 block">{formatDate(p.date)}</span>
                      <span className="text-[10px] text-slate-500">{p.note || '-'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-slate-500">Hech qanday to'lov tarixi mavjud emas</div>
              )}
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setHistoryDebtor(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default DebtorsPage;
