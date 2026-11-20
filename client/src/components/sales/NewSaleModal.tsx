import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, BadgeDollarSign, ChevronDown, Minus, PackageOpen, Plus, Search, Warehouse, X } from 'lucide-react';
import { formatMoney, todayYmd } from '../../utils/format';
import { useTranslation } from '../../context/LanguageContext';
import { AmountInput } from '../AmountInput';
import { Badge, Button, Field, Input, Modal, Select, controlClass, cn } from '../ui';
import {
  DEFAULT_MARKUP,
  SALE_PAYMENT_TYPES,
  SalePaymentType,
  SaleUnit,
  StockRow,
  buildSaleSelection,
  buildSaleUnits,
  groupStock,
  num,
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

  // Tanlov BIRLIK kaliti bo'yicha: butun chek — dealId, chek qismi — dealId:itemId
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockStore, setStockStore] = useState('');
  // IMEI ro'yxati ochilgan model guruhlari
  const [openGroups, setOpenGroups] = useState<string[]>([]);
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
    setOpenGroups([]);
    setForm(emptyForm());
    setPriceTouched(false);
    setPaidTouched(false);
    setError('');
    setRequiresOverride(false);
    setExistingDebtNotice(0);
  }, [open]);

  // Sotiladigan birliklar: butun chek yoki ko'p tovarli chekning bitta tovari
  const units = useMemo(() => buildSaleUnits(stock), [stock]);

  // Ombor ro'yxati yangilansa — endi mavjud bo'lmagan tanlovlar olib tashlanadi
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = prev.filter((id) => units.some((u) => u.key === id));
      return next.length === prev.length ? prev : next;
    });
  }, [units]);

  const selectedRows = useMemo(
    () => selectedIds.map((id) => units.find((u) => u.key === id)).filter(Boolean) as SaleUnit[],
    [selectedIds, units]
  );
  const costSum = useMemo(() => selectedRows.reduce((sum, r) => sum + r.cost, 0), [selectedRows]);
  // Qisman tanlangan (sotuvda bo'linadigan) cheklar
  const splitDealIds = useMemo(
    () => new Set(buildSaleSelection(units, selectedIds).partial.map((p) => p.dealId)),
    [units, selectedIds]
  );

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
    return units.filter((row) => {
      if (stockStore && row.storeName !== stockStore) return false;
      if (q && !row.searchText.includes(q)) return false;
      return true;
    });
  }, [units, stockSearch, stockStore]);

  // Model bo'yicha guruhlar: "A18 — omborda 5 ta, nechta sotasiz?"
  const groups = useMemo(() => groupStock(visibleStock), [visibleStock]);

  /** Guruhdan nechta sotilishini o'rnatadi: ko'paytirsa — eng eski tanlanmaganlar qo'shiladi, kamaytirsa — oxirgi tanlanganlar olinadi */
  const setGroupQty = (rows: SaleUnit[], qty: number) => {
    const ids = rows.map((r) => r.key);
    const target = Math.max(0, Math.min(ids.length, Math.round(qty) || 0));
    setSelectedIds((prev) => {
      const inGroup = ids.filter((id) => prev.includes(id));
      if (target === inGroup.length) return prev;
      if (target > inGroup.length) {
        const add = ids.filter((id) => !prev.includes(id)).slice(0, target - inGroup.length);
        return [...prev, ...add];
      }
      const drop = new Set(inGroup.slice(target));
      return prev.filter((id) => !drop.has(id));
    });
  };
  const toggleGroupOpen = (key: string) =>
    setOpenGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

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
      // Chekning hamma tovari tanlangan bo'lsa — dealIds; bir qismi bo'lsa — partial (server chekni bo'ladi)
      const { dealIds, partial } = buildSaleSelection(units, selectedIds);
      await axios.post('/api/sales', {
        dealIds,
        ...(partial.length > 0 ? { partial } : {}),
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
      size="full"
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Ombordagi tovarlar — model bo'yicha katta kartochkalar */}
          <div className="min-w-0 space-y-3 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-card bg-brand-soft text-accent">
                  <Warehouse className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-base font-semibold leading-tight text-fg">
                    {t('sales.new.stockTitle')} <span className="text-danger" aria-hidden="true">*</span>
                  </div>
                  <div className="text-xs text-fg-muted">{t('sales.new.stockHint')}</div>
                </div>
              </div>
              <Badge tone="brand">{t('sales.new.stockTotal', { count: units.length })}</Badge>
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
                <div className="sm:w-48">
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

            <div className="max-h-[26rem] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface-2 p-2">
              {stock.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-fg-muted">{t('sales.form.noStock')}</div>
              ) : groups.length === 0 ? (
                <div className="px-3 py-10 text-center text-sm text-fg-muted">{t('sales.new.nothingFound')}</div>
              ) : (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {groups.map((g) => {
                    const picked = g.rows.filter((r) => selectedIds.includes(r.key)).length;
                    const isOpen = openGroups.includes(g.key);
                    const cost = g.rows.reduce((sum, r) => sum + r.cost, 0);
                    return (
                      <li
                        key={g.key}
                        className={cn(
                          'rounded-card border bg-surface p-3 transition-colors',
                          picked > 0 ? 'border-accent ring-1 ring-accent/40' : 'border-line'
                        )}
                      >
                        <div className="line-clamp-2 text-[15px] font-semibold leading-snug text-fg">{g.label}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={picked > 0 ? 'brand' : 'neutral'} size="sm">
                            {t('sales.new.inStock', { count: g.rows.length })}
                          </Badge>
                          <span className="whitespace-nowrap text-xs tabular-nums text-fg-muted">
                            {t('sales.new.avgCost', { amount: formatMoney(cost / g.rows.length) })}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-fg-secondary">{t('sales.new.howMany')}</span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="icon"
                              variant="secondary"
                              onClick={() => setGroupQty(g.rows, picked - 1)}
                              disabled={picked === 0}
                              aria-label={t('sales.new.less')}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span
                              className={cn(
                                'min-w-[3.5rem] whitespace-nowrap rounded-card border px-2 py-1.5 text-center text-base font-bold tabular-nums',
                                picked > 0 ? 'border-accent bg-brand-soft text-accent' : 'border-line bg-surface-2 text-fg-muted'
                              )}
                              aria-live="polite"
                            >
                              {picked} / {g.rows.length}
                            </span>
                            <Button
                              size="icon"
                              variant="secondary"
                              onClick={() => setGroupQty(g.rows, picked + 1)}
                              disabled={picked >= g.rows.length}
                              aria-label={t('sales.new.more')}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            {g.rows.length > 1 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setGroupQty(g.rows, picked === g.rows.length ? 0 : g.rows.length)}
                              >
                                {picked === g.rows.length ? t('sales.new.none') : t('sales.new.all')}
                              </Button>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleGroupOpen(g.key)}
                          className="mt-2 flex w-full items-center justify-between gap-2 rounded-card px-1 py-1 text-xs font-medium text-fg-secondary hover:text-fg"
                          aria-expanded={isOpen}
                        >
                          <span>{t('sales.new.pickByImei')}</span>
                          <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                        </button>
                        {isOpen && (
                          <ul className="mt-1 divide-y divide-line rounded-card border border-line">
                            {g.rows.map((row) => {
                              const checked = selectedIds.includes(row.key);
                              const imeis = row.imeis;
                              return (
                                <li key={row.key}>
                                  <label
                                    className={cn(
                                      'flex min-h-touch cursor-pointer items-start gap-2.5 px-2.5 py-2 transition-colors hover:bg-brand-soft/40',
                                      checked && 'bg-brand-soft/60'
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggle(row.key)}
                                      className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs text-fg-secondary">
                                        {row.partOfCheck ? (
                                          <span className="font-semibold text-accent">
                                            {t('sales.new.fromCheck', { number: row.dealNumber ?? '—' })}
                                          </span>
                                        ) : (
                                          <>№{row.dealNumber ?? '—'}</>
                                        )}{' '}
                                        · {row.storeName || '—'}
                                        {row.quantity > 1 && <span className="ml-1 font-semibold">× {row.quantity}</span>}
                                      </span>
                                      <span className="block truncate font-mono text-xs tabular-nums text-fg-muted">
                                        IMEI: {imeis.length > 0 ? imeis.join(', ') : t('sales.form.noImei')}
                                      </span>
                                      {row.costEstimated && (
                                        <span className="block text-[11px] leading-snug text-warning">
                                          {t('sales.new.costEstimated')}
                                        </span>
                                      )}
                                    </span>
                                    <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-fg-secondary">
                                      {formatMoney(row.cost)}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-xs text-fg-muted">
              {t('sales.new.shownCount', { shown: visibleStock.length, total: units.length })}
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
                <ul className="max-h-[22rem] divide-y divide-line overflow-y-auto overscroll-contain">
                  {selectedRows.map((row) => (
                    <li key={row.key} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{row.productName || '—'}</span>
                        {row.partOfCheck ? (
                          <span
                            className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted"
                            title={splitDealIds.has(row.dealId) ? t('sales.new.fromCheckHint') : undefined}
                          >
                            <Badge tone={splitDealIds.has(row.dealId) ? 'warning' : 'neutral'} size="sm">
                              {t('sales.new.fromCheck', { number: row.dealNumber ?? '—' })}
                            </Badge>
                            <span className="truncate">{row.storeName || '—'}</span>
                          </span>
                        ) : (
                          <span className="block truncate text-xs text-fg-muted">
                            №{row.dealNumber ?? '—'} · {row.storeName || '—'}
                          </span>
                        )}
                        {row.costEstimated && (
                          <span className="block text-[11px] leading-snug text-warning">{t('sales.new.costEstimated')}</span>
                        )}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-fg-secondary">
                        {formatMoney(row.cost)}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-danger sm:min-h-[2rem] sm:min-w-[2rem]"
                        onClick={() => toggle(row.key)}
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
