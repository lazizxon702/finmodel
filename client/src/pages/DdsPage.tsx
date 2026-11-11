import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  ArrowDownUp,
  Plus,
  Search,
  Wallet,
  CreditCard,
  Building,
  TrendingUp,
  TrendingDown,
  PieChart,
  RefreshCw,
  X,
  Layers,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Trash2
} from 'lucide-react';
import { DdsTransaction } from '../types';
import { formatMoney, formatPercent, formatDateTime } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { AmountInput } from '../components/AmountInput';

export const DdsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<DdsTransaction[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false);

  // Category state
  const [categories, setCategories] = useState<string[]>([
    'Mijozga berilgan summa (Tovar xaridi)',
    'Tovar xaridi (mijozlardan)',
    'Agent va hamkor komissiyasi',
    'UZIMEI ro\'yxatdan o\'tkazish',
    'Logistika va yetkazib berish',
    'Marketing va reklama',
    'Ish haqi (FOT)',
    'Ofis ijara va kommunal xizmatlar',
    'Aloqa va internet',
    'Ulgurji savdo tushumi',
    'Daftar tushumi',
    'Инвестиция Хасан',
    'Выкуп техники (клиенты)',
    'Выручка от оптовиков',
    'Boshqa xarajat',
  ]);
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncingDds, setSyncingDds] = useState(false);
  const [form, setForm] = useState({
    dateTime: new Date().toISOString().slice(0, 10),
    type: 'EXPENSE',
    account: 'CASH',
    expenseType: 'COGS',
    categoryName: 'Mijozga berilgan summa (Tovar xaridi)',
    sourcePerson: 'Hasan',
    amount: 0,
    description: '',
  });

  const handleSyncDdsFromSheets = async () => {
    try {
      setSyncingDds(true);
      const res = await axios.post('/api/sync/dds');
      alert(
        `Google Sheets 'Транзакции_ДДС' jadvalidan ${res.data.importedCount} ta operatsiya muvaffaqiyatli yuklandi!\n\n` +
          `• Kirim (Приход): ${formatMoney(res.data.totalIncome)}\n` +
          `• Chiqim (Расход): ${formatMoney(res.data.totalExpense)}\n` +
          `• Qoldiq (Saldo): ${formatMoney(res.data.netCashflow)}`
      );
      fetchDdsData();
      fetchCategories();
    } catch (err: any) {
      alert("Sinxronizatsiyada xatolik: " + (err.response?.data?.error || err.message));
    } finally {
      setSyncingDds(false);
    }
  };

  useEffect(() => {
    fetchDdsData();
    fetchCategories();
  }, [typeFilter, accountFilter, search]);

  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/dds/categories');
      if (Array.isArray(res.data) && res.data.length > 0) {
        setCategories((prev) => {
          const merged = Array.from(new Set([...prev, ...res.data]));
          return merged;
        });
      }
    } catch (err) {
      console.warn('Could not fetch categories:', err);
    }
  };

  const fetchDdsData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter) params.append('type', typeFilter);
      if (accountFilter) params.append('account', accountFilter);
      if (search) params.append('search', search);
      params.append('limit', '500');
      params.append('sortOrder', 'asc');

      const [txRes, sumRes] = await Promise.all([
        axios.get(`/api/dds?${params.toString()}`),
        axios.get('/api/dds/summary'),
      ]);

      const rawTxs = txRes.data.transactions || [];
      // Chronological ascending sort (17:16 -> 17:17) and filter phantom 0s
      const sorted = rawTxs
        .filter((t: any) => Number(t.amount) > 0 || (t.description && t.description.trim() !== ''))
        .sort((a: any, b: any) => {
          return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime();
        });

      setTransactions(sorted);
      setSummary(sumRes.data);
    } catch (err) {
      console.error('Fetch DDS error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) {
      alert('Iltimos, amaldagi to\'g\'ri summani kiriting!');
      return;
    }

    let finalCategory = form.categoryName;
    if (isAddingNewCategory && newCategoryName.trim()) {
      finalCategory = newCategoryName.trim();
      setCategories((prev) => Array.from(new Set([...prev, finalCategory])));
    }

    try {
      await axios.post('/api/dds', {
        ...form,
        dateTime: form.dateTime ? `${form.dateTime}T12:00:00+05:00` : new Date().toISOString(),
        categoryName: finalCategory,
      });
      setIsModalOpen(false);
      setIsAddingNewCategory(false);
      setNewCategoryName('');
      setForm({
        dateTime: new Date().toISOString().slice(0, 10),
        type: 'EXPENSE',
        account: 'CASH',
        expenseType: 'COGS',
        categoryName: finalCategory,
        sourcePerson: 'Hasan',
        amount: 0,
        description: '',
      });
      fetchDdsData();
      fetchCategories();
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Haqiqatdan ham bu tranzaksiyani o'chirmoqchimisiz?")) return;
    try {
      await axios.delete(`/api/dds/${id}`);
      fetchDdsData();
    } catch (err: any) {
      alert("O'chirishda xatolik: " + (err.response?.data?.error || err.message));
    }
  };

  const handleClearAll = async () => {
    const conf = window.prompt("Barcha kirim-chiqimlarni o'chirish va kassa/karta balansini 0 qilish uchun administrator kodini kiriting:");
    if (!conf) return;
    try {
      // Kod serverda tekshiriladi; faqat ADMIN roli bajara oladi
      await axios.delete('/api/dds/all', { data: { confirmCode: conf } });
      fetchDdsData();
      alert("Barcha kirim-chiqimlar o'chirildi va balans 0 qilindi!");
    } catch (err: any) {
      alert("Tozalashda xatolik: " + (err.response?.data?.error || err.message));
    }
  };

  // Dynamic calculations based on active filtered transactions
  const totalCount = transactions.length;
  const filteredIncome = transactions
    .filter((t) => t.type === 'INCOME')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const filteredExpense = transactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const filteredNetFlow = filteredIncome - filteredExpense;
  const avgCheck = totalCount > 0 ? Math.round((filteredIncome + filteredExpense) / totalCount) : 0;

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100 w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ArrowDownUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>Pul Oqimi va Harakati — DDS (Keng Jadval)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Kassa, karta va hisob-raqamdagi barcha kirim-chiqimlar, COGS va OPEX tasnifi (Xronologik o'sish tartibida)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={syncingDds}
            onClick={handleSyncDdsFromSheets}
            className="btn-3d inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 rounded-xl transition"
            title="Google Sheets 'Транзакции_ДДС' jadvalidagi barcha kirim va chiqimlarni yuklab olish"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingDds ? 'animate-spin text-emerald-500' : 'text-emerald-600 dark:text-emerald-400'}`} />
            <span>{syncingDds ? 'Yuklanmoqda...' : 'Sheets DDS yuklash'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCategoryBreakdown(!showCategoryBreakdown)}
            className="btn-3d inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          >
            <PieChart className="w-4 h-4 text-indigo-500" />
            <span>Xarajat Strukturasi</span>
            {showCategoryBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {isAdmin && (
          <button
            type="button"
            onClick={handleClearAll}
            className="btn-3d inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-300 dark:border-rose-800 rounded-xl transition"
            title="Barcha kirim-chiqimlarni tozalash va balansni 0 qilish"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Balansni 0 qilish</span>
          </button>
          )}

          <button
            onClick={() => {
              setForm({
                dateTime: new Date().toISOString().slice(0, 10),
                type: 'EXPENSE',
                account: 'CASH',
                expenseType: 'OPEX',
                categoryName: categories[0] || 'Boshqa xarajat',
                sourcePerson: 'Hasan',
                amount: 0,
                description: '',
              });
              setIsAddingNewCategory(false);
              setNewCategoryName('');
              setIsModalOpen(true);
            }}
            className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-md shadow-emerald-600/20 active:translate-y-[1px] transition"
          >
            <Plus className="w-4 h-4" />
            <span>Yangi Pul Operatsiyasi</span>
          </button>
        </div>
      </div>

      {/* Dynamic KPI Summary Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full">
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Jami Kirim (Itogo)
          </span>
          <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {formatMoney(filteredIncome)}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Barcha daromadlar</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
            Jami Chiqim (Xarajat)
          </span>
          <p className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 mt-1">
            {formatMoney(filteredExpense)}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">COGS + OPEX xarajat</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Sof Pul Oqimi (Net Flow)
          </span>
          <p className={`text-base sm:text-lg font-black mt-1 ${filteredNetFlow >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {formatMoney(filteredNetFlow)}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Kirim - Chiqim</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Soni (Kolichestvo)
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
            {totalCount} ta
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Tranzaksiyalar soni</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
            O'rtacha Chek
          </span>
          <p className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {formatMoney(avgCheck)}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">1 operatsiya summasi</span>
        </div>
      </div>

      {/* Account Balances Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 w-full">
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Kassa (Naqd pul)</p>
            <p className="text-base font-black text-slate-900 dark:text-white mt-1">{formatMoney(summary?.cashBalance)}</p>
          </div>
          <Wallet className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Bank karta (Humo/Uzcard)</p>
            <p className="text-base font-black text-slate-900 dark:text-white mt-1">{formatMoney(summary?.cardBalance)}</p>
          </div>
          <CreditCard className="w-6 h-6 text-blue-500 dark:text-blue-400" />
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Hisob-raqam (MChJ)</p>
            <p className="text-base font-black text-slate-900 dark:text-white mt-1">{formatMoney(summary?.settlementBalance)}</p>
          </div>
          <Building className="w-6 h-6 text-purple-500 dark:text-purple-400" />
        </div>

        <div className="card-3d bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-4 rounded-2xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-[11px] text-emerald-200 font-semibold">Jami Likvidlik</p>
            <p className="text-base font-extrabold mt-1">{formatMoney(summary?.totalLiquidity)}</p>
          </div>
          <PieChart className="w-6 h-6 text-emerald-300" />
        </div>
      </div>

      {/* Category Breakdown Card (Collapsible) */}
      {showCategoryBreakdown && (
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm p-5 space-y-4 animate-fade-in w-full">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Xarajatlar Strukturasi va Kriteriyalari (Kategoriyalar bo'yicha taqsimot)
            </h3>
            <span className="text-xs text-slate-500">{summary?.categoriesBreakdown?.length || 0} ta kategoriya</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {summary?.categoriesBreakdown?.map((cat: any, idx: number) => (
              <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1 border border-slate-200/60 dark:border-slate-700/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{cat.categoryName}</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">{formatMoney(cat.amount)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{cat.classification}</span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{formatPercent(cat.sharePct)}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${Math.min(100, (cat.sharePct || 0) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FULL-WIDTH Transactions Table */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col w-full">
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{transactions.length} ta operatsiya</span>
        </div>
        {/* Search and High-Contrast Filters Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-3 items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Qidiruv: TX raqami, tavsif, mas'ul shaxs, kategoriya..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Barcha turlar</option>
              <option value="INCOME" className="bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-bold">Daromad (+)</option>
              <option value="EXPENSE" className="bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 font-bold">Xarajat (-)</option>
            </select>

            {/* Account Filter */}
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Barcha hisoblar</option>
              <option value="CASH" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Kassa (Naqd)</option>
              <option value="BANK_CARD" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Bank karta</option>
              <option value="SETTLEMENT_ACCOUNT" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Hisob-raqam</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setTypeFilter('');
                setAccountFilter('');
                setSearch('');
                fetchDdsData();
              }}
              className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="Filtrni tozalash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Wide Table with Full Horizontal Freedom and Sticky Header */}
        <div className="table-scroll-container custom-scrollbar w-full">
          <table className="w-full text-xs text-left text-slate-700 dark:text-slate-200">
            <thead className="table-sticky-head bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 whitespace-nowrap shadow-sm">
              <tr>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">ID</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Sana-vaqt (Tartib)</th>
                <th className="px-4 py-3.5 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Turi</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Hisob / Hamyon</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Kategoriya / Kriteriya</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Kim Kiritdi</th>
                <th className="px-4 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Summa (UZS)</th>
                <th className="px-4 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Tavsif / Izoh</th>
                <th className="px-4 py-3.5 text-center sticky right-0 top-0 bg-slate-100 dark:bg-slate-950 z-30 shadow-md whitespace-nowrap">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium whitespace-nowrap">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    Tranzaksiyalar yuklanmoqda...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    Tranzaksiya topilmadi (Balans 0 UZS)
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-300">{tx.txNumber}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDateTime(tx.dateTime)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`pill-3d px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                        tx.type === 'INCOME'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                      }`}>
                        {tx.type === 'INCOME' ? 'Daromad (+)' : 'Xarajat (-)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                      {tx.account === 'CASH' ? 'Kassa' : tx.account === 'BANK_CARD' ? 'Karta' : 'H-raqam'}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{tx.categoryName}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{tx.sourcePerson}</td>
                    <td className={`px-4 py-3 text-right font-black ${
                      tx.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
                    }`}>
                      {Number(tx.amount) > 0 ? (
                        `${tx.type === 'INCOME' ? '+' : '-'}${formatMoney(tx.amount)}`
                      ) : (
                        formatMoney(0)
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[280px] truncate text-slate-500 dark:text-slate-400" title={tx.description || ''}>
                      {tx.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(tx.id)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                        title="O'chirish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Transaction Modal with ZERO-CLEARING AmountInput and Custom Category */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4 text-xs overflow-y-auto max-h-[92vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowDownUp className="w-4 h-4 text-emerald-500" />
                <span>Yangi Pul Operatsiyasini Kiritish</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Sana</label>
                  <input
                    type="date"
                    required
                    value={form.dateTime}
                    onChange={(e) => setForm({ ...form, dateTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Operatsiya turi</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold"
                  >
                    <option value="EXPENSE">Xarajat (Расход)</option>
                    <option value="INCOME">Daromad (Доход)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Hisob / Hamyon</label>
                  <select
                    value={form.account}
                    onChange={(e) => setForm({ ...form, account: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="CASH">Kassa (Naqd)</option>
                    <option value="BANK_CARD">Bank karta</option>
                    <option value="SETTLEMENT_ACCOUNT">Hisob-raqam</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Xarajat toifasi (Kriteriyasi)</label>
                <select
                  value={form.expenseType}
                  onChange={(e) => setForm({ ...form, expenseType: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="COGS">O'zgaruvchan (COGS - Mahsulot tannarxi)</option>
                  <option value="OPEX">Operatsion (OPEX - Doimiy xarajat)</option>
                  <option value="INCOME_TRANSFER">Daromad / Pul o'tkazmasi</option>
                </select>
              </div>

              {/* Dynamic Categories with "+ Yangi qo'shish" feature */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Xarajat / Daromad Kriteriyasi (Kategoriya)
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewCategory(!isAddingNewCategory)}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>{isAddingNewCategory ? 'Mavjudlardan tanlash' : '+ Yangi tur qo\'shish'}</span>
                  </button>
                </div>

                {isAddingNewCategory ? (
                  <input
                    type="text"
                    required
                    placeholder="Yangi xarajat yoki daromad turini yozing..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-500 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                ) : (
                  <select
                    value={form.categoryName}
                    onChange={(e) => setForm({ ...form, categoryName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {categories.map((c, i) => (
                      <option key={i} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Zero-clearing AmountInput */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Summa (UZS) *
                  </label>
                  <AmountInput
                    value={form.amount}
                    onChange={(val) => setForm({ ...form, amount: val })}
                    placeholder="Masalan: 5 000 000"
                    required
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mas'ul shaxs (Kim kiritdi)
                  </label>
                  <input
                    type="text"
                    required
                    value={form.sourcePerson}
                    onChange={(e) => setForm({ ...form, sourcePerson: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Tavsif / Izoh</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  rows={2}
                  placeholder="Xarajat yoki daromad maqsadi..."
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-3d px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 shadow-md shadow-emerald-600/30"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default DdsPage;
