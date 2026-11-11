import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  BadgeDollarSign,
  Search,
  CheckCircle2,
  AlertTriangle,
  Plus,
  RefreshCw,
  ShoppingBag,
  Percent,
  Calendar,
  Lock,
  ArrowUpRight,
  User,
  Store as StoreIcon,
  X,
  Edit3,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { formatMoney, formatPercent, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { Store } from '../types';
import { AmountInput } from '../components/AmountInput';

export const SalesPage: React.FC = () => {
  const { t } = useTranslation();

  const [salesItems, setSalesItems] = useState<any[]>([]);
  const [availableStock, setAvailableStock] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Sell Modal State
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [saleForm, setSaleForm] = useState({
    saleDate: new Date().toISOString().slice(0, 10),
    salePrice: 0,
    buyerName: '',
    paidAmount: 0,
    paymentType: 'CASH',
    dueDate: '',
    note: '',
    adminOverrideCode: '',
  });
  const [selling, setSelling] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [requiresOverride, setRequiresOverride] = useState(false);
  const [existingDebtNotice, setExistingDebtNotice] = useState(0);

  // Edit Sale Modal State
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    saleDate: new Date().toISOString().slice(0, 10),
    salePrice: 0,
    buyerName: '',
    paidAmount: 0,
    paymentType: 'CASH',
    dueDate: '',
    note: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete / Revert Modal State
  const [deletingSale, setDeletingSale] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchSales();
    fetchStores();
    fetchAvailableStock();
  }, [search, startDate, endDate]);

  const fetchStores = async () => {
    try {
      const res = await axios.get('/api/references/stores');
      setStores(res.data || []);
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('status', 'SOLD');
      const res = await axios.get(`/api/inventory?${params.toString()}`);
      setSalesItems(res.data.items || []);
    } catch (err) {
      console.error('Fetch sales error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableStock = async () => {
    try {
      const res = await axios.get('/api/inventory?status=IN_WAREHOUSE');
      setAvailableStock(res.data.items || []);
    } catch (err) {
      console.error('Fetch available stock error:', err);
    }
  };

  // Filter items by store
  const filteredSales = salesItems.filter((it) => {
    if (storeFilter && it.storeId !== storeFilter && it.storeName !== storeFilter) return false;
    return true;
  });

  // Dynamic KPI calculations
  const totalSalesCount = filteredSales.length;
  const totalSalesVolume = filteredSales.reduce((sum, it) => sum + (Number(it.salePrice) || 0), 0);
  const totalPurchaseCost = filteredSales.reduce((sum, it) => sum + (Number(it.purchaseCost) || 0), 0);
  const totalProfit = filteredSales.reduce((sum, it) => sum + (Number(it.profit) || 0), 0);
  const avgCheck = totalSalesCount > 0 ? Math.round(totalSalesVolume / totalSalesCount) : 0;
  const totalMarginSum = filteredSales.reduce((sum, it) => sum + (Number(it.marginPercent) || 0), 0);
  const avgMargin = totalSalesCount > 0 ? totalMarginSum / totalSalesCount : 0;

  const handleOpenNewSale = () => {
    setIsSellModalOpen(true);
    setSelectedStockId(availableStock.length > 0 ? availableStock[0].id : '');
    const firstItem = availableStock[0];
    const initialPrice = firstItem ? (firstItem.salePrice > 0 ? firstItem.salePrice : Math.round(firstItem.purchaseCost * 1.12)) : 0;
    setSaleForm({
      saleDate: new Date().toISOString().slice(0, 10),
      salePrice: initialPrice,
      buyerName: '',
      paidAmount: initialPrice,
      paymentType: 'CASH',
      dueDate: '',
      note: '',
      adminOverrideCode: '',
    });
    setSaleError('');
    setRequiresOverride(false);
    setExistingDebtNotice(0);
  };

  const handleStockSelectChange = (id: string) => {
    setSelectedStockId(id);
    const item = availableStock.find((it) => it.id === id);
    if (item) {
      const initialPrice = item.salePrice > 0 ? item.salePrice : Math.round(item.purchaseCost * 1.12);
      setSaleForm((prev) => ({
        ...prev,
        salePrice: initialPrice,
        paidAmount: initialPrice,
      }));
    }
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockId) {
      alert('Iltimos, sotiladigan qurilmani tanlang!');
      return;
    }
    if (!saleForm.buyerName.trim()) {
      alert('Haridor ismini kiriting!');
      return;
    }

    try {
      setSelling(true);
      setSaleError('');
      await axios.put(`/api/inventory/${selectedStockId}/sell`, saleForm);
      setIsSellModalOpen(false);
      fetchSales();
      fetchAvailableStock();
      alert('Sotuv muvaffaqiyatli amalga oshirildi!');
    } catch (err: any) {
      if (err.response?.data?.requiresOverride) {
        setRequiresOverride(true);
        setExistingDebtNotice(err.response.data.totalExistingDebt || 0);
      }
      setSaleError(err.response?.data?.error || err.message);
    } finally {
      setSelling(false);
    }
  };

  const handleOpenEditSale = (item: any) => {
    setEditingSale(item);
    const sPrice = Number(item.salePrice) || 0;
    const debt = Number(item.debtRemainder) || 0;
    const paid = Number(item.receivedFromBuyer) || (sPrice - debt);
    setEditForm({
      saleDate: item.saleDate ? new Date(item.saleDate).toISOString().slice(0, 10) : (item.dealDate ? new Date(item.dealDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
      salePrice: sPrice,
      buyerName: item.buyerName || item.customerName || '',
      paidAmount: Math.max(0, paid),
      paymentType: debt > 0 ? 'INSTALLMENT' : 'CASH',
      dueDate: item.debtDueDate ? new Date(item.debtDueDate).toISOString().split('T')[0] : '',
      note: item.note || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    if (!editForm.buyerName.trim()) {
      alert('Iltimos, haridor ismini kiriting!');
      return;
    }
    if (editForm.salePrice <= 0) {
      alert('Sotuv narxi 0 dan katta bo\'lishi kerak!');
      return;
    }

    try {
      setSavingEdit(true);
      await axios.put(`/api/inventory/${editingSale.id}/sale`, editForm);
      setEditingSale(null);
      fetchSales();
      fetchAvailableStock();
      alert('Sotuv ma\'lumotlari muvaffaqiyatli yangilandi!');
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRevertSaleToWarehouse = async (dealId: string) => {
    if (!confirm('Ushbu sotuvni bekor qilib, tovarni yana omborga qaytarishni xohlaysizmi?')) return;
    try {
      setDeleting(true);
      await axios.put(`/api/inventory/${dealId}/sale`, { returnToWarehouse: true });
      setEditingSale(null);
      setDeletingSale(null);
      fetchSales();
      fetchAvailableStock();
      alert('Tovar muvaffaqiyatli omborga qaytarildi (Omborda)!');
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSalePermanently = async (dealId: string) => {
    if (!confirm('DIQQAT! Ushbu bitim butunlay o\'chiriladi. Rozimisiz?')) return;
    try {
      setDeleting(true);
      await axios.delete(`/api/inventory/${dealId}/sale?deletePermanently=true`);
      setDeletingSale(null);
      fetchSales();
      fetchAvailableStock();
      alert('Bitim butunlay o\'chirildi!');
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <BadgeDollarSign className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span>Sotuvlar va Bitimlar Hisobi</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sotilgan qurilmalar arxivi, haridorlar, foyda, marja foizi va nasiya qarzdorlik nazorati
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenNewSale}
            className="btn-3d py-2 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:translate-y-[1px] transition"
          >
            <Plus className="w-4 h-4" />
            <span>Yangi Sotuv Rasmiylashtirish</span>
          </button>
        </div>
      </div>

      {/* Dynamic KPI Summary Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Jami Sotuv (Itogo)
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
            {formatMoney(totalSalesVolume)}
          </p>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Tushum summasi</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Soni (Kolichestvo)
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
            {totalSalesCount} dona
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Bajarilgan sotuvlar</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            O'rtacha Chek
          </span>
          <p className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {formatMoney(avgCheck)}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">1 bitim tushumi</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Jami Sof Foyda
          </span>
          <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {formatMoney(totalProfit)}
          </p>
          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">Tannarxdan qolgan</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
            O'rtacha Marja %
          </span>
          <p className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 mt-1">
            {formatPercent(avgMargin)}
          </p>
          <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80 font-medium">Foydalilik darajasi</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Qidiruv: mahsulot, IMEI, haridor yoki do'kon..."
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="w-full md:w-56 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Barcha filiallar (Magazin)</option>
              {stores.map((s) => (
                <option key={s.id} value={s.name} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                  {s.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStoreFilter('');
                setStartDate('');
                setEndDate('');
              }}
              className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="Tozalash"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Date Range Filter Row */}
        <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Sana bo'yicha:</span>
            </span>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-inner">
              <span className="text-[11px] font-semibold text-slate-500">Dan:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-900 dark:text-white text-xs outline-none cursor-pointer font-medium"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-inner">
              <span className="text-[11px] font-semibold text-slate-500">Gacha:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-slate-900 dark:text-white text-xs outline-none cursor-pointer font-medium"
              />
            </div>

            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-2 py-1.5 rounded-xl text-rose-500 hover:bg-rose-500/10 flex items-center gap-1 font-bold text-[11px] transition"
                title="Sanani tozalash"
              >
                <X className="w-3.5 h-3.5" />
                <span>Bekor qilish</span>
              </button>
            )}
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                setStartDate(today);
                setEndDate(today);
              }}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
            >
              Bugun
            </button>
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                const yest = d.toISOString().slice(0, 10);
                setStartDate(yest);
                setEndDate(yest);
              }}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
            >
              Kecha
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const past7 = new Date();
                past7.setDate(now.getDate() - 7);
                setStartDate(past7.toISOString().slice(0, 10));
                setEndDate(now.toISOString().slice(0, 10));
              }}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
            >
              7 kun
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
                const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
                setStartDate(firstDay);
                setEndDate(lastDay);
              }}
              className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition"
            >
              Shu oy
            </button>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="table-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col">
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{filteredSales.length} ta sotuv</span>
        </div>
        <div className="table-scroll-container custom-scrollbar">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
            <thead className="table-sticky-head bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 shadow-sm">
              <tr>
                <th className="px-4 py-3 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">№</th>
                <th className="px-4 py-3 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Sana</th>
                <th className="px-4 py-3 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Filial / Do'kon</th>
                <th className="px-4 py-3 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Mahsulot Nomi</th>
                <th className="px-4 py-3 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">IMEI / Shtrix</th>
                <th className="px-4 py-3 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Xarid Summasi</th>
                <th className="px-4 py-3 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Sotuv Narxi</th>
                <th className="px-4 py-3 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Sof Foyda</th>
                <th className="px-4 py-3 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Marja %</th>
                <th className="px-4 py-3 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Haridor</th>
                <th className="px-4 py-3 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Holat</th>
                <th className="px-4 py-3 text-center sticky right-0 top-0 bg-slate-100 dark:bg-slate-950 z-30 shadow-md whitespace-nowrap">
                  Amallar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    Sotuvlar ma'lumotlari yuklanmoqda...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-slate-400">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    Sotilgan tovarlar topilmadi
                  </td>
                </tr>
              ) : (
                filteredSales.map((item, idx) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-bold text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(item.dealDate)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                      {item.storeName || '-'}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                      <div>{item.productName}</div>
                      {item.isDaftar && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                          📒 Daftar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {item.imei || '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {formatMoney(item.purchaseCost)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {formatMoney(item.salePrice)}
                      </div>
                      {Number(item.debtRemainder) > 0 ? (
                        <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                          Qarz: {formatMoney(item.debtRemainder)}
                        </div>
                      ) : Number(item.salePrice) > 0 ? (
                        <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          To'liq to'langan
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                      <span className={Number(item.profit) >= 0 ? 'text-teal-600 dark:text-teal-400' : 'text-rose-600 dark:text-rose-400'}>
                        {formatMoney(item.profit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="pill-3d px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                        {formatPercent(item.marginPercent)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                      <div>{item.buyerName || '-'}</div>
                      {item.debtDueDate && Number(item.debtRemainder) > 0 && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                          Muddat: {formatDate(item.debtDueDate)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        Sotilgan
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap sticky right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 shadow-sm">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditSale(item)}
                          className="btn-3d px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-xs"
                          title="Sotuv ma'lumotlarini tahrirlash (Narx, Haridor, Qarz)"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>O'zgartirish</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSale(item)}
                          className="btn-3d px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-xs"
                          title="Sotuvni bekor qilish yoki o'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>O'chirish</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Sale Modal */}
      {isSellModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <BadgeDollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Yangi Sotuv Rasmiylashtirish
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSellModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Ombordagi Qurilmani Tanlang *
                </label>
                <select
                  value={selectedStockId}
                  onChange={(e) => handleStockSelectChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  required
                >
                  {availableStock.length === 0 ? (
                    <option value="" className="bg-white dark:bg-slate-900">Omborda tayyor mahsulot yo'q</option>
                  ) : (
                    availableStock.map((st) => (
                      <option key={st.id} value={st.id} className="bg-white dark:bg-slate-900">
                        {st.productName} — IMEI: {st.imei || 'Yo\'q'} ({st.storeName})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Sotuv / Chek Sanasi *</span>
                  </label>
                  <input
                    type="date"
                    value={saleForm.saleDate}
                    onChange={(e) => setSaleForm({ ...saleForm, saleDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 cursor-pointer font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Haridor F.I.O yoki Nomi *
                  </label>
                  <input
                    type="text"
                    value={saleForm.buyerName}
                    onChange={(e) => setSaleForm({ ...saleForm, buyerName: e.target.value })}
                    placeholder="Masalan: Dilshod Rustamov"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Sotuv Narxi (UZS) *
                  </label>
                  <AmountInput
                    value={saleForm.salePrice}
                    onChange={(val) => {
                      if (saleForm.paymentType === 'INSTALLMENT') {
                        setSaleForm({ ...saleForm, salePrice: val });
                      } else {
                        setSaleForm({ ...saleForm, salePrice: val, paidAmount: val });
                      }
                    }}
                    placeholder="Masalan: 8 500 000"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    To'langan Summa (UZS)
                  </label>
                  <AmountInput
                    value={saleForm.paidAmount}
                    onChange={(val) => setSaleForm({ ...saleForm, paidAmount: val })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    To'lov Shakli
                  </label>
                  <select
                    value={saleForm.paymentType}
                    onChange={(e) => {
                      const pType = e.target.value;
                      if (pType === 'INSTALLMENT') {
                        setSaleForm({ ...saleForm, paymentType: pType, paidAmount: 0 });
                      } else {
                        setSaleForm({ ...saleForm, paymentType: pType, paidAmount: saleForm.salePrice });
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="CASH" className="bg-white dark:bg-slate-900">Naqd pul (Kassa)</option>
                    <option value="CARD" className="bg-white dark:bg-slate-900">Karta / Perevod</option>
                    <option value="INSTALLMENT" className="bg-white dark:bg-slate-900">Nasiya / Qarz (Qarzdorlarga tushadi)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Qarz Muddat Sanasi
                  </label>
                  <input
                    type="date"
                    value={saleForm.dueDate}
                    onChange={(e) => setSaleForm({ ...saleForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Real-time Debt indicator */}
              {saleForm.salePrice > 0 && (
                <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[10px]">Qarzdorlik summasi:</span>
                    <span className={`font-black text-sm ${saleForm.salePrice - saleForm.paidAmount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatMoney(Math.max(0, saleForm.salePrice - saleForm.paidAmount))}
                    </span>
                  </div>
                  {saleForm.salePrice - saleForm.paidAmount > 0 ? (
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold border border-rose-500/30">
                      Srazi "Qarzdorlar" ro'yxatiga tushadi
                    </span>
                  ) : (
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30">
                      To'liq to'langan
                    </span>
                  )}
                </div>
              )}

              {/* Debt Notice and Override Password Prompt */}
              {requiresOverride && (
                <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Mijozning muddati o'tgan qarzi bor ({formatMoney(existingDebtNotice)})!</span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    Ushbu bitimni tasdiqlash uchun boshqaruvchi (admin) maxsus parolini kiriting:
                  </p>
                  <input
                    type="password"
                    placeholder="Administrator kodi"
                    value={saleForm.adminOverrideCode}
                    onChange={(e) => setSaleForm({ ...saleForm, adminOverrideCode: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-600 font-bold"
                  />
                </div>
              )}

              {saleError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{saleError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSellModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={selling}
                  className="btn-3d px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md shadow-emerald-600/30 transition disabled:opacity-50"
                >
                  {selling ? 'Rasmiylashtirilmoqda...' : 'Sotuvni Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Sale Modal */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Sotuvni Tahrirlash (№{editingSale.dealNumber})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSale(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Summary banner */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Mahsulot:</span>
                <span className="font-bold text-slate-900 dark:text-white">{editingSale.productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Filial:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{editingSale.storeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Xarid tannarxi:</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatMoney(editingSale.purchaseCost)}</span>
              </div>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Sotuv / Chek Sanasi *</span>
                  </label>
                  <input
                    type="date"
                    value={editForm.saleDate}
                    onChange={(e) => setEditForm({ ...editForm, saleDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 cursor-pointer font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Haridor F.I.O yoki Nomi *
                  </label>
                  <input
                    type="text"
                    value={editForm.buyerName}
                    onChange={(e) => setEditForm({ ...editForm, buyerName: e.target.value })}
                    placeholder="Masalan: Sardor Aliyev"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Sotuv Narxi (UZS) *
                  </label>
                  <AmountInput
                    value={editForm.salePrice}
                    onChange={(val) => {
                      if (editForm.paymentType === 'INSTALLMENT') {
                        setEditForm({ ...editForm, salePrice: val });
                      } else {
                        setEditForm({ ...editForm, salePrice: val, paidAmount: val });
                      }
                    }}
                    placeholder="Masalan: 5 000 000"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    To'langan Summa (UZS)
                  </label>
                  <AmountInput
                    value={editForm.paidAmount}
                    onChange={(val) => setEditForm({ ...editForm, paidAmount: val })}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    To'lov Shakli
                  </label>
                  <select
                    value={editForm.paymentType}
                    onChange={(e) => {
                      const pType = e.target.value;
                      if (pType === 'INSTALLMENT') {
                        setEditForm({ ...editForm, paymentType: pType, paidAmount: 0 });
                      } else {
                        setEditForm({ ...editForm, paymentType: pType, paidAmount: editForm.salePrice });
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="CASH" className="bg-white dark:bg-slate-900">Naqd pul (Kassa)</option>
                    <option value="CARD" className="bg-white dark:bg-slate-900">Karta / Perevod</option>
                    <option value="INSTALLMENT" className="bg-white dark:bg-slate-900">Nasiya / Qarz (Qarzdorlarga tushadi)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Qarz Muddat Sanasi
                  </label>
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Live debt and profit calculation */}
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200/60 dark:border-indigo-800/40 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Kutilayotgan Sof Foyda:</span>
                  <span className={`font-black ${editForm.salePrice - editingSale.purchaseCost >= 0 ? 'text-teal-600 dark:text-teal-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatMoney(editForm.salePrice - editingSale.purchaseCost)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-indigo-200/40 dark:border-indigo-800/30 pt-1.5">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Qarz qoldig'i (Debitorlik):</span>
                  <span className={`font-black ${editForm.salePrice - editForm.paidAmount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {formatMoney(Math.max(0, editForm.salePrice - editForm.paidAmount))}
                  </span>
                </div>

                {editForm.salePrice - editForm.paidAmount > 0 && (
                  <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/40 p-2 rounded-xl flex items-center gap-1.5">
                    <span>⚠️ Ushbu summa to'g'ridan-to'g'ri "Qarzdorlar" ro'yxatiga tushadi!</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Izoh (Izoh yoki qarz shartlari)
                </label>
                <input
                  type="text"
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder="Qo'shimcha izoh..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleRevertSaleToWarehouse(editingSale.id)}
                  className="w-full sm:w-auto px-3.5 py-2 text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl transition flex items-center justify-center gap-1.5"
                  title="Sotuvni bekor qilib, tovarni yana omborga qaytarish"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Omborga qaytarish</span>
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingSale(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                  >
                    Yopish
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="btn-3d px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md shadow-indigo-600/30 transition disabled:opacity-50"
                  >
                    {savingEdit ? 'Saqlanmoqda...' : 'O\'zgarishlarni Saqlash'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Revert Modal */}
      {deletingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-3 bg-rose-500/15 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Sotuvni O'chirish yoki Bekor qilish
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  №{deletingSale.dealNumber} — {deletingSale.productName}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Ushbu sotuv bo'yicha qanday amal bajarmoqchisiz?
            </p>

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => handleRevertSaleToWarehouse(deletingSale.id)}
                className="w-full p-3 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl text-left transition flex items-center justify-between group"
              >
                <div>
                  <div className="font-bold text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-emerald-600" />
                    <span>1. Tovarni omborga qaytarish (Tavsiya etiladi)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 pl-5">
                    Sotuv bekor qilinadi, tovar yana omborda sotuvga tayyor bo'ladi va barcha qarzlar bekor bo'ladi.
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={() => handleDeleteSalePermanently(deletingSale.id)}
                className="w-full p-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/60 rounded-2xl text-left transition flex items-center justify-between group"
              >
                <div>
                  <div className="font-bold text-xs text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>2. Butunlay o'chirish</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 pl-5">
                    Ushbu bitim tizimdan va barcha hisobotlardan butunlay o'chiriladi.
                  </p>
                </div>
              </button>
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingSale(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SalesPage;