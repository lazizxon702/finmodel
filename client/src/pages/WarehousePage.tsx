import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Package,
  Search,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  RefreshCw,
  ArrowRightLeft,
  FileCheck2,
  Warehouse,
  Truck,
  Plus,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import { formatMoney, formatPercent, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { Store } from '../types';

export const WarehousePage: React.FC = () => {
  const { t } = useTranslation();

  const [items, setItems] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [daftarFilter, setDaftarFilter] = useState<'ALL' | 'DAFTAR' | 'STANDARD'>('ALL');

  // Scanner Prixod modal state
  const [scanModalItem, setScanModalItem] = useState<any | null>(null);

  // Status edit modal (with mandatory reason)
  const [statusEditItem, setStatusEditItem] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState('IN_WAREHOUSE');
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Inter-store transfer state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedForTransfer, setSelectedForTransfer] = useState<string[]>([]);
  const [targetStoreId, setTargetStoreId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Audit / Fast Inventory Modal state
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditScannedImeis, setAuditScannedImeis] = useState<string[]>([]);
  const [auditInputImei, setAuditInputImei] = useState('');

  useEffect(() => {
    fetchInventory();
    fetchStores();
  }, [search, statusFilter]);

  const fetchStores = async () => {
    try {
      const res = await axios.get('/api/references/stores');
      setStores(res.data || []);
      if (res.data?.length > 0 && !targetStoreId) {
        setTargetStoreId(res.data[0].id);
      }
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      // Warehouse view defaults to non-sold items if no statusFilter is set
      if (statusFilter) {
        params.append('status', statusFilter);
      }
      params.append('limit', '1000');
      const res = await axios.get(`/api/inventory?${params.toString()}`);
      // Exclude SOLD by default from pure warehouse view unless explicitly searched
      const allItems = res.data.items || [];
      if (!statusFilter) {
        setItems(allItems.filter((it: any) => it.status !== 'SOLD'));
      } else {
        setItems(allItems);
      }
    } catch (err) {
      console.error('Fetch inventory error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter items by store and daftar mode if selected
  const filteredItems = items.filter((it) => {
    if (storeFilter && it.storeId !== storeFilter && it.storeName !== storeFilter) return false;
    if (daftarFilter === 'DAFTAR' && !it.isDaftar) return false;
    if (daftarFilter === 'STANDARD' && it.isDaftar) return false;
    return true;
  });

  // Calculate dynamic KPIs on active filtered items
  const totalItemsCount = filteredItems.length;
  const totalWarehouseCost = filteredItems.reduce((sum, it) => sum + (Number(it.purchaseCost) || 0), 0);
  const avgCheck = totalItemsCount > 0 ? Math.round(totalWarehouseCost / totalItemsCount) : 0;
  const inWarehouseCount = filteredItems.filter((it) => it.status === 'IN_WAREHOUSE').length;
  const inTransitCount = filteredItems.filter((it) => it.status === 'IN_TRANSIT').length;
  const pendingCount = filteredItems.filter((it) => it.status === 'PENDING').length;
  const needToBuyCount = filteredItems.filter((it) => it.status === 'NEED_TO_BUY' || it.status === 'PARTIAL_AMOUNT').length;

  // Daftar specific analytics
  const daftarItems = items.filter((it) => it.isDaftar);
  const totalDaftarCount = daftarItems.length;
  const daftarInWarehouseCount = daftarItems.filter((it) => it.status === 'IN_WAREHOUSE').length;
  const daftarNeedToBuyCount = daftarItems.filter((it) => it.status === 'NEED_TO_BUY' || it.status === 'PARTIAL_AMOUNT').length;
  const daftarTotalCost = daftarItems.reduce((sum, it) => sum + (Number(it.purchaseCost) || 0), 0);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusEditItem) return;
    if (!statusReason.trim()) {
      alert('Iltimos, holat o\'zgartirish sababini (izohini) yozing!');
      return;
    }

    try {
      setStatusSubmitting(true);
      await axios.put(`/api/inventory/${statusEditItem.id}/status`, {
        status: newStatus,
        reason: statusReason.trim(),
      });
      setStatusEditItem(null);
      setStatusReason('');
      fetchInventory();
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedForTransfer.length === 0) {
      alert('Kamida bitta tovarni tanlang!');
      return;
    }
    if (!targetStoreId) {
      alert('Qabul qiluvchi filialni tanlang!');
      return;
    }

    try {
      setTransferring(true);
      await axios.post('/api/inventory/transfer', {
        dealIds: selectedForTransfer,
        targetStoreId,
        reason: transferReason.trim() || 'Filiallararo tovar o\'tkazish',
      });
      setIsTransferModalOpen(false);
      setSelectedForTransfer([]);
      setTransferReason('');
      fetchInventory();
      alert('Tovarlar muvaffaqiyatli "Yo\'lda" holatiga o\'tkazildi!');
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    } finally {
      setTransferring(false);
    }
  };

  const handleAcceptTransfer = async (dealId: string, currentStoreId?: string) => {
    if (!window.confirm('Haqiqatan ham ushbu tovarni qabul qilib, omborga kirim qilmoqchimisiz?')) return;
    try {
      await axios.post('/api/inventory/transfer/accept', {
        dealId,
        receivedStoreId: currentStoreId,
      });
      fetchInventory();
      alert('Tovar omborga muvaffaqiyatli qabul qilindi (Omborda)!');
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    }
  };

  const renderStatusPill = (status: string) => {
    switch (status) {
      case 'IN_WAREHOUSE':
        return (
          <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            Omborda
          </span>
        );
      case 'IN_TRANSIT':
        return (
          <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 animate-pulse">
            Yo'lda
          </span>
        );
      case 'PENDING':
        return (
          <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
            Kutilmoqda
          </span>
        );
      case 'NEED_TO_BUY':
        return (
          <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            Sotib olish kerak
          </span>
        );
      case 'PARTIAL_AMOUNT':
        return (
          <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
            Qisman to'langan
          </span>
        );
      case 'MONEY_RECEIVED':
        return (
          <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
            Pul tushgan
          </span>
        );
      case 'SOLD':
        return (
          <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
            Sotilgan
          </span>
        );
      default:
        return (
          <span className="pill-3d px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Warehouse className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span>Ombor (Sklad) Nazorati</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Qurilmalar ombori qoldig'i, Dual IMEI, Prixod skaneri, filiallararo ko'chirish va audit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsTransferModalOpen(true)}
            className="btn-3d py-2 px-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-600/20 active:translate-y-[1px] transition"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Filiallararo Ko'chirish</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAuditModalOpen(true)}
            className="btn-3d py-2 px-3.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-cyan-600/20 active:translate-y-[1px] transition"
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Tezkor Inventarizatsiya (Audit)</span>
          </button>
        </div>
      </div>

      {/* Real-time Dynamic KPI Summary Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Jami Qoldiq (Itogo)
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
            {formatMoney(totalWarehouseCost)}
          </p>
          <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">Tannarx qiymati</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Soni (Kolichestvo)
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
            {totalItemsCount} ta
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Barcha qurilmalar</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Omborda Tayyor
          </span>
          <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {inWarehouseCount} ta
          </p>
          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">Sotuvga tayyor</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
            Yo'lda (Tranzit)
          </span>
          <p className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 mt-1">
            {inTransitCount} ta
          </p>
          <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80 font-medium">Filialga borayotgan</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
            Kutilmoqda / Sotib olish
          </span>
          <p className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
            {pendingCount + needToBuyCount} ta
          </p>
          <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-medium">Prixod / Xarid</span>
        </div>

        <div
          onClick={() => setDaftarFilter(daftarFilter === 'DAFTAR' ? 'ALL' : 'DAFTAR')}
          className={`card-3d p-4 rounded-2xl shadow-sm dark:shadow-md cursor-pointer transition border ${
            daftarFilter === 'DAFTAR'
              ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-white dark:bg-slate-900/90 border-amber-300 dark:border-amber-700/60 hover:border-amber-500'
          }`}
          title="Faqat Daftar tovarlarini filtrlash uchun bosing"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Daftar Tovarlari</span>
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              daftarFilter === 'DAFTAR' ? 'bg-amber-600 text-white' : 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
            }`}>
              {daftarFilter === 'DAFTAR' ? 'Faol' : 'Filtr'}
            </span>
          </div>
          <p className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
            {totalDaftarCount} ta
          </p>
          <span className="text-[10px] text-amber-700/90 dark:text-amber-300/90 font-semibold block truncate">
            {formatMoney(daftarTotalCost)}
          </span>
        </div>
      </div>

      {/* Daftar Quick Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-2.5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setDaftarFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              daftarFilter === 'ALL'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>Barcha tovarlar</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold">
              {items.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDaftarFilter('DAFTAR')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              daftarFilter === 'DAFTAR'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20'
                : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-300 dark:border-amber-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>📒 Faqat Daftar tovarlari (Daftar orqali)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              daftarFilter === 'DAFTAR' ? 'bg-white/20 text-white' : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200'
            }`}>
              {totalDaftarCount} ta
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDaftarFilter('STANDARD')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              daftarFilter === 'STANDARD'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>Oddiy (Bank / Provayder) tovarlar</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold">
              {items.length - totalDaftarCount}
            </span>
          </button>
        </div>

        {daftarFilter === 'DAFTAR' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-700 dark:text-amber-300 font-bold text-[11px] bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
              Omborda tayyor: <b>{daftarInWarehouseCount} ta</b> | Sotib olish kerak: <b>{daftarNeedToBuyCount} ta</b>
            </span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm dark:shadow-lg">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder={t('common.search', 'Qidiruv: mahsulot, IMEI, do\'kon, xaridor...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-inner"
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
          {/* Store Filter */}
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Barcha filiallar</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                {s.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Barcha ombor holatlari</option>
            <option value="IN_WAREHOUSE" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Omborda</option>
            <option value="IN_TRANSIT" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Yo'lda</option>
            <option value="PENDING" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Kutilmoqda</option>
            <option value="NEED_TO_BUY" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Sotib olish kerak</option>
            <option value="PARTIAL_AMOUNT" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Qisman to'langan</option>
            <option value="MONEY_RECEIVED" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Pul tushgan</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setStoreFilter('');
            }}
            className="btn-3d p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs transition"
            title="Filtrni tozalash"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3D Warehouse Inventory Table */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm dark:shadow-xl overflow-hidden flex flex-col">
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-cyan-600 dark:text-cyan-400">{filteredItems.length} ta tovar</span>
        </div>
        <div className="table-scroll-container custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="table-sticky-head bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 shadow-sm">
              <tr>
                <th className="px-3 py-3.5 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) setSelectedForTransfer(filteredItems.map((it) => it.id));
                      else setSelectedForTransfer([]);
                    }}
                    checked={selectedForTransfer.length === filteredItems.length && filteredItems.length > 0}
                    className="rounded bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-cyan-500"
                  />
                </th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">№</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Kelgan sana</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Filial / Do'kon</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Mahsulot nomi</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">IMEI 1 / Shtrix</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">IMEI 2</th>
                <th className="px-3 py-3.5 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Holati</th>
                <th className="px-3 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Xarid narxi (Tannarx)</th>
                <th className="px-3 py-3.5 text-center sticky right-0 top-0 bg-slate-100 dark:bg-slate-950 z-30 shadow-md whitespace-nowrap">
                  Ombor amallari
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-500" />
                    Ombor ma'lumotlari yuklanmoqda...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    Omborda tovar topilmadi
                  </td>
                </tr>
              ) : (
                filteredItems.map((it) => {
                  const isChecked = selectedForTransfer.includes(it.id);
                  return (
                    <tr
                      key={it.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                        it.isDaftar
                          ? 'bg-amber-50/40 dark:bg-amber-950/20 border-l-4 border-l-amber-500'
                          : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedForTransfer((prev) => [...prev, it.id]);
                            else setSelectedForTransfer((prev) => prev.filter((id) => id !== it.id));
                          }}
                          className="rounded bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-cyan-500"
                        />
                      </td>
                      <td className="px-3 py-3 font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        №{it.dealNumber}
                      </td>
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(it.date)}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                        {it.storeName}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white text-xs">
                            {it.productName}
                          </span>
                          {it.isDaftar && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs">
                              <BookOpen className="w-3 h-3" />
                              <span>DAFTAR</span>
                              {it.extraDaftar > 0 && (
                                <span className="opacity-95 font-mono text-[9px] font-semibold">
                                  (+{formatMoney(it.extraDaftar)})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {(it.color !== '-' || it.storageGb !== '-' || (it.providerName && it.providerName !== '-')) && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                            {it.providerName && it.providerName !== '-' && (
                              <span className="text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.2 rounded">
                                {it.providerName}
                              </span>
                            )}
                            {it.color !== '-' && <span className="text-cyan-600 dark:text-cyan-300 font-semibold">{it.color}</span>}
                            {it.storageGb !== '-' && <span className="text-purple-600 dark:text-purple-300 font-semibold">{it.storageGb}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {it.imeiBarcode || '-'}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {it.imei2 && it.imei2 !== '-' ? it.imei2 : '-'}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <div className="inline-flex flex-col items-center gap-1">
                          {renderStatusPill(it.status)}
                          <button
                            type="button"
                            onClick={() => {
                              setStatusEditItem(it);
                              setNewStatus(it.status);
                              setStatusReason('');
                            }}
                            className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
                          >
                            O'zgartirish
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatMoney(it.purchaseCost)}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap sticky right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 shadow-sm">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Skaner / Prixod tugmasi */}
                          {it.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => setScanModalItem(it)}
                              className="btn-3d py-1.5 px-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-cyan-600/20 active:translate-y-[1px] transition"
                              title="Skaner orqali qabul qilish (Prixod)"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Skaner / Prixod</span>
                            </button>
                          )}

                          {/* Yo'lda holatidagi tovar uchun Qabul qilish */}
                          {it.status === 'IN_TRANSIT' && (
                            <button
                              type="button"
                              onClick={() => handleAcceptTransfer(it.id, it.storeId)}
                              className="btn-3d py-1.5 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-purple-600/20 active:translate-y-[1px] transition"
                              title="Ko'chirilgan tovarni filialda qabul qilish"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Qabul qilish</span>
                            </button>
                          )}

                          {it.status === 'IN_WAREHOUSE' && (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {it.isDaftar ? 'Omborda mavjud (Daftar)' : 'Omborda mavjud'}
                            </span>
                          )}

                          {it.status === 'NEED_TO_BUY' && (
                            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {it.isDaftar ? 'Daftardan xarid qilish kerak' : 'Sotib olinishi kerak'}
                            </span>
                          )}

                          {it.status === 'PARTIAL_AMOUNT' && (
                            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              Qisman to'langan
                            </span>
                          )}

                          {it.status === 'MONEY_RECEIVED' && (
                            <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Pul tushgan
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Skaner / Prixod Modal */}
      {scanModalItem && (
        <BarcodeScannerModal
          item={scanModalItem}
          onClose={() => setScanModalItem(null)}
          onSuccess={() => {
            setScanModalItem(null);
            fetchInventory();
          }}
        />
      )}

      {/* Status change modal with mandatory reason */}
      {statusEditItem && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 text-xs text-slate-800 dark:text-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Holatni o'zgartirish: №{statusEditItem.dealNumber}
              </h3>
              <button
                onClick={() => setStatusEditItem(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateStatus} className="mt-4 space-y-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Yangi holatni tanlang:
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs outline-none"
                >
                  <option value="IN_WAREHOUSE">Omborda</option>
                  <option value="PENDING">Kutilmoqda</option>
                  <option value="IN_TRANSIT">Yo'lda</option>
                  <option value="NEED_TO_BUY">Sotib olish kerak</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span>O'zgartirish sababi (Izoh) *</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">(Majburiy)</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Nima sababdan holat o'zgartirilmoqda? (Masalan: Tovar filiali o'zgardi, qaytib keldi...)"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusEditItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {statusSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filiallararo tovar o'tkazish Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 text-xs text-slate-800 dark:text-slate-200 overflow-y-auto max-h-[92vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Filiallararo Tovar O'tkazish (Перемещение)</span>
              </h3>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="mt-4 space-y-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 rounded-xl text-purple-800 dark:text-purple-300">
                Tanlangan tovarlar: <b>{selectedForTransfer.length} ta</b>
                {selectedForTransfer.length === 0 && (
                  <span className="block text-rose-500 text-[11px] mt-1">
                    Avval jadvaldan ko'chirmoqchi bo'lgan tovarlarni checkbox orqali tanlang!
                  </span>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Qaysi filialga yuborilmoqda? *
                </label>
                <select
                  required
                  value={targetStoreId}
                  onChange={(e) => setTargetStoreId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs outline-none"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ko'chirish sababi / Izoh:
                </label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="Masalan: Green Bazar filialiga talab bo'yicha..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={transferring || selectedForTransfer.length === 0}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {transferring ? 'Yuborilmoqda...' : 'Yuborish (Yo\'lda)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tezkor Inventarizatsiya (Audit) Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 text-xs text-slate-800 dark:text-slate-200 flex flex-col h-[92vh] sm:h-auto sm:max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>Tezkor Inventarizatsiya va Audit</span>
              </h3>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 overflow-y-auto flex-1">
              <p className="text-slate-600 dark:text-slate-400">
                Skanerni ulab yoki kameradan foydalanib tovarlarning IMEI/Shtrix kodini ketma-ket o'qing:
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="IMEI yoki shtrix-kodni o'qing va Enter bosing..."
                  value={auditInputImei}
                  onChange={(e) => setAuditInputImei(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && auditInputImei.trim()) {
                      e.preventDefault();
                      if (!auditScannedImeis.includes(auditInputImei.trim())) {
                        setAuditScannedImeis([...auditScannedImeis, auditInputImei.trim()]);
                      }
                      setAuditInputImei('');
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (auditInputImei.trim() && !auditScannedImeis.includes(auditInputImei.trim())) {
                      setAuditScannedImeis([...auditScannedImeis, auditInputImei.trim()]);
                      setAuditInputImei('');
                    }
                  }}
                  className="btn-3d px-4 py-2 bg-cyan-600 text-white rounded-xl font-bold"
                >
                  Qo'shish
                </button>
              </div>

              {/* Audit Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <span className="text-slate-500 dark:text-slate-400 block">Bazadagi tovarlar</span>
                  <span className="text-base font-bold text-slate-900 dark:text-white">{filteredItems.length} ta</span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                  <span className="text-emerald-700 dark:text-emerald-400 block">Skaner qilingan</span>
                  <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">{auditScannedImeis.length} ta</span>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40">
                  <span className="text-rose-700 dark:text-rose-400 block">Topilmagan (Kamomad)</span>
                  <span className="text-base font-bold text-rose-700 dark:text-rose-400">
                    {Math.max(0, filteredItems.length - auditScannedImeis.length)} ta
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
              <button
                type="button"
                onClick={() => {
                  setAuditScannedImeis([]);
                  setIsAuditModalOpen(false);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
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
export default WarehousePage;
