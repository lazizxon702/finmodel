import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Edit,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  Layers,
  Sparkles,
  Smartphone,
  ShieldAlert,
  X,
  Package,
  Truck,
  Lock,
  Calculator,
  Calendar,
  RefreshCw,
  Settings,
  Copy,
  Check,
  BookOpen,
  Wallet,
} from 'lucide-react';
import { Deal, Store, Provider, Agency, Agent } from '../types';
import { formatMoney, formatPercent, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { PhoneSelector } from '../components/PhoneSelector';
import { AmountInput } from '../components/AmountInput';

export const DealsPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // References
  const [stores, setStores] = useState<Store[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [daftarFilter, setDaftarFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  // Phone selector state
  const [phoneValid, setPhoneValid] = useState(true);

  // Credit check state
  const [customerDebtAlert, setCustomerDebtAlert] = useState<{ hasDebt: boolean; totalDebt: number } | null>(null);

  // Google Sheets sync state
  const [syncing, setSyncing] = useState(false);
  const [isSyncSettingsOpen, setIsSyncSettingsOpen] = useState(false);
  const [appsScriptUrlInput, setAppsScriptUrlInput] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [syncWebhookUrl, setSyncWebhookUrl] = useState('');

  const fetchSyncStatus = async () => {
    try {
      const res = await axios.get('/api/sync/status');
      if (res.data?.appsScriptUrl) {
        setAppsScriptUrlInput(res.data.appsScriptUrl);
      }
      if (res.data?.webhookUrl) {
        setSyncWebhookUrl(res.data.webhookUrl);
      }
    } catch (e) {}
  };

  const handleSaveSyncConfig = async () => {
    try {
      await axios.post('/api/sync/configure', { appsScriptUrl: appsScriptUrlInput });
      alert('Google Apps Script URL muvaffaqiyatli saqlandi! Endi saytdagi bitimlar avtomatik Google Sheetsga yoziladi.');
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    }
  };

  const appsScriptCode = `/**
 * FinModel ERP <-> Google Sheets 2 tomonlama sinxronizatsiya skripti
 * Ushbu skript Google Sheets va sayt o'rtasida real vaqtda ikki tomonlama aloqa o'rnatadi.
 */

const WEBSITE_WEBHOOK_URL = '${syncWebhookUrl || 'ADMIN_HISOBIDAN_OCHIB_NUSXALANG'}';
const SHEET_NAME = 'Сделки_и_Склад';

// 1. SHEETS -> SAYT: Jadval tahrirlanganda saytga xabar yuborish
function onEdit(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    UrlFetchApp.fetch(WEBSITE_WEBHOOK_URL, { method: 'post', muteHttpExceptions: true });
  } catch (err) {
    Logger.log('onEdit xatolik: ' + err);
  }
}

// 2. SAYT -> SHEETS: Saytdan yangi/yangilangan bitim kelganda jadvalga yozish
function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return ContentService.createTextOutput(JSON.stringify({ error: 'Sheet topilmadi' })).setMimeType(ContentService.MimeType.JSON);
    
    if (contents.action === 'upsert_deal') {
      var d = contents.deal;
      var lastRow = sheet.getLastRow();
      var foundRow = -1;
      if (lastRow >= 3) {
        var dealIds = sheet.getRange(3, 4, lastRow - 2, 1).getValues();
        for (var i = 0; i < dealIds.length; i++) {
          if (dealIds[i][0] == d.dealNumber) { foundRow = i + 3; break; }
        }
      }
      var targetRow = foundRow > 0 ? foundRow : lastRow + 1;
      
      sheet.getRange(targetRow, 4).setValue(d.dealNumber);
      sheet.getRange(targetRow, 5).setValue(d.date);
      sheet.getRange(targetRow, 6).setValue(d.sellerName);
      sheet.getRange(targetRow, 7).setValue(d.providerName);
      sheet.getRange(targetRow, 8).setValue(d.isDaftar);
      sheet.getRange(targetRow, 9).setValue(d.customerName);
      sheet.getRange(targetRow, 10).setValue(d.customerPhone1);
      sheet.getRange(targetRow, 11).setValue(d.customerPhone2);
      sheet.getRange(targetRow, 12).setValue(d.contractUrl);
      sheet.getRange(targetRow, 13).setValue(d.passportPhotoUrl);
      sheet.getRange(targetRow, 14).setValue(d.storeName);
      sheet.getRange(targetRow, 15).setValue(d.customerLimit);
      sheet.getRange(targetRow, 16).setValue(d.withdrawnLimit);
      sheet.getRange(targetRow, 17).setValue(d.agentAmount);
      sheet.getRange(targetRow, 18).setValue(d.totalPurchaseCost);
      sheet.getRange(targetRow, 19).setValue(d.purchaseDiscountPct);
      sheet.getRange(targetRow, 20).setValue(d.agentPct);
      sheet.getRange(targetRow, 21).setValue(d.calculatedAmount);
      sheet.getRange(targetRow, 22).setValue(d.remainingLimit);
      sheet.getRange(targetRow, 23).setValue(d.differenceAmount);
      sheet.getRange(targetRow, 24).setValue(d.productName);
      sheet.getRange(targetRow, 25).setValue(d.quantity);
      sheet.getRange(targetRow, 26).setValue(d.isActualDeviceSale);
      sheet.getRange(targetRow, 27).setValue(d.imeiBarcode);
      sheet.getRange(targetRow, 28).setValue(d.statusText);
      sheet.getRange(targetRow, 29).setValue(d.agencyName);
      sheet.getRange(targetRow, 30).setValue(d.agentName);
      sheet.getRange(targetRow, 31).setValue(d.extraDaftar);
      sheet.getRange(targetRow, 32).setValue(d.qodirDebt);
      sheet.getRange(targetRow, 34).setValue(d.qodirBalance);
      sheet.getRange(targetRow, 35).setValue(d.greenBazarBalance);
      sheet.getRange(targetRow, 36).setValue(d.trustBalance);
      sheet.getRange(targetRow, 37).setValue(d.totalExtraBalance);
      sheet.getRange(targetRow, 38).setValue(d.buyerName);
      sheet.getRange(targetRow, 41).setValue(d.salePrice);
      sheet.getRange(targetRow, 42).setValue(d.paidTransfer);
      sheet.getRange(targetRow, 43).setValue(d.paidCashUzs);
      sheet.getRange(targetRow, 44).setValue(d.paidCashUsd);
      sheet.getRange(targetRow, 45).setValue(d.paidBank);
      sheet.getRange(targetRow, 46).setValue(d.exchangeRate);
      sheet.getRange(targetRow, 47).setValue(d.profit);
      sheet.getRange(targetRow, 48).setValue(d.marginPct);
      sheet.getRange(targetRow, 49).setValue(d.receivedFromBuyer);
      sheet.getRange(targetRow, 50).setValue(d.debtRemainder);
      sheet.getRange(targetRow, 56).setValue(d.paymentStatus);
      sheet.getRange(targetRow, 57).setValue(d.note);
      
      return ContentService.createTextOutput(JSON.stringify({ success: true, dealNumber: d.dealNumber, row: targetRow })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ error: 'Noma\'lum buyruq' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 3000);
  };

  const handleSyncGoogleSheets = async () => {
    try {
      setSyncing(true);
      const res = await axios.post('/api/sync/google-sheets');
      alert(`Muvaffaqiyatli sinxronlandi! ${res.data.count} ta bitim yuklandi (${res.data.dateRange})`);
      fetchDeals();
      fetchTotals();
    } catch (err: any) {
      alert(`Sinxronizatsiyada xatolik: ${err.response?.data?.error || err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Number formatting with spaces helper (1 000 000, 10 000 000)
  const formatSpaced = (val: number | string) => {
    if (val === undefined || val === null || val === '') return '';
    const digits = String(val).replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const parseSpaced = (val: string) => {
    const digits = String(val).replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 0;
  };

  // Discount percentage state for modal calculation (supports decimals like 25.87, 21.43)
  const [discountPercent, setDiscountPercent] = useState<number | string>(30);

  // Multiple devices in 1 check state (Issue 3)
  const [deviceItems, setDeviceItems] = useState<Array<{
    id: string;
    productName: string;
    color: string;
    storageGb: string;
    quantity: number;
    imeiBarcode: string;
    imei2: string;
  }>>([
    { id: '1', productName: '', color: '', storageGb: '', quantity: 1, imeiBarcode: '', imei2: '' },
  ]);

  const updateDeviceItem = (index: number, updates: any) => {
    setDeviceItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      if (index === 0) {
        setFormData((f: any) => ({
          ...f,
          productName: next[0].productName,
          color: next[0].color,
          storageGb: next[0].storageGb,
          imeiBarcode: next[0].imeiBarcode,
          imei2: next[0].imei2,
        }));
      }
      return next;
    });
  };

  const addDeviceItem = () => {
    setDeviceItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        productName: '',
        color: '',
        storageGb: '',
        quantity: 1,
        imeiBarcode: '',
        imei2: '',
      },
    ]);
  };

  const removeDeviceItem = (index: number) => {
    setDeviceItems((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      if (next[0]) {
        setFormData((f: any) => ({
          ...f,
          productName: next[0].productName,
          color: next[0].color,
          storageGb: next[0].storageGb,
          imeiBarcode: next[0].imeiBarcode,
          imei2: next[0].imei2,
        }));
      }
      return next;
    });
  };

  const handleExpenseToDds = async (deal: Deal) => {
    const payout = Number(deal.calculatedAmount || deal.totalPurchaseCost) || 0;
    if (payout <= 0) {
      alert("Ushbu bitimda to'lov summasi 0 ga teng, xarajat kiritilmadi.");
      return;
    }
    const confirmed = window.confirm(
      `№${deal.dealNumber} chek bo'yicha berilgan summa (${formatMoney(payout)})ni DDS kassa chiqimiga (xarajat) kiritishni tasdiqlaysizmi?`
    );
    if (!confirmed) return;

    try {
      const res = await axios.post(`/api/deals/${deal.id}/expense-to-dds`, {
        amount: payout,
        account: 'CASH',
      });
      alert(res.data?.message || "Muvaffaqiyatli DDS xarajatiga o'tkazildi!");
      fetchDeals();
      fetchTotals();
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    }
  };

  // Form state
  const [formData, setFormData] = useState<any>({
    date: new Date().toISOString().slice(0, 10),
    sellerName: 'Durdona',
    providerId: '',
    storeId: '',
    agencyId: '',
    agentId: '',
    customerName: '',
    customerPhone1: '',
    customerPhone2: '',
    customerLimit: 10000000,
    withdrawnLimit: 2800000,
    calculatedAmount: 1960000,
    productName: '',
    color: '',
    storageGb: '',
    quantity: 1,
    imeiBarcode: '',
    imei2: '',
    status: 'PENDING',
    statusChangeReason: '',
    debtDueDate: '',
    adminOverrideCode: '',
    isDaftar: false,
    autoDdsExpense: false,
    note: '',
  });

  useEffect(() => {
    fetchReferences();
  }, []);

  useEffect(() => {
    fetchDeals();
    fetchTotals();
  }, [search, statusFilter, providerFilter, storeFilter, daftarFilter, startDate, endDate, page]);

  useEffect(() => {
    if ((location.state as any)?.newDealFromLead) {
      const leadData = (location.state as any).newDealFromLead;
      setIsModalOpen(true);
      setFormData((prev: any) => ({
        ...prev,
        customerName: leadData.customerName || '',
        customerPhone1: leadData.customerPhone1 || '',
        customerPhone2: leadData.customerPhone2 || '',
        customerLimit: leadData.customerLimit || 10000000,
        withdrawnLimit: leadData.customerLimit ? Math.round(Number(leadData.customerLimit) * 0.28) : 2800000,
      }));
    }
  }, [location.state]);

  const fetchReferences = async () => {
    try {
      const [sRes, pRes, aRes] = await Promise.all([
        axios.get('/api/references/stores'),
        axios.get('/api/references/providers'),
        axios.get('/api/references/agencies'),
      ]);
      setStores(sRes.data || []);
      setProviders(pRes.data || []);
      setAgencies(aRes.data || []);
      if (sRes.data.length > 0 && !formData.storeId) {
        setFormData((prev: any) => ({ ...prev, storeId: sRes.data[0].id }));
      }
      if (pRes.data.length > 0 && !formData.providerId) {
        setFormData((prev: any) => ({ ...prev, providerId: pRes.data[0].id }));
      }
    } catch (err) {
      console.error('Failed to load references:', err);
    }
  };

  const fetchDeals = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (providerFilter) params.append('providerId', providerFilter);
      if (storeFilter) params.append('storeId', storeFilter);
      if (daftarFilter) params.append('daftar', daftarFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('page', String(page));
      params.append('limit', '50');

      const res = await axios.get(`/api/deals?${params.toString()}`);
      setDeals(res.data.deals || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTotals = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (providerFilter) params.append('providerId', providerFilter);
      if (storeFilter) params.append('storeId', storeFilter);
      if (daftarFilter) params.append('daftar', daftarFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await axios.get(`/api/deals/totals?${params.toString()}`);
      setTotals(res.data);
    } catch (err) {
      console.error('Failed to fetch totals:', err);
    }
  };

  // Check customer debt on blur/typing
  const checkCustomerDebt = async (name: string) => {
    if (!name || !name.trim()) {
      setCustomerDebtAlert(null);
      return;
    }
    try {
      const res = await axios.get(`/api/debtors/check-customer?name=${encodeURIComponent(name.trim())}`);
      if (res.data.hasDebt) {
        setCustomerDebtAlert(res.data);
      } else {
        setCustomerDebtAlert(null);
      }
    } catch (e) {
      // ignore
    }
  };

  const handleOpenCreate = () => {
    setEditingDeal(null);
    setCustomerDebtAlert(null);
    setDiscountPercent(30);
    setDeviceItems([
      { id: '1', productName: '', color: '', storageGb: '', quantity: 1, imeiBarcode: '', imei2: '' },
    ]);
    setFormData({
      date: new Date().toISOString().slice(0, 10),
      sellerName: 'Durdona',
      providerId: providers[0]?.id || '',
      storeId: stores[0]?.id || '',
      agencyId: agencies[0]?.id || '',
      agentId: agencies[0]?.agents?.[0]?.id || '',
      customerName: '',
      customerPhone1: '',
      customerPhone2: '',
      customerLimit: 10000000,
      withdrawnLimit: 2800000,
      calculatedAmount: 1960000,
      productName: '',
      color: '',
      storageGb: '',
      quantity: 1,
      imeiBarcode: '',
      imei2: '',
      status: 'PENDING', // Default to PENDING for warehouse arrival
      statusChangeReason: 'Yangi bitim kiritildi (Omborga qabul qilish kutilmoqda)',
      debtDueDate: '',
      adminOverrideCode: '',
      isDaftar: false,
      autoDdsExpense: false,
      note: '',
    });
    setPhoneValid(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setCustomerDebtAlert(null);
    const limit = Number(deal.withdrawnLimit) || 0;
    const calc = Number(deal.calculatedAmount) || 0;
    const computedPct = limit > 0 ? Number(((1 - calc / limit) * 100).toFixed(2)) : 30;
    setDiscountPercent(computedPct);

    if (Array.isArray((deal as any).deviceItems) && (deal as any).deviceItems.length > 0) {
      setDeviceItems(
        (deal as any).deviceItems.map((item: any, idx: number) => ({
          id: String(idx + 1),
          productName: item.productName || '',
          color: item.color || '',
          storageGb: item.storageGb || '',
          quantity: Number(item.quantity) || 1,
          imeiBarcode: item.imeiBarcode || '',
          imei2: item.imei2 || '',
        }))
      );
    } else {
      setDeviceItems([
        {
          id: '1',
          productName: deal.productName || '',
          color: (deal as any).color || '',
          storageGb: (deal as any).storageGb || '',
          quantity: deal.quantity || 1,
          imeiBarcode: deal.imeiBarcode || '',
          imei2: (deal as any).imei2 || '',
        },
      ]);
    }

    setFormData({
      date: deal.date ? new Date(deal.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      sellerName: deal.sellerName,
      providerId: deal.providerId,
      storeId: deal.storeId,
      agencyId: deal.agencyId || '',
      agentId: deal.agentId || '',
      customerName: deal.customerName || '',
      customerPhone1: deal.customerPhone1 || '',
      customerPhone2: deal.customerPhone2 || '',
      customerLimit: Number(deal.customerLimit),
      withdrawnLimit: Number(deal.withdrawnLimit),
      calculatedAmount: Number(deal.calculatedAmount),
      productName: deal.productName || '',
      color: (deal as any).color || '',
      storageGb: (deal as any).storageGb || '',
      quantity: deal.quantity,
      imeiBarcode: deal.imeiBarcode || '',
      imei2: (deal as any).imei2 || '',
      status: deal.status,
      statusChangeReason: (deal as any).statusChangeReason || '',
      debtDueDate: (deal as any).debtDueDate || '',
      adminOverrideCode: '',
      isDaftar: deal.isDaftar,
      autoDdsExpense: false,
      salePrice: Number(deal.salePrice) || 0,
      receivedFromBuyer: Number(deal.receivedFromBuyer) || 0,
      note: deal.note || '',
    });
    setPhoneValid(true);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate that at least one device is selected
    const validDevices = deviceItems.filter((d) => d.productName && d.productName.trim());
    if (validDevices.length === 0 && !formData.productName?.trim()) {
      alert("Iltimos, kamida bitta telefon rusumi, rangi va xotirasini tanlang!");
      return;
    }

    // Validate status change reason if status was changed in edit
    if (editingDeal && formData.status !== editingDeal.status) {
      if (!formData.statusChangeReason || !formData.statusChangeReason.trim()) {
        alert("Holatni o'zgartirish sababi (izoh) kiritilishi shart!");
        return;
      }
    }

    // Validate credit override if customer has debt
    if (customerDebtAlert?.hasDebt) {
      // Kod serverda tekshiriladi — brauzer kodida saqlanmaydi
      let overrideOk = false;
      if (formData.adminOverrideCode?.trim()) {
        try {
          const vr = await axios.post('/api/auth/verify-override', { code: formData.adminOverrideCode });
          overrideOk = !!vr.data?.valid;
        } catch {
          overrideOk = false;
        }
      }
      if (!overrideOk) {
        alert(
          `Ushbu mijozda ${formatMoney(customerDebtAlert.totalDebt)} qoldiq qarz mavjud! Tovar chiqarish uchun to'g'ri administrator kodini kiriting.`
        );
        return;
      }
    }

    const primaryDevice = validDevices[0] || deviceItems[0] || {
      productName: formData.productName,
      color: formData.color,
      storageGb: formData.storageGb,
      quantity: 1,
      imeiBarcode: formData.imeiBarcode,
      imei2: formData.imei2,
    };
    const totalQty = deviceItems.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);

    const payload = {
      ...formData,
      deviceItems: validDevices.length > 0 ? validDevices : deviceItems,
      productName: primaryDevice.productName || formData.productName,
      color: primaryDevice.color || formData.color,
      storageGb: primaryDevice.storageGb || formData.storageGb,
      imeiBarcode: primaryDevice.imeiBarcode || formData.imeiBarcode,
      imei2: primaryDevice.imei2 || formData.imei2,
      quantity: totalQty,
      isDaftar: Boolean(formData.isDaftar),
      autoDdsExpense: Boolean(formData.autoDdsExpense),
      date: formData.date ? `${formData.date}T12:00:00+05:00` : undefined,
      customerName: formData.customerName?.trim() || 'Mijoz',
      customerPhone1: formData.customerPhone1?.trim() || '-',
    };

    try {
      if (editingDeal) {
        await axios.put(`/api/deals/${editingDeal.id}`, payload);
      } else {
        await axios.post('/api/deals', payload);
      }
      setIsModalOpen(false);
      fetchDeals();
      fetchTotals();
    } catch (err: any) {
      alert('Xatolik yuz berdi: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('common.confirm_delete', 'Haqiqatan ham bu bitimni o\'chirmoqchimisiz?'))) return;
    try {
      await axios.delete(`/api/deals/${id}`);
      fetchDeals();
      fetchTotals();
    } catch (err: any) {
      alert('O\'chirishda xatolik: ' + (err.response?.data?.error || err.message));
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'IN_WAREHOUSE':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            <Package className="w-3 h-3 text-cyan-400" />
            <span>{t('status.in_warehouse', 'Omborda')}</span>
          </span>
        );
      case 'IN_TRANSIT':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
            <Truck className="w-3 h-3 text-purple-400" />
            <span>{t('status.in_transit', 'Yo\'lda')}</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>{t('status.pending', 'Kutilmoqda')}</span>
          </span>
        );
      case 'SOLD':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>{t('status.sold', 'Sotilgan')}</span>
          </span>
        );
      case 'NEED_TO_BUY':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            <span>{t('status.need_to_buy', 'Sotib olish kerak')}</span>
          </span>
        );
      case 'MONEY_RECEIVED':
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/30">
            <span>{t('status.money_received', 'Pul tushdi')}</span>
          </span>
        );
      default:
        return (
          <span className="pill-3d inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  // Dynamic KPI Banner calculations (Itogo, Kalichestvo, O'rtacha chek, O'rtacha diskont %, Qodir chek xarajati)
  const kpiCount = totals?.dealCount ?? deals.length;
  const kpiTotalLimit = totals?.totalLimit ?? deals.reduce((s, d) => s + (Number(d.withdrawnLimit) || 0), 0);
  const kpiAvgCheck = kpiCount > 0 ? Math.round(kpiTotalLimit / kpiCount) : 0;
  const kpiAvgDiscount = totals?.avgDiscountPct ?? (
    deals.length > 0 ? deals.reduce((s, d) => s + (Number(d.purchaseDiscountPct) || 0), 0) / deals.length : 0
  );
  const kpiTotalPurchase = totals?.totalPurchaseCost ?? deals.reduce((s, d) => s + (Number(d.totalPurchaseCost) || 0), 0);
  const kpiTotalProfit = totals?.totalProfit ?? deals.reduce((s, d) => s + (Number(d.profit) || 0), 0);
  const kpiQodirChekExpense = totals?.totalQodirChekExpense ?? deals
    .filter((d) => (d.store?.name || '').toLowerCase().includes('qodir'))
    .reduce((s, d) => s + (Number(d.calculatedAmount) || 0) + (Number(d.agentAmount) || 0), 0);

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span>{t('deals.title', 'Bitimlar va Ombor Jadvali')}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t(
              'deals.subtitle',
              'Mijoz muddatli to\'lov limitlari, agent komissiyasi, tannarx va hisoblangan summalar'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleSyncGoogleSheets}
            disabled={syncing}
            className="btn-3d py-2.5 px-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-xs flex items-center gap-1.5 shadow-lg shadow-blue-500/20 active:translate-y-[1px] transition disabled:opacity-50"
            title="Google Sheets-dagi 'Сделки_и_Склад' varag'idan barcha ma'lumotlarni sinxronlash"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Sinxronlanmoqda...' : 'Google Sheets sinxronlash'}</span>
          </button>

          <button
            onClick={() => {
              fetchSyncStatus();
              setIsSyncSettingsOpen(true);
            }}
            className="btn-3d py-2.5 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl text-xs flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 transition"
            title="Google Sheets 2 tomonlama ulanish sozlamalari"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Sheets Sozlamalari</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="btn-3d py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:translate-y-[1px] transition"
          >
            <Plus className="w-4 h-4" />
            <span>{t('deals.add_deal', 'Yangi bitim qo\'shish')}</span>
          </button>
        </div>
      </div>

      {/* Dynamic KPI Summary Banner with Qodir aka Cheklar Xarajati */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 w-full">
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Jami Limit (Itogo)
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
            {formatMoney(kpiTotalLimit)}
          </p>
          <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">Umumiy hajm</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Soni (Kolichestvo)
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
            {kpiCount} ta
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Barcha bitimlar</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            O'rtacha Chek
          </span>
          <p className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
            {formatMoney(kpiAvgCheck)}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">1 bitim limiti</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider block">
            O'rtacha Diskont %
          </span>
          <p className="text-base sm:text-lg font-black text-purple-600 dark:text-purple-400 mt-1">
            {formatPercent(kpiAvgDiscount)}
          </p>
          <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80 font-medium">Tranzaksiyaga nisbatan</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
            Qodir Chek Xarajati
          </span>
          <p className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
            {formatMoney(kpiQodirChekExpense)}
          </p>
          <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-semibold">Ҳисоб + Агент суммаси</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            Jami Xarid Xarajati
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1">
            {formatMoney(kpiTotalPurchase)}
          </p>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Tannarx qiymati</span>
        </div>

        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm dark:shadow-md">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Jami Sof Foyda
          </span>
          <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {formatMoney(kpiTotalProfit)}
          </p>
          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 font-medium">5% bonus qo'shilgan</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-3xl space-y-3 shadow-sm dark:shadow-xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder={t('common.search', 'Qidiruv: ID, mijoz, tel, tovar...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-inner"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('common.all_statuses', 'Barcha holatlar')}</option>
            <option value="IN_WAREHOUSE" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('status.in_warehouse', 'Omborda')}</option>
            <option value="SOLD" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('status.sold', 'Sotilgan')}</option>
            <option value="IN_TRANSIT" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('status.in_transit', 'Yo\'lda')}</option>
            <option value="PENDING" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('status.pending', 'Kutilmoqda')}</option>
            <option value="NEED_TO_BUY" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('status.need_to_buy', 'Sotib olish kerak')}</option>
            <option value="MONEY_RECEIVED" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('status.money_received', 'Pul tushdi')}</option>
          </select>

          {/* Provider filter */}
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('common.all_providers', 'Barcha provayderlar')}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                {p.name}
              </option>
            ))}
          </select>

          {/* Store filter */}
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{t('common.all_stores', 'Barcha do\'konlar')}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                {s.name}
              </option>
            ))}
          </select>

          {/* Daftar filter */}
          <select
            value={daftarFilter}
            onChange={(e) => setDaftarFilter(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-sm"
          >
            <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Daftar: Barchasi</option>
            <option value="true" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Faqat Daftar (Ha)</option>
            <option value="false" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Oddiy (Daftarsiz)</option>
          </select>

          {/* Clear button */}
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setProviderFilter('');
              setStoreFilter('');
              setDaftarFilter('');
              setStartDate('');
              setEndDate('');
            }}
            className="btn-3d flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-bold transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('common.clear_filter', 'Filtrni tozalash')}</span>
          </button>
        </div>

        {/* Date Range Filter Row */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shrink-0">
              <Calendar className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>Sana / Chek oralig'i:</span>
            </span>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-inner">
              <span className="text-[11px] font-semibold text-slate-500">Dan:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-slate-900 dark:text-white text-xs outline-none cursor-pointer font-medium"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shadow-inner">
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

          {/* Quick Date Range Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                setStartDate(today);
                setEndDate(today);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                startDate === new Date().toISOString().slice(0, 10) && endDate === new Date().toISOString().slice(0, 10)
                  ? 'bg-cyan-600 text-white border-cyan-500 shadow-sm'
                  : 'bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
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
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition"
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
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition"
            >
              Oxirgi 7 kun
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
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-cyan-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition"
            >
              Shu oy
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm dark:shadow-xl overflow-hidden flex flex-col">
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-cyan-600 dark:text-cyan-400">{deals.length} ta bitim</span>
        </div>
        <div className="table-scroll-container custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="table-sticky-head bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 shadow-sm">
              <tr>
                <th className="px-3 py-3.5 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">№</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.date', 'Sana')}</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.seller', 'Sotuvchi')}</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.provider', 'Bank / Provayder')}</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">Daftar</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.store', 'Do\'kon / Hamkor')}</th>
                <th className="px-3 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.withdrawn_limit', 'Yechilgan limit')}</th>
                <th className="px-3 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.customer_payment', 'Mijozga to\'lov')}</th>
                <th className="px-3 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.agent_commission', 'Agent komissiyasi')}</th>
                <th className="px-3 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.purchase_cost', 'Xarid xarajati')}</th>
                <th className="px-3 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.discount_pct', 'Diskont %')}</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.product_name', 'Mahsulot nomi')}</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.imei_barcode', 'IMEI / Shtrix')}</th>
                <th className="px-3 py-3.5 text-center bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.status', 'Holat')}</th>
                <th className="px-3 py-3.5 bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.agency', 'Agentlik')}</th>
                <th className="px-3 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.sale_price', 'Sotuv narxi')}</th>
                <th className="px-3 py-3.5 text-right bg-slate-100 dark:bg-slate-950 whitespace-nowrap">{t('common.profit', 'Sof foyda')}</th>
                <th className="px-3 py-3.5 text-center sticky right-0 top-0 bg-slate-100 dark:bg-slate-950 z-30 shadow-md whitespace-nowrap">
                  {t('common.actions', 'Amallar')}
                </th>
              </tr>
            </thead>

            {/* Total Summary Row (Sticky right below the header) */}
            <tbody className="table-sticky-summary bg-emerald-100 dark:bg-emerald-950 font-bold border-b border-emerald-300 dark:border-emerald-800 shadow-sm text-emerald-900 dark:text-emerald-200">
              <tr>
                <td className="px-3 py-2.5 text-center text-[11px] bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap" colSpan={6}>
                  {t('common.total_row', 'JAMI YIG\'INDI')}:
                </td>
                <td className="px-3 py-2.5 text-right font-black text-slate-900 dark:text-white bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap">{formatMoney(totals?.totalWithdrawn)}</td>
                <td className="px-3 py-2.5 text-right font-black text-cyan-800 dark:text-cyan-300 bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap">{formatMoney(totals?.totalCalculatedAmount)}</td>
                <td className="px-3 py-2.5 text-right font-black text-purple-800 dark:text-purple-300 bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap">{formatMoney(totals?.totalAgentAmount)}</td>
                <td className="px-3 py-2.5 text-right font-black text-slate-900 dark:text-white bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap">{formatMoney(totals?.totalPurchaseCost)}</td>
                <td className="px-3 py-2.5 text-right bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap">-</td>
                <td className="px-3 py-2.5 bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap" colSpan={4}></td>
                <td className="px-3 py-2.5 text-right font-black text-slate-900 dark:text-white bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap">{formatMoney(totals?.totalSalePrice)}</td>
                <td className="px-3 py-2.5 text-right font-black text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 whitespace-nowrap">{formatMoney(totals?.totalProfit)}</td>
                <td className="px-3 py-2.5 sticky right-0 bg-emerald-100 dark:bg-emerald-950 z-25 shadow-md"></td>
              </tr>
            </tbody>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={18} className="py-12 text-center text-slate-400">
                    <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                    Ma'lumotlar yuklanmoqda...
                  </td>
                </tr>
              ) : deals.length === 0 ? (
                <tr>
                  <td colSpan={18} className="py-12 text-center text-slate-400">
                    Hech qanday bitim topilmadi
                  </td>
                </tr>
              ) : (
                deals.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="px-3 py-2.5 text-center font-bold text-cyan-600 dark:text-cyan-400">
                      №{d.dealNumber}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">{formatDate(d.date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{d.sellerName}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{d.provider?.name || '-'}</td>
                    <td className="px-3 py-2.5">
                      {d.isDaftar ? (
                        <div className="inline-flex flex-col">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                            Ha (Daftar)
                          </span>
                          {Number(d.extraDaftar) > 0 && (
                            <span className="text-[9px] font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                              +{formatMoney(d.extraDaftar)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">Yo'q</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                      <div>{d.store?.name || '-'}</div>
                      {(d.store?.name || '').toLowerCase().includes('qodir') && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 mt-0.5" title="Qodir aka chek xarajati: Hisob + Agent">
                          Чек: {formatMoney(Number(d.calculatedAmount) + Number(d.agentAmount))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-900 dark:text-white">{formatMoney(d.withdrawnLimit)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-cyan-700 dark:text-cyan-300">{formatMoney(d.calculatedAmount)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-purple-700 dark:text-purple-300">{formatMoney(d.agentAmount)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-300">{formatMoney(d.totalPurchaseCost)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-500 dark:text-slate-400">{formatPercent(d.purchaseDiscountPct)}</td>
                    <td className="px-3 py-2.5 max-w-[200px]" title={d.productName || ''}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 dark:text-white truncate">{d.productName || '-'}</span>
                        {Array.isArray((d as any).deviceItems) && (d as any).deviceItems.length > 1 && (
                          <span
                            className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 shrink-0 border border-cyan-500/30"
                            title={`${(d as any).deviceItems.length} ta qurilma biriktirilgan`}
                          >
                            {(d as any).deviceItems.length} ta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-[130px] truncate" title={d.imeiBarcode || ''}>
                      {d.imeiBarcode || '-'}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {renderStatusBadge(d.status)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{d.agency?.name || '-'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-white">{formatMoney(d.salePrice)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(d.profit)}</td>
                    <td className="px-3 py-2.5 text-center sticky right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10 shadow-sm">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleExpenseToDds(d)}
                          title="Mijozga berilgan summani DDS da xarajat (chiqim) qilish"
                          className="p-1.5 rounded-xl text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/15 transition"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(d)}
                          title={t('common.edit', 'Tahrirlash')}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(d.id)}
                          title={t('common.delete', 'O\'chirish')}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            {t('common.total', 'Jami')}: <b>{totals?.dealCount || 0} ta</b> bitim
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded-xl border border-slate-700 disabled:opacity-40 hover:bg-slate-800"
            >
              Oldingi
            </button>
            <span>
              Sahifa {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-xl border border-slate-700 disabled:opacity-40 hover:bg-slate-800"
            >
              Keyingi
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Modal with PhoneSelector & Debtor Check */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full sm:max-w-3xl bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[94vh] sm:h-auto sm:max-h-[92vh] text-xs text-slate-200">
            {/* Header */}
            <div className="px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>
                  {editingDeal
                    ? `№${editingDeal.dealNumber} - Bitimni tahrirlash`
                    : t('deals.add_deal', 'Yangi bitim qo\'shish')}
                </span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {/* Bitim / Chek Sanasi & Sotuvchi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Bitim / Chek Sanasi *</span>
                  </label>
                  <input
                    type="date"
                    value={formData.date ? formData.date.slice(0, 10) : ''}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500 font-medium cursor-pointer"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    {t('common.seller', 'Sotuvchi')} *
                  </label>
                  <input
                    type="text"
                    value={formData.sellerName}
                    onChange={(e) => setFormData({ ...formData, sellerName: e.target.value })}
                    placeholder="Sotuvchi ismi..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
                    required
                  />
                </div>
              </div>

              {/* Provider & Store */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    {t('common.provider', 'Bank / Provayder')} *
                  </label>
                  <select
                    value={formData.providerId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      const selectedProv = providers.find((pr) => pr.id === pId);
                      setFormData((prev: any) => ({
                        ...prev,
                        providerId: pId,
                        isDaftar: selectedProv?.isDaftarDefault !== undefined ? selectedProv.isDaftarDefault : prev.isDaftar,
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    {t('common.store', 'Do\'kon / Hamkor')} *
                  </label>
                  <select
                    value={formData.storeId}
                    onChange={(e) => setFormData({ ...formData, storeId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* DAFTAR TUGMASI (Ha / Yo'q) */}
              <div className={`p-3 rounded-2xl border transition-all ${
                formData.isDaftar
                  ? 'bg-amber-500/15 border-amber-500/40 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-800/40 border-slate-700/60'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      formData.isDaftar
                        ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-white text-xs">Daftar:</span>
                        {formData.isDaftar ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 tracking-wide uppercase shadow-sm">
                            ✓ Ha (Daftarga tushadi)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            Yo'q (Oddiy bitim)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formData.isDaftar
                          ? 'Ushbu bitim ombordagi Daftar toifasiga va hisobotlarga yoziladi'
                          : 'Daftarga tushmaydi, standart tovar hisobida yuradi'}
                      </p>
                    </div>
                  </div>

                  {/* Ha / Yo'q tanlash tugmalari */}
                  <div className="flex items-center p-1 bg-slate-950/80 border border-slate-700 rounded-xl shrink-0 self-start sm:self-auto gap-1">
                    <button
                      type="button"
                      onClick={() => setFormData((prev: any) => ({ ...prev, isDaftar: false }))}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        !formData.isDaftar
                          ? 'bg-slate-700 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <span>Yo'q</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev: any) => ({ ...prev, isDaftar: true }))}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                        formData.isDaftar
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 scale-105 font-black'
                          : 'text-slate-400 hover:text-amber-300'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Ha</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    Mijoz F.I.O. (Ixtiyoriy)
                  </label>
                  <input
                    type="text"
                    placeholder="Mijoz ismi va familiyasi (ixtiyoriy)..."
                    value={formData.customerName}
                    onChange={(e) => {
                      setFormData({ ...formData, customerName: e.target.value });
                    }}
                    onBlur={(e) => checkCustomerDebt(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Telefon raqam (Ixtiyoriy)</label>
                  <input
                    type="text"
                    placeholder="+998 90 123 45 67"
                    value={formData.customerPhone1}
                    onChange={(e) => setFormData({ ...formData, customerPhone1: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Customer Debt Warning Alert */}
              {customerDebtAlert?.hasDebt && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2 animate-shake">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>
                      Diqqat! Ushbu mijozda {formatMoney(customerDebtAlert.totalDebt)} qoldiq qarzdorlik mavjud!
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Qarzdorga yangi tovar yoki muddatli to'lov ochish bloklangan. Davom etish uchun maxsus administrator kodini kiriting:
                  </p>
                  <input
                    type="password"
                    placeholder="Administrator kodi"
                    value={formData.adminOverrideCode}
                    onChange={(e) => setFormData({ ...formData, adminOverrideCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-amber-500/50 rounded-xl text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              )}

              {/* Limits and Calculations with Space-Formatting and Percentage Selector */}
              <div className="space-y-2 p-3 bg-slate-800/40 border border-slate-800 rounded-2xl">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Mijoz umumiy limiti</label>
                    <AmountInput
                      value={formData.customerLimit}
                      onChange={(val) => setFormData({ ...formData, customerLimit: val })}
                      placeholder="10 000 000"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-bold text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1 text-emerald-400">
                      Yechilgan limit (UZS) *
                    </label>
                    <AmountInput
                      required
                      value={formData.withdrawnLimit}
                      onChange={(val) => {
                        const numPct = parseFloat(String(discountPercent).replace(',', '.')) || 0;
                        const calculated = Math.round(val * (1 - numPct / 100));
                        setFormData({
                          ...formData,
                          withdrawnLimit: val,
                          calculatedAmount: calculated,
                        });
                      }}
                      placeholder="2 800 000"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-emerald-400 font-bold text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1 text-cyan-400 flex items-center justify-between">
                      <span>Mijozga to'lov (Avto)</span>
                      <Lock className="w-3.5 h-3.5 text-cyan-400" />
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={formatSpaced(formData.calculatedAmount) + ' UZS'}
                        className="w-full px-3 py-2 bg-slate-900 border border-cyan-500/50 rounded-xl text-cyan-400 font-extrabold text-xs outline-none cursor-not-allowed select-none shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                {/* Qodir aka Chek Xarajati Live Indicator */}
                {stores.find(s => s.id === formData.storeId)?.name?.toLowerCase().includes('qodir') && (
                  <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
                    <div>
                      <span className="font-bold block">🧾 Qodir aka chek uchun xarajatli summa:</span>
                      <span className="text-[11px] text-slate-300">Hisob summasi ({formatMoney(formData.calculatedAmount)}) + Agent komissiyasi</span>
                    </div>
                    <span className="text-sm font-black text-amber-400">
                      {formatMoney(Number(formData.calculatedAmount) + Number(formData.withdrawnLimit * 0.05))} UZS
                    </span>
                  </div>
                )}

                {/* Percentage Chips Selector */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-700/60">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1 flex items-center gap-1">
                    <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                    Mijozga berish foizi / Diskont:
                  </span>
                  {[20, 25, 28, 30, 33, 35, 40].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setDiscountPercent(pct);
                        const calculated = Math.round(formData.withdrawnLimit * (1 - pct / 100));
                        setFormData((prev: any) => ({
                          ...prev,
                          calculatedAmount: calculated,
                        }));
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all ${
                        Number(discountPercent) === pct
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md scale-105'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[10px] text-slate-400">Boshqa %:</span>
                    <input
                      type="number"
                      step="any"
                      min={0}
                      max={100}
                      onFocus={(e) => e.target.select()}
                      value={discountPercent}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setDiscountPercent(raw);
                        const parsed = parseFloat(String(raw).replace(',', '.')) || 0;
                        const calculated = Math.round(formData.withdrawnLimit * (1 - parsed / 100));
                        setFormData((prev: any) => ({
                          ...prev,
                          calculatedAmount: calculated,
                        }));
                      }}
                      className="w-20 px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold text-[11px] text-center focus:ring-1 focus:ring-emerald-500 outline-none"
                    />
                    <span className="text-slate-400 text-xs font-bold">%</span>
                  </div>
                </div>
              </div>

              {/* Auto DDS Expense toggle (Issue 1: Berilgan summani xarajat qilish) */}
              <div className={`p-3.5 rounded-2xl border transition-all ${
                formData.autoDdsExpense
                  ? 'bg-emerald-500/15 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-800/40 border-slate-700/60'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                      formData.autoDdsExpense ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-400'
                    }`}>
                      <Wallet className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-white text-xs block">
                        Berilgan summani DDS da xarajat (chiqim) qilish
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {formData.autoDdsExpense
                          ? `Chek saqlanganda ${formatMoney(formData.calculatedAmount)} avtomatik kassa chiqimiga kiritiladi`
                          : "DDS kassa xarajatiga avtomatik yozilmaydi"}
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.autoDdsExpense)}
                      onChange={(e) => setFormData({ ...formData, autoDdsExpense: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>

              {/* 1 TA CHEKDA BIR NECHTA QURILMA QO'SHISH (Issue 3) */}
              <div className="space-y-3.5 p-3.5 bg-slate-800/40 border border-slate-700/60 rounded-2xl">
                <div className="flex items-center justify-between pb-2 border-b border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-white text-xs">
                      Qurilmalar ({deviceItems.length} ta)
                    </span>
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      (1 ta chekda bir nechta qurilma qo'shish)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addDeviceItem}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-500/20 transition active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Yana qurilma qo'shish</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {deviceItems.map((dev, idx) => (
                    <div
                      key={dev.id}
                      className="p-3 bg-slate-900/80 border border-slate-700/80 rounded-2xl relative space-y-2.5"
                    >
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                        <span className="text-xs font-extrabold text-cyan-400 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span>{idx + 1}-qurilma</span>
                          {dev.productName && (
                            <span className="text-slate-400 font-medium">({dev.productName} {dev.storageGb} {dev.color})</span>
                          )}
                        </span>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 font-bold">Soni:</span>
                            <input
                              type="number"
                              min={1}
                              value={dev.quantity || 1}
                              onChange={(e) => updateDeviceItem(idx, { quantity: parseInt(e.target.value, 10) || 1 })}
                              className="w-14 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold text-xs text-center outline-none"
                            />
                          </div>
                          {deviceItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDeviceItem(idx)}
                              className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 transition"
                              title="Qurilmani o'chirish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <PhoneSelector
                        initialValue={dev.productName}
                        initialColor={dev.color}
                        initialStorage={dev.storageGb}
                        onChange={(res) => {
                          updateDeviceItem(idx, {
                            productName: res.productName,
                            color: res.color,
                            storageGb: res.storageGb,
                          });
                          if (idx === 0) setPhoneValid(res.isValid);
                        }}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">IMEI 1 / Shtrix-kod</label>
                          <input
                            type="text"
                            placeholder="352887831..."
                            value={dev.imeiBarcode}
                            onChange={(e) => updateDeviceItem(idx, { imeiBarcode: e.target.value })}
                            className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-xs outline-none focus:ring-1 focus:ring-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">IMEI 2 (Dual SIM)</label>
                          <input
                            type="text"
                            placeholder="352887832..."
                            value={dev.imei2}
                            onChange={(e) => updateDeviceItem(idx, { imei2: e.target.value })}
                            className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white font-mono text-xs outline-none focus:ring-1 focus:ring-cyan-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status and Reason */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">
                    {t('common.status', 'Tovar holati')} *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="PENDING">{t('status.pending', 'Kutilmoqda')}</option>
                    <option value="IN_WAREHOUSE">{t('status.in_warehouse', 'Omborda')}</option>
                    <option value="NEED_TO_BUY">{t('status.need_to_buy', 'Sotib olish kerak')}</option>
                    <option value="IN_TRANSIT">{t('status.in_transit', 'Yo\'lda')}</option>
                    <option value="SOLD">{t('status.sold', 'Sotilgan')}</option>
                    <option value="MONEY_RECEIVED">{t('status.money_received', 'Pul tushdi')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Holat izohi / Sababi</span>
                    {editingDeal && formData.status !== editingDeal.status && (
                      <span className="text-[10px] text-amber-400 font-bold">(Majburiy)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder="Holat haqida izoh..."
                    value={formData.statusChangeReason}
                    onChange={(e) => setFormData({ ...formData, statusChangeReason: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                  />
                </div>
              </div>

              {/* Agency and Seller */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">{t('common.agency', 'Agentlik')}</label>
                  <select
                    value={formData.agencyId}
                    onChange={(e) => setFormData({ ...formData, agencyId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                  >
                    <option value="">Agentliksiz</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-300 mb-1">{t('common.seller', 'Sotuvchi ismi')}</label>
                  <input
                    type="text"
                    value={formData.sellerName}
                    onChange={(e) => setFormData({ ...formData, sellerName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">Izoh (Qo'shimcha ma'lumot)</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs outline-none"
                  rows={2}
                />
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
                >
                  {t('common.cancel', 'Bekor qilish')}
                </button>
                <button
                  type="submit"
                  className="btn-3d px-5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 active:translate-y-[1px]"
                >
                  {t('common.save', 'Saqlash')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Google Sheets 2-Way Sync Settings Modal */}
      {isSyncSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Google Sheets 2 tomonlama doimiy bog'lanish
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sheets'dan saytga va saytdan Sheets'ga avtomatik real-vaqt sinxronizatsiya
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSyncSettingsOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Sheet info */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Ulangan Google Sheets:</span>
                <a
                  href="https://docs.google.com/spreadsheets/d/1Xas4V79zUAOQGx0ZePPd-VwhhARE3-nsq98rL9vEvUo/edit?usp=sharing"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>Jadvalni ochish</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Varaq nomi: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">Сделки_и_Склад</span>
              </p>
            </div>

            {/* Step 2: Apps Script Web App URL */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                1. Google Apps Script Web App URL (Saytdan Sheetsga yozish uchun):
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={appsScriptUrlInput}
                  onChange={(e) => setAppsScriptUrlInput(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSaveSyncConfig}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-md transition"
                >
                  Saqlash
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Pastdagi skriptni Google Sheets-ga joylab <strong>Web app</strong> sifatida chiqarganingizda beriladigan URL.
              </p>
            </div>

            {/* Step 3: Google Apps Script Code */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  2. Google Apps Script kodi (Google Sheets menyusi: <em>Расширения &rarr; Apps Script</em>):
                </label>
                <button
                  type="button"
                  onClick={copyScriptToClipboard}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 transition"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? 'Nusxalandi!' : 'Kodni nusxalash'}</span>
                </button>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 max-h-48 overflow-y-auto text-[11px] font-mono text-emerald-400">
                <pre>{appsScriptCode}</pre>
              </div>
            </div>

            {/* Step 4: Quick guide */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 space-y-1.5">
              <p className="font-bold">O'rnatish tartibi (3 daqiqa):</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-blue-800 dark:text-blue-300">
                <li>Google Sheets jadvalingizda yuqoridagi menyudan <strong>Расширения (Extensions) &rarr; Apps Script</strong> ga kiring.</li>
                <li>U yerga yuqoridagi kodni qo'ying va saqlang (Ctrl+S).</li>
                <li>Yuqoridagi <strong>Начать развертывание (Deploy) &rarr; Новое развертывание (New deployment)</strong> tugmasini bosing.</li>
                <li>Turini <strong>Веб-приложение (Web app)</strong> tanlang. <em>«У кого есть доступ» (Who has access)</em> bandida <strong>«Все» (Anyone)</strong> ni tanlang va Deploy qiling.</li>
                <li>Berilgan Web app URL manzilini nusxalab, tepada joylashgan maydonga qo'yib <strong>«Saqlash»</strong> ni bosing.</li>
              </ol>
            </div>

            <div className="pt-2 flex justify-between items-center border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleSyncGoogleSheets}
                disabled={syncing}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-md transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>Hozir to'liq sinxronlash</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSyncSettingsOpen(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition"
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
export default DealsPage;
