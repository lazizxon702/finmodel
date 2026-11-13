import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Receipt } from 'lucide-react';
import {
  Button,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatDate, formatMoney, formatNumber, todayYmd } from '../../utils/format';
import { apiErrorMessage } from '../dashboard/period';
import { CHECK_TRANSFER_DEFAULT_FROM, DDS_ACCOUNTS, type DdsAccount, type DdsBalances } from './constants';

interface PreviewItem {
  dealId: string;
  dealNumber: number | string;
  date: string;
  dateLabel?: string;
  customerName: string | null;
  storeName: string | null;
  amount: number;
}

interface PreviewResponse {
  from: string;
  to?: string | null;
  count: number;
  total: number;
  items: PreviewItem[];
  qodirSkipped?: { count: number; total: number };
  zeroSkipped?: { count: number };
}

export interface CheckTransferResult {
  success: boolean;
  created: number;
  skipped: number;
  total: number;
  failed: { dealId: string; dealNumber: number | string; error: string }[];
  balances?: DdsBalances;
}

interface CheckTransferModalProps {
  open: boolean;
  onClose: () => void;
  /** Yozish tugagach (qisman xato bo'lsa ham) — sahifa ro'yxat va qoldiqlarni yangilaydi */
  onApplied: (result: CheckTransferResult) => void;
}

/**
 * Bitim cheklarini DDS'ga ommaviy o'tkazish (faqat ADMIN).
 * 1) Davr tanlanadi → "Ko'rsatish" (GET /api/dds/check-expenses/preview) — nima yozilishi ko'rsatiladi.
 * 2) "DDS'ga yozish" (POST /api/dds/check-expenses/apply) — faqat ko'rilgan, bo'sh bo'lmagan ro'yxat uchun.
 * Sana o'zgarsa ko'rsatilgan ro'yxat bekor bo'ladi — qayta "Ko'rsatish" bosiladi.
 */
