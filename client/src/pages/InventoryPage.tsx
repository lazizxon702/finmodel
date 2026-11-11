import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Package,
  Search,
  DollarSign,
  ArrowRight,
  Camera,
  Truck,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  RefreshCw,
  Barcode,
  Layers,
  ArrowRightLeft,
  FileCheck2,
  ShieldAlert,
} from 'lucide-react';
import { formatMoney, formatPercent, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { Store } from '../types';

export const InventoryPage: React.FC = () => {
  const { t } = useTranslation();

  const [items, setItems] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Scanner Prixod modal state
  const [scanModalItem, setScanModalItem] = useState<any | null>(null);

  // Status edit modal (with mandatory reason)
  const [statusEditItem, setStatusEditItem] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState('IN_WAREHOUSE');
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Quick Sell modal state
  const [sellModalItem, setSellModalItem] = useState<any | null>(null);
  const [saleForm, setSaleForm] = useState({
    salePrice: 0,
    buyerName: '',
    paidAmount: 0,
    paymentType: 'CASH',
    dueDate: '',
    note: '',
    adminOverrideCode: '',
  });
  const [saleError, setSaleError] = useState('');
  const [requiresOverride, setRequiresOverride] = useState(false);
  const [existingDebtNotice, setExistingDebtNotice] = useState<number>(0);
  const [selling, setSelling] = useState(false);

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
      if (statusFilter) params.append('status', statusFilter);
      const res = await axios.get(`/api/inventory?${params.toString()}`);
      setItems(res.data.items || []);
    } catch (err) {
      console.error('Fetch inventory error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Status Pill Helper
  const renderStatusPill = (status: string) => {
    switch (status) {
      case 'IN_WAREHOUSE':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            <Package className="w-3 h-3 text-cyan-400" />
            <span>{t('status.in_warehouse', 'Omborda')}</span>
          </span>
        );
      case 'IN_TRANSIT':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
            <Truck className="w-3 h-3 text-purple-400" />
            <span>{t('status.in_transit', 'Yo\'lda')}</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>{t('status.pending', 'Kutilmoqda')}</span>
          </span>
        );
      case 'SOLD':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>{t('status.sold', 'Sotilgan')}</span>
          </span>
        );
      case 'NEED_TO_BUY':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>{t('status.need_to_buy', 'Sotib olish kerak')}</span>
          </span>
        );
      default:
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-700/60 text-slate-300 border border-slate-600">
            {status}
          </span>
        );
    }
  };

  // Sell modal handler
  const handleOpenSell = async (item: any) => {
    setSellModalItem(item);
    const suggestedPrice = item.salePrice > 0 ? item.salePrice : Math.round(item.purchaseCost * 1.12);
    setSaleForm({
      salePrice: suggestedPrice,
      buyerName: item.buyerName !== '-' ? item.buyerName : '',
      paidAmount: suggestedPrice,
      paymentType: 'CASH',
      dueDate: '',
      note: '',
      adminOverrideCode: '',
    });
    setSaleError('');
    setRequiresOverride(false);
    setExistingDebtNotice(0);
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellModalItem) return;

    try {
      setSelling(true);
      setSaleError('');
      await axios.put(`/api/inventory/${sellModalItem.id}/sell`, saleForm);
      setSellModalItem(null);
      fetchInventory();
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

  // Status Change with Reason
  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusEditItem) return;
    if (!statusReason.trim()) {
      alert('Holatni o\'zgartirish sababi (izoh) kiritilishi shart!');
      return;
    }

    try {
      setStatusSubmitting(true);
      await axios.put(`/api/inventory/${statusEditItem.id}/status`, {
        status: newStatus,
        reason: statusReason,
      });
      setStatusEditItem(null);
      fetchInventory();
    } catch (err: any) {
      alert('Holatni o\'zgartirishda xatolik: ' + (err.response?.data?.error || err.message));
    } finally {
      setStatusSubmitting(false);
    }
  };

  // Accept Transfer
  const handleAcceptTransfer = async (dealId: string, storeId: string) => {
    try {
      await axios.post('/api/inventory/transfer/accept', {
        dealIds: [dealId],
        targetStoreId: storeId,
      });
      fetchInventory();
    } catch (err: any) {
      alert('Qabul qilishda xatolik: ' + (err.response?.data?.error || err.message));
    }
  };

  // Inter-store transfer submit
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedForTransfer.length === 0) {
      alert('Ko\'chirish uchun tovarlarni tanlang!');
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
        reason: transferReason,
      });
      setIsTransferModalOpen(false);
      setSelectedForTransfer([]);
      setTransferReason('');
      fetchInventory();
    } catch (err: any) {
      alert('Ko\'chirishda xatolik: ' + (err.response?.data?.error || err.message));
    } finally {
      setTransferring(false);
    }
  };

  // Fast Audit submit
  const handleAddAuditImei = (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditInputImei.trim()) return;
    if (!auditScannedImeis.includes(auditInputImei.trim())) {
      setAuditScannedImeis((prev) => [...prev, auditInputImei.trim()]);
    }
    setAuditInputImei('');
  };

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span>{t('menu.inventory', 'Ombor va Sotuvlar')}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Qurilmalar ombori, Dual IMEI, Prixod skaneri, filiallararo ko'chirish va ulgurji/chakana sotuv
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
        <div className="w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-sm"
          >
            <option value="">{t('common.all_statuses', 'Barcha holatlar')}</option>
            <option value="IN_WAREHOUSE">{t('status.in_warehouse', 'Omborda')}</option>
            <option value="IN_TRANSIT">{t('status.in_transit', 'Yo\'lda')}</option>
            <option value="PENDING">{t('status.pending', 'Kutilmoqda')}</option>
            <option value="SOLD">{t('status.sold', 'Sotilgan')}</option>
            <option value="NEED_TO_BUY">{t('status.need_to_buy', 'Sotib olish kerak')}</option>
          </select>
        </div>
      </div>

      {/* 3D Inventory Table */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm dark:shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/90 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-3.5 text-center">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) setSelectedForTransfer(items.map((it) => it.id));
                      else setSelectedForTransfer([]);
                    }}
                    checked={selectedForTransfer.length === items.length && items.length > 0}
                    className="rounded bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-cyan-500"
                  />
                </th>
                <th className="px-3 py-3.5">№</th>
                <th className="px-3 py-3.5">Sana</th>
                <th className="px-3 py-3.5">Do'kon / Filial</th>
                <th className="px-3 py-3.5">Mahsulot nomi</th>
                <th className="px-3 py-3.5">IMEI / Shtrix</th>
                <th className="px-3 py-3.5 text-center">Holati</th>
                <th className="px-3 py-3.5 text-right">Xarid narxi</th>
                <th className="px-3 py-3.5 text-right">Sotuv narxi</th>
                <th className="px-3 py-3.5 text-right">Sof Foyda</th>
                <th className="px-3 py-3.5 text-right">Marja %</th>
                <th className="px-3 py-3.5">Xaridor</th>
                <th className="px-3 py-3.5 text-center sticky right-0 bg-slate-100/95 dark:bg-slate-950/95 backdrop-blur-md z-10 shadow-sm">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                    Ombor ma'lumotlari yuklanmoqda...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    Omborda mos tovar topilmadi
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const isChecked = selectedForTransfer.includes(it.id);
                  return (
                    <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
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
                        <div className="font-bold text-slate-900 dark:text-white text-xs">{it.productName}</div>
                        {(it.color !== '-' || it.storageGb !== '-') && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                            {it.color !== '-' && <span className="text-cyan-600 dark:text-cyan-300 font-semibold">{it.color}</span>}
                            {it.storageGb !== '-' && <span className="text-purple-600 dark:text-purple-300 font-semibold">{it.storageGb}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div>{it.imeiBarcode}</div>
                        {it.imei2 && it.imei2 !== '-' && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">IMEI 2: {it.imei2}</div>
                        )}
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
                      <td className="px-3 py-3 text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatMoney(it.purchaseCost)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {it.salePrice > 0 ? formatMoney(it.salePrice) : '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {it.profit > 0 ? formatMoney(it.profit) : '-'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {it.marginPct > 0 ? formatPercent(it.marginPct) : '-'}
                      </td>
                      <td className="px-3 py-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                        {it.buyerName}
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap sticky right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 shadow-sm">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Skaner / Prixod tugmasi (Kutilmoqda holatidagi tovarlar uchun) */}
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

                          {/* Omborda turgan tovar uchun Sotish */}
                          {it.status === 'IN_WAREHOUSE' && (
                            <button
                              type="button"
                              onClick={() => handleOpenSell(it)}
                              className="btn-3d py-1.5 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-emerald-600/20 active:translate-y-[1px] transition"
                              title="Tovarni sotish"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Sotish</span>
                            </button>
                          )}

                          {it.status === 'SOLD' && (
                            <span className="text-[11px] font-bold text-emerald-400 px-2">
                              ✓ Sotilgan
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

      {/* Barcode / IMEI Scanner Modal */}
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

      {/* Status Change Modal (Admin with Mandatory Reason) */}
      {statusEditItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Tovar holatini o'zgartirish
                </h3>
                <p className="text-[11px] text-slate-400">
                  Chek №{statusEditItem.dealNumber} - {statusEditItem.productName}
                </p>
              </div>
              <button
                onClick={() => setStatusEditItem(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Yangi holat *
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                >
                  <option value="IN_WAREHOUSE">{t('status.in_warehouse', 'Omborda')}</option>
                  <option value="PENDING">{t('status.pending', 'Kutilmoqda')}</option>
                  <option value="IN_TRANSIT">{t('status.in_transit', 'Yo\'lda')}</option>
                  <option value="SOLD">{t('status.sold', 'Sotilgan')}</option>
                  <option value="NEED_TO_BUY">{t('status.need_to_buy', 'Sotib olish kerak')}</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1 flex items-center justify-between">
                  <span>O'zgartirish sababi (Izoh) *</span>
                  <span className="text-[10px] text-amber-400">(Majburiy)</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Nima sababdan holat o'zgartirilmoqda? (Masalan: Tovar filiali o'zgardi, qaytib keldi...)"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStatusEditItem(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={statusSubmitting}
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl"
                >
                  {statusSubmitting ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Sell Modal with Debt & Override Check */}
      {sellModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Tovarni sotish (Ombordan chiqarish)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  №{sellModalItem.dealNumber} - {sellModalItem.productName}
                </p>
              </div>
              <button
                onClick={() => setSellModalItem(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {saleError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
                {saleError}
              </div>
            )}

            {/* Credit Block Alert */}
            {requiresOverride && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2 animate-shake">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Mijozda {formatMoney(existingDebtNotice)} qoldiq qarz mavjud!</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Ushbu mijozga yangi tovar qarzga chiqarish taqiqlangan. Tovar chiqarish uchun maxsus administrator kodini kiriting:
                </p>
                <input
                  type="password"
                  placeholder="Administrator kodi"
                  value={saleForm.adminOverrideCode}
                  onChange={(e) => setSaleForm({ ...saleForm, adminOverrideCode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-amber-500/50 rounded-xl text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            )}

            <form onSubmit={handleSellSubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Xaridor (Mijoz FISH) *</label>
                <input
                  type="text"
                  required
                  placeholder="Xaridor F.I.O..."
                  value={saleForm.buyerName}
                  onChange={(e) => setSaleForm({ ...saleForm, buyerName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Sotuv narxi (UZS) *</label>
                  <input
                    type="number"
                    required
                    value={saleForm.salePrice}
                    onChange={(e) => setSaleForm({ ...saleForm, salePrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-bold text-emerald-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">To'langan summa *</label>
                  <input
                    type="number"
                    value={saleForm.paidAmount}
                    onChange={(e) => setSaleForm({ ...saleForm, paidAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-bold text-cyan-400 outline-none"
                  />
                </div>
              </div>

              {/* Debt calculation note */}
              {saleForm.salePrice > saleForm.paidAmount && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center justify-between text-[11px]">
                  <span>Qarzga yoziladigan qoldiq:</span>
                  <span className="font-bold text-sm text-rose-400">
                    {formatMoney(saleForm.salePrice - saleForm.paidAmount)}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">To'lov turi</label>
                  <select
                    value={saleForm.paymentType}
                    onChange={(e) => setSaleForm({ ...saleForm, paymentType: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                  >
                    <option value="CASH">Naqd kassa (Cash)</option>
                    <option value="BANK_CARD">Bank kartasi (Karta)</option>
                    <option value="SETTLEMENT">Hisob-raqam</option>
                    <option value="DEBT">To'liq qarzga (Nasiya)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Qarz to'lov muddati</label>
                  <input
                    type="date"
                    value={saleForm.dueDate}
                    onChange={(e) => setSaleForm({ ...saleForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Izoh (Nimaga sotildi)</label>
                <input
                  type="text"
                  placeholder="Sotuv tafsiloti..."
                  value={saleForm.note}
                  onChange={(e) => setSaleForm({ ...saleForm, note: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSellModalItem(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={selling}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:translate-y-[1px] disabled:opacity-50"
                >
                  {selling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Sotildi deb belgilash & Kassaga kiritish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inter-store transfer modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                  <span>Filiallararo Tovar Ko'chirish</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Tanlangan tovarlarni boshqa filial omboriga jo'natish
                </p>
              </div>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-purple-950/40 border border-purple-800/40 text-purple-200 font-semibold">
              Tanlangan tovarlar soni: <b>{selectedForTransfer.length} ta</b>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Qaysi filialga jo'natiladi? *
                </label>
                <select
                  value={targetStoreId}
                  onChange={(e) => setTargetStoreId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Ko'chirish sababi</label>
                <input
                  type="text"
                  placeholder="Masalan: Green Bazar talabi bilan..."
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={transferring || selectedForTransfer.length === 0}
                  className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-lg shadow-purple-600/20 disabled:opacity-50"
                >
                  {transferring ? 'Jo\'natilmoqda...' : 'Jo\'natish (Yo\'lda)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fast Audit (Inventarizatsiya) Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-xs text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-cyan-400" />
                  <span>Tezkor Inventarizatsiya (Audit / Qayta sanash)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Skaner orqali tovarlar IMEI kodlarini ketma-ket o'qiting
                </p>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddAuditImei} className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="IMEI yoki shtrix-kod skanerlang / yozing..."
                value={auditInputImei}
                onChange={(e) => setAuditInputImei(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-800 border border-cyan-500 rounded-xl text-white font-mono text-xs focus:ring-2 focus:ring-cyan-500 outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-cyan-500 text-slate-950 font-bold rounded-xl"
              >
                Qo'shish
              </button>
            </form>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                <span className="text-slate-400 block text-[11px]">Skanerlangan tovarlar:</span>
                <span className="text-xl font-bold text-cyan-400">{auditScannedImeis.length} ta</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
                <span className="text-slate-400 block text-[11px]">Ombordagi jami:</span>
                <span className="text-xl font-bold text-white">{items.length} ta</span>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
              {auditScannedImeis.map((imei, idx) => {
                const matched = items.find((it) => it.imeiBarcode === imei || it.imei2 === imei);
                return (
                  <div
                    key={idx}
                    className="p-2 rounded-xl flex items-center justify-between text-xs bg-slate-900 border border-slate-800"
                  >
                    <span className="font-mono text-cyan-300">{imei}</span>
                    {matched ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{matched.productName}</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Omborda yo'q (Ortiqcha)</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAuditScannedImeis([]);
                  setIsAuditModalOpen(false);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold"
              >
                Tugatish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default InventoryPage;
