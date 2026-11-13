import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, BadgeDollarSign, PackageOpen, Search, X } from 'lucide-react';
import { formatMoney, todayYmd } from '../../utils/format';
import { useTranslation } from '../../context/LanguageContext';
import { AmountInput } from '../AmountInput';
import { Badge, Button, Field, Input, Modal, Select, controlClass, cn } from '../ui';
import {
  DEFAULT_MARKUP,
  SALE_PAYMENT_TYPES,
  SalePaymentType,
  StockRow,
  num,
  stockImeis,
  stockSearchText,
} from './saleTypes';

interface NewSaleModalProps {
  open: boolean;
  onClose: () => void;
  /** Ombordagi (IN_WAREHOUSE) qatorlar */
  stock: StockRow[];
  /** Sotuv saqlangach: ro'yxat va omborni qayta yuklash */
  onSaved: () => void;
  /** 409 — ba'zi tovarlar endi omborda yo'q: ombor ro'yxatini qayta yuklash */
  onStockStale: () => void;
}

const emptyForm = () => ({
  saleDate: todayYmd(),
  buyerName: '',
  totalPrice: 0,
  paidAmount: 0,
  dueDate: '',
  note: '',
  paymentType: 'CASH' as SalePaymentType,
  adminOverrideCode: '',
});

/**
 * Yangi sotuv oynasi: bitta haridorga bir nechta ombor qatori, BITTA umumiy narx va BITTA to'lov.
 * Narxni tovarlarga tannarxga mutanosib ravishda server taqsimlaydi.
 */