export const CheckTransferModal: React.FC<CheckTransferModalProps> = ({ open, onClose, onApplied }) => {
  const { t } = useTranslation();
  const [from, setFrom] = useState(CHECK_TRANSFER_DEFAULT_FROM);
  const [to, setTo] = useState('');
  const [account, setAccount] = useState<DdsAccount>('CASH');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [fromError, setFromError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckTransferResult | null>(null);
  const requestId = useRef(0);

  // Har ochilganda oynani boshlang'ich holatga qaytaramiz
  useEffect(() => {
    if (!open) return;
    requestId.current += 1;
    setFrom(CHECK_TRANSFER_DEFAULT_FROM);
    setTo('');
    setAccount('CASH');
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setFromError(null);
    setApplying(false);
    setApplyError(null);
    setResult(null);
  }, [open]);

  // Sana o'zgarsa avvalgi ko'rsatilgan ro'yxat (va natija) eskiradi
  const invalidate = () => {
    requestId.current += 1; // yo'ldagi javob ham e'tiborga olinmaydi
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
    setApplyError(null);
    setResult(null);
  };

  const changeFrom = (value: string) => {
    setFrom(value);
    if (value) setFromError(null);
    // Tugash sanasi boshlanishdan oldin bo'lib qolmasin
    if (to && value && value > to) setTo(value);
    invalidate();
  };

  const changeTo = (value: string) => {
    setTo(value);
    invalidate();
  };

  const handlePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (previewLoading || applying) return;
    if (!from) {
      setFromError(t('ddsPage.ct_from_required'));
      return;
    }
    const id = ++requestId.current;
    setPreview(null);
    setResult(null);
    setPreviewError(null);
    setApplyError(null);
    setPreviewLoading(true);
    try {
      const res = await axios.get('/api/dds/check-expenses/preview', { params: { from, to: to || undefined } });
      if (id !== requestId.current) return; // eskirgan javob
      setPreview({ ...res.data, items: Array.isArray(res.data?.items) ? res.data.items : [] });
    } catch (err) {
      if (id !== requestId.current) return;
      setPreviewError(apiErrorMessage(err, t('ddsPage.ct_preview_error')));
    } finally {
      if (id === requestId.current) setPreviewLoading(false);
    }
  };

  const canApply = !!preview && Number(preview.count) > 0 && !result && !previewLoading;

  const handleApply = async () => {
    if (!canApply || applying) return; // ikki marta yuborilmasin
    setApplyError(null);
    setApplying(true);
    try {
      // Server ko'rsatilgan ro'yxat o'zgarmaganini tekshiradi (o'zgargan bo'lsa 409 qaytaradi)
      const res = await axios.post('/api/dds/check-expenses/apply', {
        from,
        to: to || undefined,
        account,
        expectedCount: preview!.count,
        expectedTotal: preview!.total,
      });
      const data: CheckTransferResult = { ...res.data, failed: Array.isArray(res.data?.failed) ? res.data.failed : [] };
      // Yozilgan ro'yxat eskirdi — qayta yozish uchun yana "Ko'rsatish" kerak
      setPreview(null);
      setResult(data);
      onApplied(data);
    } catch (err) {
      setApplyError(apiErrorMessage(err, t('ddsPage.ct_apply_error')));
    } finally {
      setApplying(false);
    }
  };

  const formId = 'dds-check-transfer-form';
  const busy = previewLoading || applying;
  const qodir = preview?.qodirSkipped;
  const zeroCount = Number(preview?.zeroSkipped?.count) || 0;

  return (
    <Modal
      open={open}
      onClose={() => !applying && onClose()}
      closeOnBackdrop={!applying}
      closeOnEsc={!applying}
      size="xl"
      title={t('ddsPage.check_transfer')}
      description={t('ddsPage.ct_description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            {result ? t('common.close') : t('common.cancel')}
          </Button>
          <Button onClick={handleApply} loading={applying} disabled={!canApply}>
            {t('ddsPage.ct_apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <form id={formId} onSubmit={handlePreview} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-start">
          <Field label={t('ddsPage.ct_from')} htmlFor="dds-ct-from" required error={fromError}>
            <Input
              id="dds-ct-from"
              type="date"
              value={from}
              max={todayYmd()}
              onChange={(e) => changeFrom(e.target.value)}
              invalid={!!fromError}
              disabled={busy}
              className="tabular-nums"
            />
          </Field>
          <Field label={t('ddsPage.ct_to')} htmlFor="dds-ct-to" hint={t('ddsPage.ct_to_hint')}>
            <Input
              id="dds-ct-to"
              type="date"
              value={to}
              min={from || undefined}
              max={todayYmd()}
              onChange={(e) => changeTo(e.target.value)}
              disabled={busy}
              className="tabular-nums"
            />
          </Field>
          <Field label={t('accounts.label')} htmlFor="dds-ct-account" hint={t('ddsPage.ct_account_hint')}>
            <Select id="dds-ct-account" value={account} onChange={(e) => setAccount(e.target.value as DdsAccount)} disabled={busy}>
              {DDS_ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {t(`accounts.${a}`)}
                </option>
              ))}
            </Select>
          </Field>
          {/* Tugma maydonlar bilan bir chiziqda tursin (label balandligi qadar bo'shliq) */}
          <div className="sm:col-span-2 lg:col-span-1 lg:pt-[1.625rem]">
            <Button type="submit" variant="secondary" loading={previewLoading} disabled={applying} fullWidth>
              {t('ddsPage.ct_preview')}
            </Button>
          </div>
        </form>

        {previewError && (
          <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{previewError}</span>
          </div>
        )}
        {applyError && (
          <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{applyError}</span>
          </div>
        )}

        {previewLoading && <LoadingBlock label={t('common.loading')} />}

        {/* Boshlang'ich holat: hali hech narsa ko'rsatilmagan */}
        {!previewLoading && !preview && !result && !previewError && (
          <p className="flex items-start gap-2 rounded-control bg-surface-2 px-3 py-2.5 text-sm text-fg-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('ddsPage.ct_initial')}</span>
          </p>
        )}

        {/* Yozish natijasi */}
        {result && (
          <div className="space-y-3">
            <div
              role="status"
              className={
                result.failed.length > 0
                  ? 'flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning'
                  : 'flex items-start gap-2 rounded-control bg-success-soft px-3 py-2.5 text-sm text-success'
              }
            >
              {result.failed.length > 0 ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span className="tabular-nums">
                {t('ddsPage.ct_done', {
                  created: formatNumber(result.created),
                  skipped: formatNumber(result.skipped),
                  total: formatMoney(result.total),
                })}
              </span>
            </div>
            {result.failed.length > 0 && (
              <div role="alert" className="rounded-control border border-line bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <p className="font-medium">{t('ddsPage.ct_failed_title', { count: formatNumber(result.failed.length) })}</p>
                <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {result.failed.map((f) => (
                    <li key={f.dealId}>
                      <span className="font-medium tabular-nums">{t('ddsPage.deal_no', { number: f.dealNumber })}</span>: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Ko'rsatilgan ro'yxat */}
        {preview && !previewLoading && (
          <div className="space-y-3">
            {preview.count > 0 ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-control border border-line bg-surface-2 px-3 py-2.5">
                  <span className="text-sm text-fg-secondary">{t('ddsPage.ct_count', { count: formatNumber(preview.count) })}</span>
                  <span className="fm-num text-lg font-bold tabular-nums text-fg">{formatMoney(preview.total)}</span>
                </div>
                <TableContainer maxHeightClass="max-h-[40vh]">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>{t('ddsPage.ct_col_deal')}</Th>
                        <Th>{t('common.date')}</Th>
                        <Th>{t('common.store')}</Th>
                        <Th>{t('common.customer')}</Th>
                        <Th align="right">{t('common.amount')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {preview.items.map((item) => (
                        <Tr key={item.dealId}>
                          <Td numeric className="font-medium text-fg-secondary">
                            {item.dealNumber}
                          </Td>
                          <Td numeric className="whitespace-nowrap text-fg-secondary">
                            {item.dateLabel || formatDate(item.date)}
                          </Td>
                          <Td className="max-w-[14rem]">
                            <span className="block truncate" title={item.storeName || ''}>
                              {item.storeName || '-'}
                            </span>
                          </Td>
                          <Td className="max-w-[16rem]">
                            <span className="block truncate" title={item.customerName || ''}>
                              {item.customerName || '-'}
                            </span>
                          </Td>
                          <Td align="right" numeric className="font-semibold">
                            {formatMoney(item.amount)}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              </>
            ) : (
              <EmptyState icon={<Receipt />} title={t('ddsPage.ct_empty')} description={t('ddsPage.ct_empty_hint')} />
            )}

            {(Number(qodir?.count) > 0 || zeroCount > 0) && (
              <div className="space-y-1 text-xs leading-relaxed text-fg-muted">
                {Number(qodir?.count) > 0 && (
                  <p className="tabular-nums">
                    {t('ddsPage.ct_qodir_note', { count: formatNumber(qodir?.count), total: formatMoney(qodir?.total) })}
                  </p>
                )}
                {zeroCount > 0 && <p className="tabular-nums">{t('ddsPage.ct_zero_note', { count: formatNumber(zeroCount) })}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
