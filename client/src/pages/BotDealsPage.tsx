import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Bot, CheckCircle, Clock, ExternalLink, Search, RefreshCw, 
  ArrowRight, ShieldCheck, AlertCircle, Phone, Smartphone, FileText, Trash2
} from 'lucide-react';
import { formatMoney, formatDateTime } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';

interface BotDeal {
  id: string;
  checkNumber?: number;
  dateTime: string;
  telegramUserId: string | null;
  telegramUsername: string | null;
  sellerName: string | null;
  providerName: string | null;
  isDaftar: boolean;
  customerName: string;
  customerPhone1: string;
  customerPhone2: string | null;
  contractUrl: string | null;
  passportPhotoUrl: string | null;
  storeName: string | null;
  customerLimit: number;
  withdrawnLimit: number;
  productName: string | null;
  quantity: number;
  imeiBarcode: string | null;
  status: string;
  agencyName: string | null;
  agentName: string | null;
  isApproved: boolean;
  createdAt: string;
  payments: any[];
}

export const BotDealsPage: React.FC = () => {
  const { t } = useTranslation();
  const [deals, setDeals] = useState<BotDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchDeals = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/bot/deals');
      setDeals(res.data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Bot bitimlarini yuklab bo\'lmadi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeals();
  }, []);

  const handleApprove = async (id: string) => {
    if (!window.confirm('Haqiqatan ham bu bitimni asosiy "Bitimlar" jadvaliga o\'tkazmoqchimisiz?')) return;
    try {
      setApprovingId(id);
      setErrorMsg('');
      const res = await axios.post(`/api/bot/deals/${id}/approve`);
      setSuccessMsg(`Bitim muvaffaqiyatli asosiy jadvalga o'tkazildi (Bitim #${res.data.mainDeal.dealNumber})`);
      fetchDeals();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || 'Bitimni tasdiqlashda xatolik yuz berdi');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async (id: string, checkNumber?: number) => {
    const numText = checkNumber ? `№${checkNumber} ` : '';
    if (!window.confirm(`Haqiqatan ham bu bot bitimini (Chek ${numText}) va unga bog'langan to'lovlarni butunlay o'chirmoqchimisiz?`)) {
      return;
    }
    try {
      setDeletingId(id);
      setErrorMsg('');
      const res = await axios.delete(`/api/bot/deals/${id}`);
      setSuccessMsg(res.data.message || 'Bitim muvaffaqiyatli o\'chirildi');
      fetchDeals();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || 'Bitimni o\'chirishda xatolik yuz berdi');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDeals = deals.filter(d => {
    const s = search.toLowerCase();
    const matchSearch = 
      d.customerName.toLowerCase().includes(s) ||
      d.customerPhone1.includes(s) ||
      (d.productName && d.productName.toLowerCase().includes(s)) ||
      (d.telegramUsername && d.telegramUsername.toLowerCase().includes(s)) ||
      (d.providerName && d.providerName.toLowerCase().includes(s)) ||
      (d.storeName && d.storeName.toLowerCase().includes(s));

    if (statusFilter === 'APPROVED') return matchSearch && d.isApproved;
    if (statusFilter === 'PENDING') return matchSearch && !d.isApproved;
    return matchSearch;
  });

  const totalWithdrawn = filteredDeals.reduce((sum, d) => sum + Number(d.withdrawnLimit || 0), 0);
  const pendingCount = deals.filter(d => !d.isApproved).length;
  const approvedCount = deals.filter(d => d.isApproved).length;

  return (
    <div className="space-y-6">
      {/* Page Title & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="w-7 h-7 text-indigo-600" />
            {t('menu.bot_deals', 'Bot bitimlari')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Telegram bot orqali tushgan arizalar, limitlar va tovarlarni tasdiqlash hamda asosiy bitimlarga o'tkazish
          </p>
        </div>
        <button
          onClick={fetchDeals}
          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          Yangilash
        </button>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            {successMsg}
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 font-bold">&times;</button>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            {errorMsg}
          </div>
          <button onClick={() => setErrorMsg('')} className="text-red-600 font-bold">&times;</button>
        </div>
      )}

      {/* 3D Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-3d p-5">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('common.all', 'Barchasi')}</span>
          <p className="text-2xl font-black text-gray-900 mt-1">{deals.length} ta</p>
          <span className="text-xs text-indigo-600 font-semibold">Barcha bot arizalari</span>
        </div>
        <div className="card-3d p-5 bg-gradient-to-br from-white to-amber-50/70 border-amber-200/80">
          <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">{t('common.pending', 'Kutilmoqda')}</span>
          <p className="text-2xl font-black text-amber-900 mt-1">{pendingCount} ta</p>
          <span className="text-xs text-amber-600 font-semibold">Asosiy bitimlarga o'tkazish kerak</span>
        </div>
        <div className="card-3d p-5 bg-gradient-to-br from-white to-emerald-50/70 border-emerald-200/80">
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">{t('common.approved', 'Tasdiqlangan')}</span>
          <p className="text-2xl font-black text-emerald-900 mt-1">{approvedCount} ta</p>
          <span className="text-xs text-emerald-600 font-semibold">Asosiy jadvalga qo'shilgan</span>
        </div>
        <div className="card-3d p-5">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('common.withdrawn_limit', 'Yechilgan Limit')}</span>
          <p className="text-2xl font-black text-indigo-600 mt-1">{formatMoney(totalWithdrawn)}</p>
          <span className="text-xs text-gray-500 font-semibold">Filtrlangan summa</span>
        </div>
      </div>

      {/* 3D Filters Bar */}
      <div className="card-3d p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('common.search', 'Mijoz, telefon, tovar, do\'kon yoki telegram orqali qidiruv...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition bg-slate-50/70 focus:bg-white shadow-inner"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs font-bold text-gray-500 whitespace-nowrap">{t('common.status', 'Holat')}:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition cursor-pointer shadow-sm"
          >
            <option value="ALL">{t('common.all', 'Barchasi')} ({deals.length})</option>
            <option value="PENDING">{t('common.pending', 'Kutilmoqda')} ({pendingCount})</option>
            <option value="APPROVED">{t('common.approved', 'Tasdiqlangan')} ({approvedCount})</option>
          </select>
        </div>
      </div>

      {/* 3D Table */}
      <div className="card-3d overflow-hidden p-0 border border-slate-200/90 flex flex-col">
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-cyan-600 dark:text-cyan-400">{filteredDeals.length} ta bitim</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs table-3d">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-3">{t('common.date_time', 'Sana / Vaqt')}</th>
                <th className="py-3.5 px-3">{t('common.customer_contact', 'Mijoz va Bog\'lanish')}</th>
                <th className="py-3.5 px-3">{t('common.provider', 'Bank / Provayder')}</th>
                <th className="py-3.5 px-3">{t('common.store', 'Do\'kon')}</th>
                <th className="py-3.5 px-3 text-right">{t('common.limit', 'Mijoz Limiti')}</th>
                <th className="py-3.5 px-3 text-right">{t('common.withdrawn_limit', 'Yechilgan Limit')}</th>
                <th className="py-3.5 px-3">{t('common.product_qty', 'Tovar / Soni')}</th>
                <th className="py-3.5 px-3">{t('common.operator_tg', 'Operator / Telegram')}</th>
                <th className="py-3.5 px-3 text-center">{t('common.documents', 'Hujjatlar')}</th>
                <th className="py-3.5 px-3 text-center">{t('common.status', 'Holat')}</th>
                <th className="py-3.5 px-3 text-center sticky right-0 bg-slate-50/95 backdrop-blur-md shadow-[-4px_0_10px_rgba(0,0,0,0.05)] z-10">{t('common.actions', 'Amallar')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Ma'lumotlar yuklanmoqda...
                  </td>
                </tr>
              ) : filteredDeals.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400">
                    Hech qanday bot bitimi topilmadi
                  </td>
                </tr>
              ) : (
                filteredDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-indigo-50/30 transition">
                    <td className="py-3 px-3 whitespace-nowrap font-medium text-gray-700">
                      {formatDateTime(deal.dateTime)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-gray-900">{deal.customerName}</div>
                      <div className="text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {deal.customerPhone1}
                        {deal.customerPhone2 && <span className="text-gray-400">/ {deal.customerPhone2}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {deal.providerName || 'Noma\'lum'}
                      </span>
                      {deal.isDaftar && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">
                          Daftar
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-gray-700">
                      {deal.storeName || '-'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-medium text-gray-600">
                      {formatMoney(deal.customerLimit)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-right font-bold text-indigo-600">
                      {formatMoney(deal.withdrawnLimit)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-gray-800 flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-gray-400" />
                        {deal.productName || 'Noma\'lum tovar'}
                      </div>
                      <div className="text-gray-500 text-[11px]">
                        {deal.quantity} dona {deal.imeiBarcode ? `• IMEI: ${deal.imeiBarcode}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="text-gray-800 font-medium">
                        {deal.telegramUsername ? `@${deal.telegramUsername}` : deal.sellerName || 'Telegram Bot'}
                      </div>
                      <div className="text-gray-400 text-[10px]">ID: {deal.telegramUserId || '-'}</div>
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {deal.contractUrl && (
                          <button
                            onClick={() => setSelectedImage(deal.contractUrl)}
                            className="p-1 text-gray-500 hover:text-indigo-600 rounded bg-gray-50 hover:bg-gray-100"
                            title="Shartnoma ko'rish"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        )}
                        {deal.passportPhotoUrl && (
                          <button
                            onClick={() => setSelectedImage(deal.passportPhotoUrl)}
                            className="p-1 text-gray-500 hover:text-indigo-600 rounded bg-gray-50 hover:bg-gray-100"
                            title="Pasport rasmini ko'rish"
                          >
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          </button>
                        )}
                        {!deal.contractUrl && !deal.passportPhotoUrl && (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {deal.isApproved ? (
                        <span className="pill-3d inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          {t('common.approved', 'Tasdiqlangan')}
                        </span>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <span className="pill-3d inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-sm">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            {t('common.pending', 'Kutilmoqda')}
                          </span>
                          <button
                            onClick={() => handleDelete(deal.id, deal.checkNumber)}
                            disabled={deletingId === deal.id || approvingId === deal.id}
                            className="btn-3d inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white rounded-lg text-xs font-bold shadow-[0_2px_0_0_#9f1239] transition active:translate-y-[1px] disabled:opacity-50"
                            title="Kutilmoqda holatidagi bitim va barcha cheklarni o'chirish"
                          >
                            {deletingId === deal.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            {t('common.delete', 'O\'chirish')}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap sticky right-0 bg-white/95 backdrop-blur-md shadow-[-4px_0_10px_rgba(0,0,0,0.06)] z-10">
                      <div className="inline-flex items-center gap-2">
                        {!deal.isApproved ? (
                          <button
                            onClick={() => handleApprove(deal.id)}
                            disabled={approvingId === deal.id || deletingId === deal.id}
                            className="btn-3d inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-[0_2px_0_0_#4338ca] transition disabled:opacity-50"
                            title="Asosiy bitimlarga o'tkazish"
                          >
                            {approvingId === deal.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ArrowRight className="w-3.5 h-3.5" />
                            )}
                            {t('common.approve', 'Asosiyga o\'tkazish')}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 font-semibold px-2">Ko'chirilgan</span>
                        )}

                        <button
                          onClick={() => handleDelete(deal.id, deal.checkNumber)}
                          disabled={deletingId === deal.id || approvingId === deal.id}
                          className="btn-3d inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-b from-rose-50 to-rose-100 hover:from-rose-100 hover:to-rose-200 text-rose-700 border border-rose-200/90 rounded-xl text-xs font-bold shadow-[0_2px_0_0_#e11d48] transition disabled:opacity-50"
                          title="Bitim va chekni butunlay o'chirish"
                        >
                          {deletingId === deal.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          {t('common.delete', 'O\'chirish')}
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

      {/* Image / Document Viewer Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-4 overflow-hidden shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Hujjat / Rasm ko'rinishi</h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            <div className="py-4 flex justify-center max-h-[75vh] overflow-auto">
              <img
                src={selectedImage}
                alt="Document preview"
                className="max-h-[70vh] object-contain rounded-lg shadow-sm"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                  alert('Rasm yuklab bo\'lmadi yoki havola mavjud emas');
                }}
              />
            </div>
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <a
                href={selectedImage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Yangi oynada ochish
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default BotDealsPage;