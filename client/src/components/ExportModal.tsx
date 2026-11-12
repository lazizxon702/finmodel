import React, { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  ExternalLink,
  Check,
  Copy,
  Info,
  CheckCircle2,
} from 'lucide-react';
import axios from 'axios';
import { useTranslation } from '../context/LanguageContext';
import { todayYmd, toYmdTashkent } from '../utils/format';
import { Badge, Button, Field, Input, Modal, cn } from './ui';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Varaq `id` lari serverga o'zgarishsiz yuboriladigan qiymatlar (API kaliti) — tarjima qilinmaydi.
// Ko'rinadigan nom `labelKey` orqali tarjima qilinadi.
const AVAILABLE_SHEETS = [
  { id: 'Сделки_и_Склад', labelKey: 'exportModal.sheet.deals', default: true },
  { id: 'Склад.Продажа', labelKey: 'exportModal.sheet.sales', default: true },
  { id: 'Агент', labelKey: 'exportModal.sheet.agents', default: true },
  { id: 'SWOT_Агентства', labelKey: 'exportModal.sheet.swot', default: true },
  { id: 'Финансы_Свод', labelKey: 'exportModal.sheet.finance', default: true },
  { id: 'Транзакции_ДДС', labelKey: 'exportModal.sheet.dds', default: true },
  { id: 'Баланс', labelKey: 'exportModal.sheet.balance', default: true },
  { id: 'Ежедневный_Учет', labelKey: 'exportModal.sheet.daily', default: true },
  { id: 'Фин_Модель', labelKey: 'exportModal.sheet.model', default: true },
  { id: 'БОТ ТР', labelKey: 'exportModal.sheet.bot', default: true },
  { id: 'Сделки_и_Склад_Бот', labelKey: 'exportModal.sheet.botDeals', default: true },
  { id: 'Лист8', labelKey: 'exportModal.sheet.debts', default: true },
  { id: 'Прием передача', labelKey: 'exportModal.sheet.handover', default: true },
  { id: 'Лист5', labelKey: 'exportModal.sheet.kpi', default: true },
];