export const NewSaleModal: React.FC<NewSaleModalProps> = ({ open, onClose, stock, onSaved, onStockStale }) => {
  const { t } = useTranslation();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockStore, setStockStore] = useState('');
  const [form, setForm] = useState(emptyForm);
  // Foydalanuvchi narx/to'lovni qo'lda o'zgartirgan bo'lsa, avtomatik qayta hisoblanmaydi
  const [priceTouched, setPriceTouched] = useState(false);
  const [paidTouched, setPaidTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [requiresOverride, setRequiresOverride] = useState(false);
  const [existingDebtNotice, setExistingDebtNotice] = useState(0);

  // Oyna har ochilganda toza holat
  useEffect(() => {
    if (!open) return;
    setSelectedIds([]);
    setStockSearch('');
    setStockStore('');
    setForm(emptyForm());
    setPriceTouched(false);
    setPaidTouched(false);
    setError('');
    setRequiresOverride(false);
    setExistingDebtNotice(0);
  }, [open]);

  // Ombor ro'yxati yangilansa — endi mavjud bo'lmagan tanlovlar olib tashlanadi
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = prev.filter((id) => stock.some((s) => s.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [stock]);

  const selectedRows = useMemo(
    () => selectedIds.map((id) => stock.find((s) => s.id === id)).filter(Boolean) as StockRow[],
    [selectedIds, stock]
  );
  const costSum = useMemo(() => selectedRows.reduce((sum, r) => sum + num(r.purchaseCost), 0), [selectedRows]);

  // Standart umumiy narx = Σ tannarx × 1.12 (tanlov o'zgarganda, agar qo'lda tahrirlanmagan bo'lsa)
  useEffect(() => {
    if (!open || priceTouched) return;
    const next = Math.round(costSum * DEFAULT_MARKUP);
    setForm((prev) => (prev.totalPrice === next ? prev : { ...prev, totalPrice: next }));
  }, [costSum, priceTouched, open]);

  // To'langan summa: Nasiya — 0; boshqa turda — umumiy narx (qo'lda kamaytirilmagan bo'lsa)
  useEffect(() => {
    if (!open) return;
    setForm((prev) => {
      const next = prev.paymentType === 'DEBT' ? 0 : paidTouched ? prev.paidAmount : prev.totalPrice;
      return prev.paidAmount === next ? prev : { ...prev, paidAmount: next };
    });
  }, [form.totalPrice, form.paymentType, paidTouched, open]);

  const storeNames = useMemo(
    () => Array.from(new Set(stock.map((s) => s.storeName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [stock]
  );

  const visibleStock = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    return stock.filter((row) => {
      if (stockStore && row.storeName !== stockStore) return false;
      if (q && !stockSearchText(row).includes(q)) return false;
      return true;
    });
  }, [stock, stockSearch, stockStore]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const isDebtType = form.paymentType === 'DEBT';
  const debt = Math.max(0, form.totalPrice - form.paidAmount);
  const estProfit = form.totalPrice - costSum;
  const overpaid = form.paidAmount > form.totalPrice;
  const showDueDate = isDebtType || debt > 0;

  const handlePaymentTypeChange = (value: SalePaymentType) => {
    // Tur almashganda to'lov qayta to'ldiriladi: Nasiya → 0, boshqasi → umumiy narx
    setPaidTouched(false);
    setForm((prev) => ({ ...prev, paymentType: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0) return setError(t('sales.new.errNoItems'));
    if (!form.buyerName.trim()) return setError(t('sales.form.buyerRequired'));
    if (form.totalPrice <= 0) return setError(t('sales.edit.priceRequired'));
    if (overpaid) return setError(t('sales.new.errPaidOverTotal'));

    try {
      setSubmitting(true);
      setError('');
      await axios.post('/api/sales', {
        dealIds: selectedIds,
        totalPrice: form.totalPrice,
        buyerName: form.buyerName.trim(),
        paidAmount: isDebtType ? 0 : form.paidAmount,
        paymentType: form.paymentType,
        dueDate: showDueDate && form.dueDate ? form.dueDate : undefined,
        note: form.note.trim() || undefined,
        saleDate: form.saleDate || undefined,
        adminOverrideCode: form.adminOverrideCode || undefined,
      });
      onSaved();
      onClose();
      alert(t('sales.form.done'));
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.requiresOverride) {
        setRequiresOverride(true);
        setExistingDebtNotice(num(data.totalExistingDebt));
      }
      // 409 — tanlangan tovarlardan ba'zilari allaqachon sotilgan/ko'chirilgan
      if (err.response?.status === 409) onStockStale();
      setError(data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const amountClass = cn(controlClass, 'font-semibold tabular-nums');

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <BadgeDollarSign className="h-5 w-5 text-accent" />
          {t('sales.newSale')}
        </span>
      }
      description={t('sales.new.subtitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="sale-new-form" loading={submitting} disabled={selectedIds.length === 0}>
            {submitting ? t('sales.form.submitting') : t('sales.form.submit')}
          </Button>
        </>
      }
    >
      <form id="sale-new-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Ombordan tanlash */}
          <div className="min-w-0 space-y-2">
            <div className="text-[13px] font-medium text-fg-secondary">
              {t('sales.new.pickTitle')} <span className="text-danger" aria-hidden="true">*</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1">
                <Input
                  type="text"
                  leftIcon={<Search />}
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder={t('sales.new.searchPlaceholder')}
                  aria-label={t('sales.new.searchPlaceholder')}
                />
              </div>
              {storeNames.length > 1 && (
                <div className="sm:w-40">
                  <Select
                    value={stockStore}
                    onChange={(e) => setStockStore(e.target.value)}
                    aria-label={t('common.all_stores')}
                  >
                    <option value="">{t('common.all_stores')}</option>
                    {storeNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface">
              {stock.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-fg-muted">{t('sales.form.noStock')}</div>
              ) : visibleStock.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-fg-muted">{t('sales.new.nothingFound')}</div>
              ) : (
                <ul className="divide-y divide-line">
                  {visibleStock.map((row) => {
                    const checked = selectedIds.includes(row.id);
                    const imeis = stockImeis(row);
                    return (
                      <li key={row.id}>
                        <label
                          className={cn(
                            'flex min-h-touch cursor-pointer items-start gap-2.5 px-3 py-2 transition-colors hover:bg-brand-soft/40',
                            checked && 'bg-brand-soft/60'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(row.id)}
                            className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-fg">
                              {row.productName || '—'}
                              {num(row.quantity) > 1 && (
                                <span className="ml-1 font-medium text-fg-muted">× {row.quantity}</span>
                              )}
                            </span>
                            <span className="block truncate text-xs text-fg-muted">
                              №{row.dealNumber ?? '—'} · {row.storeName || '—'}
                            </span>
                            <span className="block truncate font-mono text-xs tabular-nums text-fg-muted">
                              IMEI: {imeis.length > 0 ? imeis.join(', ') : t('sales.form.noImei')}
                            </span>
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-fg-secondary">
                            {formatMoney(row.purchaseCost)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-xs text-fg-muted">
              {t('sales.new.shownCount', { shown: visibleStock.length, total: stock.length })}
            </p>
          </div>

          {/* Tanlangan tovarlar */}
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-fg-secondary">
                {t('sales.new.selected', { count: selectedRows.length })}
              </span>
              {selectedRows.length > 0 && (
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setSelectedIds([])}>
                  {t('sales.new.clearAll')}
                </Button>
              )}
            </div>
            <div className="rounded-card border border-line bg-surface-2">
              {selectedRows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-fg-muted">
                  <PackageOpen className="h-7 w-7" />
                  {t('sales.new.selectedEmpty')}
                </div>
              ) : (
                <ul className="max-h-56 divide-y divide-line overflow-y-auto overscroll-contain">
                  {selectedRows.map((row) => (
                    <li key={row.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{row.productName || '—'}</span>
                        <span className="block truncate text-xs text-fg-muted">
                          №{row.dealNumber ?? '—'} · {row.storeName || '—'}
                        </span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-fg-secondary">
                        {formatMoney(row.purchaseCost)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-danger sm:min-h-[2rem] sm:min-w-[2rem]"
                        onClick={() => toggle(row.id)}
                        title={t('sales.new.remove')}
                        aria-label={t('sales.new.remove')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-sm">
                <span className="text-fg-secondary">{t('sales.new.costSum')}</span>
                <span className="whitespace-nowrap font-semibold tabular-nums text-fg">{formatMoney(costSum)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sotuv maydonlari: sana, haridor, umumiy narx, to'langan, muddat, izoh va OXIRIDA to'lov turi */}
        <div className="grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label={t('sales.form.saleDate')} required>
            <Input
              type="date"
              value={form.saleDate}
              onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
              required
            />
          </Field>
          <Field label={t('sales.form.buyer')} required>
            <Input
              type="text"
              value={form.buyerName}
              onChange={(e) => setForm({ ...form, buyerName: e.target.value })}
              placeholder={t('sales.form.buyerPlaceholder')}
              required
            />
          </Field>

          <Field label={t('sales.new.totalPrice')} required hint={t('sales.new.totalPriceHint')}>
            <AmountInput
              value={form.totalPrice}
              onChange={(val) => {
                setPriceTouched(true);
                setForm((prev) => ({ ...prev, totalPrice: val }));
              }}
              placeholder={t('sales.form.salePricePlaceholder')}
              className={amountClass}
              required
            />
          </Field>
          <Field
            label={t('sales.form.paid')}
            error={overpaid ? t('sales.new.errPaidOverTotal') : undefined}
            hint={isDebtType ? t('sales.new.paidDebtHint') : undefined}
          >
            <AmountInput
              value={form.paidAmount}
              onChange={(val) => {
                setPaidTouched(true);
                setForm((prev) => ({ ...prev, paidAmount: val }));
              }}
              placeholder="0"
              disabled={isDebtType}
              aria-invalid={overpaid}
              className={cn(amountClass, overpaid && 'border-danger')}
            />
          </Field>

          {showDueDate && (
            <Field
              label={t('sales.form.dueDate')}
              className={cn(
                'sm:col-span-2',
                isDebtType && 'rounded-card border border-warning/40 bg-warning-soft p-3'
              )}
              hint={isDebtType ? t('sales.new.dueDateHint') : undefined}
            >
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="sm:max-w-xs"
              />
            </Field>
          )}

          <Field label={t('sales.edit.note')} className="sm:col-span-2">
            <Input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t('sales.edit.notePlaceholder')}
            />
          </Field>

          <Field label={t('sales.new.payType')} required className="sm:col-span-2">
            <Select
              value={form.paymentType}
              onChange={(e) => handlePaymentTypeChange(e.target.value as SalePaymentType)}
            >
              {SALE_PAYMENT_TYPES.map((p) => (
                <option key={p} value={p}>
                  {t(`sales.ptype.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Jonli xulosa: jami, olingan, qarz, taxminiy foyda */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-card border border-line bg-surface-2 p-3 text-xs sm:grid-cols-4">
          <div>
            <span className="block text-fg-muted">{t('sales.new.sumTotal')}</span>
            <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-fg">{formatMoney(form.totalPrice)}</span>
          </div>
          <div>
            <span className="block text-fg-muted">{t('sales.new.sumReceived')}</span>
            <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-success">
              {formatMoney(form.paidAmount)}
            </span>
          </div>
          <div>
            <span className="block text-fg-muted">{t('sales.new.sumDebt')}</span>
            <span
              className={cn(
                'whitespace-nowrap text-sm font-semibold tabular-nums',
                debt > 0 ? 'text-danger' : 'text-success'
              )}
            >
              {formatMoney(debt)}
            </span>
          </div>
          <div>
            <span className="block text-fg-muted">{t('sales.new.sumProfit')}</span>
            <span
              className={cn(
                'whitespace-nowrap text-sm font-semibold tabular-nums',
                estProfit >= 0 ? 'text-success' : 'text-danger'
              )}
            >
              {formatMoney(estProfit)}
            </span>
          </div>
          {form.totalPrice > 0 && (
            <div className="col-span-2 sm:col-span-4">
              {debt > 0 ? (
                <Badge tone="danger" size="sm">{t('sales.form.goesToDebtors')}</Badge>
              ) : (
                <Badge tone="success" size="sm">{t('sales.fullyPaid')}</Badge>
              )}
            </div>
          )}
        </div>

        {/* Muddati o'tgan qarz haqida ogohlantirish va admin kodi */}
        {requiresOverride && (
          <div className="space-y-2 rounded-card border border-danger/30 bg-danger-soft p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-danger">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t('sales.form.overdueDebt', { amount: formatMoney(existingDebtNotice) })}</span>
            </div>
            <p className="text-xs text-fg-secondary">{t('sales.form.overrideHint')}</p>
            <Input
              type="password"
              placeholder={t('sales.form.adminCode')}
              value={form.adminOverrideCode}
              onChange={(e) => setForm({ ...form, adminOverrideCode: e.target.value })}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-semibold text-danger">{error}</p>
        )}
      </form>
    </Modal>
  );
};

export default NewSaleModal;
