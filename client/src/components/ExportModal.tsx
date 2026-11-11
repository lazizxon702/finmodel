import React, { useState } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  ExternalLink,
  Check,
  Copy,
  Sparkles,
  Info,
  CheckCircle2,
  Table
} from 'lucide-react';
import axios from 'axios';
import { useTranslation } from '../context/LanguageContext';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_SHEETS = [
  { id: 'Сделки_и_Склад', name: 'Bitimlar va Ombor (Сделки_и_Склад)', default: true },
  { id: 'Склад.Продажа', name: 'Ombor va Sotuv (Склад.Продажа)', default: true },
  { id: 'Агент', name: 'Agentlar (Агент)', default: true },
  { id: 'SWOT_Агентства', name: 'Agentliklar SWOT (SWOT_Агентства)', default: true },
  { id: 'Финансы_Свод', name: 'Moliya va Balans (Финансы_Свод)', default: true },
  { id: 'Транзакции_ДДС', name: 'Pul harakati (Транзакции_ДДС)', default: true },
  { id: 'Баланс', name: 'Sheriklar balansi (Баланс)', default: true },
  { id: 'Ежедневный_Учет', name: 'Kunlik hisob (Ежедневный_Учет)', default: true },
  { id: 'Фин_Модель', name: 'Moliyaviy model (Фин_Модель)', default: true },
  { id: 'БОТ ТР', name: 'Bot operatorlari hisoboti (БОТ ТР)', default: true },
  { id: 'Сделки_и_Склад_Бот', name: 'Bot bitimlari (Сделки_и_Склад_Бот)', default: true },
  { id: 'Лист8', name: 'Qarzlar (Лист8)', default: true },
  { id: 'Прием передача', name: 'Topshirish-qabul (Прием передача)', default: true },
  { id: 'Лист5', name: 'Xodimlar KPI (Лист5)', default: true },
];

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { language } = useTranslation();
  const isRu = language === 'ru';

  const [selectedSheets, setSelectedSheets] = useState<string[]>(
    AVAILABLE_SHEETS.map((s) => s.id)
  );
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [copiedStatus, setCopiedStatus] = useState(false);
  const [sheetsOpenedStatus, setSheetsOpenedStatus] = useState(false);

  if (!isOpen) return null;

  const toggleSheet = (id: string) => {
    setSelectedSheets((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedSheets(AVAILABLE_SHEETS.map((s) => s.id));
  const deselectAll = () => setSelectedSheets([]);

  // Generate TSV string for 1-click clipboard paste to Google Sheets
  const generateTsvData = async (): Promise<string> => {
    try {
      const dealsRes = await axios.get('/api/deals?limit=500');
      const deals = dealsRes.data?.deals || [];

      const headers = [
        'ID Сделки',
        'Дата',
        'Продавец',
        'Банк / Провайдер',
        'Дафтар',
        'Клиент ФИО',
        'Телефон',
        'Магазин / Партнер',
        'Лимит клиента (UZS)',
        'Снятие лимит (UZS)',
        'Агент суммаси (UZS)',
        'Расход агент и выкупка (UZS)',
        'Дисконт выкупа %',
        '% Агента',
        'Расчетное сумма (UZS)',
        'Разница % (UZS)',
        'Товар',
        'Кол-во',
        'IMEI / Баркод',
        'Статус',
        'Покупатель / Оптовик',
        'Цена продажи (UZS)',
        'Прибыль (UZS)',
        'Маржа %',
        'Остаток долга (UZS)',
        'Статус оплаты',
        'Примечание'
      ];

      const rows = deals.map((d: any) => [
        d.dealNumber || '',
        d.date ? new Date(d.date).toISOString().slice(0, 10) : '',
        d.sellerName || '',
        d.provider?.name || '',
        d.isDaftar ? 'Да' : 'Нет',
        d.customerName || '',
        d.customerPhone1 || '',
        d.store?.name || '',
        d.customerLimit || 0,
        d.withdrawnLimit || 0,
        d.agentAmount || 0,
        d.totalPurchaseCost || 0,
        d.discountPercent ? `${d.discountPercent}%` : '0%',
        d.agentPercent ? `${d.agentPercent}%` : '0%',
        d.calculatedAmount || 0,
        d.differencePercent || 0,
        d.productName || '',
        d.quantity || 1,
        d.imeiBarcode || '',
        d.status || '',
        d.buyer?.name || '',
        d.salePrice || 0,
        d.profit || 0,
        d.marginPercent ? `${d.marginPercent}%` : '0%',
        d.debtRemaining || 0,
        d.paymentStatus || '',
        (d.note || '').replace(/[\r\n\t]/g, ' ')
      ]);

      const tsvContent = [
        headers.join('\t'),
        ...rows.map((r: any[]) => r.join('\t'))
      ].join('\n');

      return tsvContent;
    } catch (e) {
      console.error('Error generating TSV:', e);
      return '';
    }
  };

  // 1-Click create & copy directly to Google Sheets
  const handleCreateGoogleSheets = async () => {
    try {
      setIsExporting(true);
      const tsvData = await generateTsvData();

      if (tsvData && navigator.clipboard) {
        await navigator.clipboard.writeText(tsvData);
        setCopiedStatus(true);
      }

      // Open Google's official new sheet creator
      window.open('https://sheets.new', '_blank');
      setSheetsOpenedStatus(true);

      // Also trigger Excel file download as companion
      handleDownloadXlsx(false);
    } catch (err: any) {
      console.error('Google Sheets create error:', err);
      window.open('https://sheets.new', '_blank');
      setSheetsOpenedStatus(true);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyClipboardOnly = async () => {
    try {
      setIsExporting(true);
      const tsvData = await generateTsvData();
      if (tsvData && navigator.clipboard) {
        await navigator.clipboard.writeText(tsvData);
        setCopiedStatus(true);
        setTimeout(() => setCopiedStatus(false), 4000);
      }
    } catch (e) {
      alert('Nusxalashda xatolik yuz berdi');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadXlsx = async (closeModal = true) => {
    try {
      setIsExporting(true);
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (selectedSheets.length > 0) params.append('sheets', selectedSheets.join(','));
      if (token) params.append('token', token);

      const downloadUrl = `/api/export/xlsx?${params.toString()}`;

      const res = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Server xatolik qaytardi (${res.status}): ${res.statusText}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Macmobi_ERP_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      if (closeModal) {
        setTimeout(() => {
          setIsExporting(false);
          onClose();
        }, 500);
      }
    } catch (err: any) {
      console.error('Export download error:', err);
      alert(isRu ? 'Ошибка при скачивании Excel файла' : 'Excel yuklab olishda xatolik yuz berdi: ' + (err.message || 'Serverga ulanib bo\'lmadi'));
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[94vh] sm:h-auto sm:max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 border-t border-white/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{isRu ? 'Экспорт в Google Таблицы / Excel' : 'Google Sheets / Excel\'ga saqlash'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Live Sync
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRu
                  ? 'Создание нового листа Google Таблиц в 1 клик и скачивание файла Excel'
                  : '1 soniyada Google Sheets varag\'ini yaratish va Excel faylni yuklash'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar text-xs">
          {/* Success Banner when Google Sheets is launched */}
          {sheetsOpenedStatus && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span>
                  {isRu
                    ? 'Google Таблица успешно открыта в новой вкладке!'
                    : 'Google Sheets yangi oynada muvaffaqiyatli ochildi!'}
                </span>
              </div>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                {isRu ? (
                  <>
                    📋 Все данные скопированы в буфер обмена. Перейдите на открытую вкладку Google Таблицы, выберите ячейку <b>A1</b> и нажмите <b>Ctrl + V</b> (Вставить). Таблица мгновенно заполнится!
                  </>
                ) : (
                  <>
                    📋 Barcha bitimlar va jadvallar xotiraga nusxalandi. Ochilgan Google Sheets varag'iga o'tib, <b>A1</b> katagiga bosing va <b>Ctrl + V</b> (Qo'yish) bosing. Barcha ustun va qatorlar avtomatik to'liq joylashadi!
                  </>
                )}
              </p>
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyClipboardOnly}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedStatus ? (isRu ? 'Скопировано!' : 'Nusxalandi!') : (isRu ? 'Скопировать заново' : 'Qayta nusxalash')}</span>
                </button>
                <a
                  href="https://sheets.new"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-bold text-xs border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-slate-700 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>sheets.new ochish</span>
                </a>
              </div>
            </div>
          )}

          {/* Quick Action Buttons for 1-Click Google Sheets vs Excel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleCreateGoogleSheets}
              disabled={isExporting}
              className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white hover:from-emerald-500 hover:to-teal-500 font-bold shadow-lg shadow-emerald-600/25 border-t border-white/20 flex flex-col items-start gap-1 text-left transition transform hover:scale-[1.01] active:scale-98"
            >
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <ExternalLink className="w-4 h-4 text-emerald-200" />
                  Google Sheets'da Yaratish
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-bold uppercase">
                  sheets.new
                </span>
              </div>
              <p className="text-[11px] text-emerald-100 font-normal mt-0.5">
                {isRu
                  ? 'Автоматически открывает Google Таблицу и копирует все данные для вставки (Ctrl+V)'
                  : 'Avtomatik yangi Google Sheet ochadi va barcha ma\'lumotlarni buferga nusxalaydi'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleDownloadXlsx(true)}
              disabled={isExporting}
              className="p-4 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 font-bold shadow-sm flex flex-col items-start gap-1 text-left transition transform hover:scale-[1.01] active:scale-98"
            >
              <div className="flex items-center justify-between w-full">
                <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Excel (.xlsx) Yuklab Olish
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  OFFLINE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                {isRu
                  ? 'Скачать многостраничный файл Excel со всеми 14 листами и живыми формулами'
                  : 'Barcha 14 ta varaq va formulalar bilan to\'liq Excel faylni kompyuterga yuklash'}
              </p>
            </button>
          </div>

          {/* Date range filters */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              {isRu ? 'Период (необязательно)' : 'Sana oralig\'i (ixtiyoriy)'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {isRu ? 'Дата начала' : 'Boshlanish sanasi'}
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {isRu ? 'Дата окончания' : 'Tugash sanasi'}
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Sheets selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isRu
                  ? `Экспортируемые листы (${selectedSheets.length}/${AVAILABLE_SHEETS.length})`
                  : `Eksport qilinadigan varaqlar (${selectedSheets.length}/${AVAILABLE_SHEETS.length})`}
              </label>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                >
                  {isRu ? 'Все' : 'Hammasi'}
                </button>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-slate-500 dark:text-slate-400 hover:underline"
                >
                  {isRu ? 'Очистить' : 'Tozalash'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2.5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/60 dark:bg-slate-950/40 custom-scrollbar">
              {AVAILABLE_SHEETS.map((s) => {
                const checked = selectedSheets.includes(s.id);
                return (
                  <label
                    key={s.id}
                    onClick={() => toggleSheet(s.id)}
                    className={`flex items-center gap-2.5 p-2 rounded-xl text-xs cursor-pointer transition-colors border ${
                      checked
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 font-bold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                        checked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">{s.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Info note */}
          <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-300 text-xs flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                {isRu ? 'Живые формулы и полная совместимость' : 'Jonli formulalar va to\'liq moslik'}
              </p>
              <p className="text-[11px] opacity-90 mt-0.5">
                {isRu
                  ? 'Файл полностью оптимизирован под Google Sheets и Excel: формулы прибыли, маржи и итогов рассчитываются динамически.'
                  : 'Fayl Google Sheets va Excel uchun moslangan: daromad, marja va jami yig\'indi formulalari avtomatik hisoblanadi.'}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/50">
          <button
            type="button"
            onClick={handleCopyClipboardOnly}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copiedStatus ? (isRu ? 'Скопировано!' : 'Nusxalandi!') : (isRu ? 'Копировать в буфер' : 'Buferga nusxalash')}</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              {isRu ? 'Закрыть' : 'Yopish'}
            </button>
            <button
              type="button"
              onClick={handleCreateGoogleSheets}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-md shadow-emerald-600/20 active:translate-y-[1px] transition"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{isExporting ? (isRu ? 'Обработка...' : 'Tayyorlanmoqda...') : 'Google Sheets'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