// TSV ustun sarlavhalari (tarjima kalitlari tartibi bilan)
const TSV_COLUMNS = [
  'dealId', 'date', 'seller', 'provider', 'daftar', 'customer', 'phone', 'store', 'limit', 'withdrawn',
  'agentAmount', 'purchaseCost', 'discount', 'agentPct', 'calculated', 'difference', 'product', 'qty',
  'imei', 'status', 'buyer', 'salePrice', 'profit', 'margin', 'debt', 'payStatus', 'note',
];

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

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

  // Google Sheets'ga bir bosishda qo'yish uchun TSV matn
  const generateTsvData = async (): Promise<string> => {
    try {
      const dealsRes = await axios.get('/api/deals?limit=500');
      const deals = dealsRes.data?.deals || [];

      const headers = TSV_COLUMNS.map((c) => t(`exportModal.col.${c}`));

      const rows = deals.map((d: any) => [
        d.dealNumber || '',
        d.date ? toYmdTashkent(d.date) : '',
        d.sellerName || '',
        d.provider?.name || '',
        d.isDaftar ? t('common.yes') : t('common.no'),
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

  // Bir bosishda Google Sheets ochish va ma'lumotni nusxalash
  const handleCreateGoogleSheets = async () => {
    try {
      setIsExporting(true);
      const tsvData = await generateTsvData();

      if (tsvData && navigator.clipboard) {
        await navigator.clipboard.writeText(tsvData);
        setCopiedStatus(true);
      }

      // Google'ning rasmiy yangi varaq yaratuvchisi
      window.open('https://sheets.new', '_blank');
      setSheetsOpenedStatus(true);

      // Hamroh sifatida Excel faylni ham yuklab olish
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
      alert(t('exportModal.copyError'));
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
        throw new Error(`${t('exportModal.serverError', { status: res.status })}: ${res.statusText}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Macmobi_ERP_Export_${todayYmd()}.xlsx`;
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
      alert(`${t('exportModal.downloadError')}: ${err.message || t('exportModal.noConnection')}`);
      setIsExporting(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-accent" />
          <span>{t('exportModal.title')}</span>
          <Badge tone="success" size="sm">Live Sync</Badge>
        </span>
      }
      description={t('exportModal.subtitle')}
      footer={
        <>
          <Button
            variant="ghost"
            className="sm:mr-auto"
            leftIcon={<Copy className="h-4 w-4" />}
            onClick={handleCopyClipboardOnly}
          >
            {copiedStatus ? t('exportModal.copied') : t('exportModal.copyToClipboard')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            leftIcon={<ExternalLink className="h-4 w-4" />}
            onClick={handleCreateGoogleSheets}
            disabled={isExporting}
          >
            {isExporting ? t('exportModal.preparing') : 'Google Sheets'}
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-xs">
        {/* Google Sheets ochilgandagi muvaffaqiyat bloki */}
        {sheetsOpenedStatus && (
          <div className="space-y-2 rounded-card border border-success/30 bg-success-soft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{t('exportModal.opened')}</span>
            </div>
            <p className="leading-relaxed text-fg-secondary">
              {t('exportModal.pasteHint', { cell: 'A1', keys: 'Ctrl + V' })}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="success"
                leftIcon={<Copy className="h-3.5 w-3.5" />}
                onClick={handleCopyClipboardOnly}
              >
                {copiedStatus ? t('exportModal.copied') : t('exportModal.copyAgain')}
              </Button>
              <a
                href="https://sheets.new"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-touch items-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-fg hover:bg-surface-2 sm:min-h-[2rem]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>{t('exportModal.openSheets')}</span>
              </a>
            </div>
          </div>
        )}

        {/* Tezkor amallar: Google Sheets va Excel */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleCreateGoogleSheets}
            disabled={isExporting}
            className="flex flex-col items-start gap-1 rounded-card border border-transparent bg-brand p-4 text-left text-brand-fg transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ExternalLink className="h-4 w-4" />
                {t('exportModal.createSheets')}
              </span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">sheets.new</span>
            </span>
            <span className="text-xs font-normal opacity-90">{t('exportModal.createSheetsHint')}</span>
          </button>

          <button
            type="button"
            onClick={() => handleDownloadXlsx(true)}
            disabled={isExporting}
            className="flex flex-col items-start gap-1 rounded-card border border-line-strong bg-surface p-4 text-left text-fg transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Download className="h-4 w-4 text-accent" />
                {t('exportModal.downloadXlsx')}
              </span>
              <Badge size="sm">{t('exportModal.offline')}</Badge>
            </span>
            <span className="text-xs font-normal text-fg-muted">
              {t('exportModal.downloadXlsxHint', { count: AVAILABLE_SHEETS.length })}
            </span>
          </button>
        </div>

        {/* Sana oralig'i */}
        <div>
          <p className="mb-2 text-xs font-medium text-fg-secondary">{t('exportModal.period')}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('exportModal.startDate')}>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label={t('exportModal.endDate')}>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Varaqlarni tanlash */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-fg-secondary">
              {t('exportModal.sheetsLabel', { selected: selectedSheets.length, total: AVAILABLE_SHEETS.length })}
            </p>
            <div className="flex items-center gap-3 text-xs">
              <button type="button" onClick={selectAll} className="font-semibold text-accent hover:underline">
                {t('exportModal.selectAll')}
              </button>
              <button type="button" onClick={deselectAll} className="text-fg-muted hover:underline">
                {t('exportModal.clear')}
              </button>
            </div>
          </div>

          <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-card border border-line bg-surface-2 p-2.5 sm:grid-cols-2">
            {AVAILABLE_SHEETS.map((s) => {
              const checked = selectedSheets.includes(s.id);
              return (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  key={s.id}
                  onClick={() => toggleSheet(s.id)}
                  className={cn(
                    'flex min-h-touch items-center gap-2.5 rounded-control border p-2 text-left text-xs transition-colors sm:min-h-0',
                    checked
                      ? 'border-accent/40 bg-brand-soft font-semibold text-fg'
                      : 'border-line bg-surface text-fg-secondary hover:bg-surface-2'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                      checked ? 'border-brand bg-brand text-brand-fg' : 'border-line-strong bg-surface'
                    )}
                  >
                    {checked && <Check className="h-3 w-3 stroke-[3]" />}
                  </span>
                  <span className="truncate">{t(s.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Izoh */}
        <div className="flex items-start gap-2.5 rounded-card border border-info/30 bg-info-soft p-3.5 text-xs text-fg-secondary">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <div>
            <p className="font-semibold text-fg">{t('exportModal.noteTitle')}</p>
            <p className="mt-0.5 text-xs">{t('exportModal.noteText')}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};
