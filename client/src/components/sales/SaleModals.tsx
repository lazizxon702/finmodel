import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, DollarSign, Edit3, RotateCcw } from 'lucide-react';
import { formatMoney, todayYmd, toYmdTashkent } from '../../utils/format';
import { useTranslation } from '../../context/LanguageContext';
import { AmountInput } from '../AmountInput';
import { Button, Field, Input, Modal, Select, controlClass, cn } from '../ui';
import { SALE_ACCOUNT_TYPES, SaleAccountType, SaleItem, SaleRow, num, saleDisplayNumber } from './saleTypes';

const amountClass = cn(controlClass, 'font-semibold tabular-nums');
const errorText = (err: any): string => err?.response?.data?.error || err?.message || '';
/** 400/409 — odatda sahifadagi ma'lumot eskirgan (boshqa foydalanuvchi to'lov qo'shgan, tovar qaytarilgan ...): ro'yxat qayta yuklanadi */
const isStaleError = (err: any): boolean => [400, 409].includes(err?.response?.status);

// ---------------------------------------------------------------------------
// Sotuvni tahrirlash (yangi, ko'p tovarli sotuv) — PUT /api/sales/:id
// ---------------------------------------------------------------------------
interface EditSaleModalProps {
  sale: SaleRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export const EditSaleModal: React.FC<EditSaleModalProps> = ({ sale, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({ totalPrice: 0, buyerName: '', saleDate: todayYmd(), dueDate: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Qarzi bor xaridor: server 403 requiresOverride qaytarsa administrator kodi so'raladi (NewSaleModal bilan bir xil)
  const [requiresOverride, setRequiresOverride] = useState(false);
  const [existingDebtNotice, setExistingDebtNotice] = useState(0);
  const [adminOverrideCode, setAdminOverrideCode] = useState('');

  // Forma faqat oyna boshqa sotuv uchun ochilganda to'ldiriladi — xatodan keyingi qayta yuklash
  // (sale obyekti yangilanadi) kiritilgan qiymatlar va xato matnini o'chirib yubormaydi
  useEffect(() => {
    if (!sale) return;
    setForm({
      totalPrice: num(sale.totalPrice),
      buyerName: sale.buyerName || '',
      saleDate: sale.saleDate ? toYmdTashkent(sale.saleDate) : todayYmd(),
      dueDate: sale.debtDueDate ? toYmdTashkent(sale.debtDueDate) : '',
      note: sale.note || '',
    });
    setError('');
    setRequiresOverride(false);
    setExistingDebtNotice(0);
    setAdminOverrideCode('');
  }, [sale?.id]);

  if (!sale) return null;

  const received = num(sale.receivedAmount);
  const belowReceived = form.totalPrice < received;
  const newDebt = Math.max(0, form.totalPrice - received);
  const newProfit = form.totalPrice - num(sale.totalCost);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.buyerName.trim()) return setError(t('sales.edit.buyerRequired'));
    if (form.totalPrice <= 0) return setError(t('sales.edit.priceRequired'));
    if (belowReceived) return setError(t('sales.editSale.errBelowReceived', { amount: formatMoney(received) }));
    try {
      setSaving(true);
      setError('');
      await axios.put(`/api/sales/${sale.id}`, {
        totalPrice: form.totalPrice,
        buyerName: form.buyerName.trim(),
        saleDate: form.saleDate,
        dueDate: form.dueDate || null,
        note: form.note.trim(),
        adminOverrideCode: adminOverrideCode || undefined,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.requiresOverride) {
        setRequiresOverride(true);
        setExistingDebtNotice(num(data.totalExistingDebt));
      }
      setError(errorText(err));
      // Eskirgan ma'lumot: xato ko'rsatiladi va ro'yxat (shu oynadagi jami summalar ham) yangilanadi
      if (isStaleError(err)) onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Edit3 className="h-5 w-5 text-accent" />
          {t('sales.edit.title', { number: saleDisplayNumber(sale) })}
        </span>
      }
      description={t('sales.itemsCount', { count: sale.itemsCount })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button type="submit" form="sale-edit-multi-form" loading={saving}>
            {saving ? t('common.saving') : t('sales.edit.save')}
          </Button>
        </>
      }
    >
      <form id="sale-edit-multi-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <Field
            label={t('sales.new.totalPrice')}
            required
            error={belowReceived ? t('sales.editSale.errBelowReceived', { amount: formatMoney(received) }) : undefined}
            hint={t('sales.new.totalPriceHint')}
          >
            <AmountInput
              value={form.totalPrice}
              onChange={(val) => setForm((prev) => ({ ...prev, totalPrice: val }))}
              placeholder={t('sales.form.salePricePlaceholder')}
              aria-invalid={belowReceived}
              className={cn(amountClass, belowReceived && 'border-danger')}
              required
            />
          </Field>
          <Field label={t('sales.form.dueDate')}>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </Field>
          <Field label={t('sales.edit.note')} className="sm:col-span-2">
            <Input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={t('sales.edit.notePlaceholder')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-card border border-line bg-surface-2 p-3 text-xs">
          <div>
            <span className="block text-fg-muted">{t('sales.new.sumReceived')}</span>
            <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-success">{formatMoney(received)}</span>
          </div>
          <div>
            <span className="block text-fg-muted">{t('sales.new.sumDebt')}</span>
            <span className={cn('whitespace-nowrap text-sm font-semibold tabular-nums', newDebt > 0 ? 'text-danger' : 'text-success')}>
              {formatMoney(newDebt)}
            </span>
          </div>
          <div>
            <span className="block text-fg-muted">{t('sales.new.sumProfit')}</span>
            <span className={cn('whitespace-nowrap text-sm font-semibold tabular-nums', newProfit >= 0 ? 'text-success' : 'text-danger')}>
              {formatMoney(newProfit)}
            </span>
          </div>
        </div>

        {/* Xaridorning to'lanmagan qarzi bor — administrator kodi */}
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
              value={adminOverrideCode}
              onChange={(e) => setAdminOverrideCode(e.target.value)}
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

// ---------------------------------------------------------------------------
// To'lov qo'shish — POST /api/sales/:id/payments
// ---------------------------------------------------------------------------
interface SalePaymentModalProps {
  sale: SaleRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export const SalePaymentModal: React.FC<SalePaymentModalProps> = ({ sale, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(0);
  const [accountType, setAccountType] = useState<SaleAccountType>('CASH');
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sale) return;
    setAmount(num(sale.debtRemainder));
    setAccountType('CASH');
    setDate(todayYmd());
    setNote('');
    setError('');
    // Faqat oyna ochilganda: xatodan keyingi qayta yuklash xato matnini o'chirmaydi (qarz esa yangilanadi)
  }, [sale?.id]);

  if (!sale) return null;

  const debt = num(sale.debtRemainder);
  const overDebt = amount > debt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return setError(t('sales.payment.errAmount'));
    if (overDebt) return setError(t('sales.payment.errOverDebt', { amount: formatMoney(debt) }));
    try {
      setSaving(true);
      setError('');
      await axios.post(`/api/sales/${sale.id}/payments`, {
        amount,
        accountType,
        date: date || undefined,
        note: note.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(errorText(err));
      // Masalan qarz shu orada kamaygan: xato ko'rsatiladi va haqiqiy qarz qayta yuklanadi
      if (isStaleError(err)) onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-success" />
          {t('sales.payment.title')}
        </span>
      }
      description={t('sales.payment.line', { number: saleDisplayNumber(sale), name: sale.buyerName || '—' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="sale-payment-form"
            variant="success"
            loading={saving}
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
          >
            {t('sales.payment.submit')}
          </Button>
        </>
      }
    >
      <form id="sale-payment-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-2 p-3.5">
          <div>
            <span className="block text-xs text-fg-muted">{t('sales.payment.currentDebt')}</span>
            <span className="whitespace-nowrap text-lg font-semibold tabular-nums text-danger">{formatMoney(debt)}</span>
          </div>
          <div className="text-right">
            <span className="block text-xs text-fg-muted">{t('sales.payment.afterPayment')}</span>
            <span className="whitespace-nowrap text-lg font-semibold tabular-nums text-success">
              {formatMoney(Math.max(0, debt - amount))}
            </span>
          </div>
        </div>

        <Field
          label={t('sales.payment.amount')}
          required
          error={overDebt ? t('sales.payment.errOverDebt', { amount: formatMoney(debt) }) : undefined}
        >
          <AmountInput
            value={amount}
            onChange={setAmount}
            placeholder="0"
            aria-invalid={overDebt}
            className={cn(amountClass, overDebt && 'border-danger')}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('accounts.label')} required>
            <Select value={accountType} onChange={(e) => setAccountType(e.target.value as SaleAccountType)}>
              {SALE_ACCOUNT_TYPES.map((a) => (
                <option key={a} value={a}>
                  {t(`accounts.${a}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.date')}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label={t('common.note')} hint={t('sales.payment.ddsNote')}>
          <Input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && (
          <p role="alert" className="text-xs font-semibold text-danger">{error}</p>
        )}
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Omborga qaytarish (butun sotuv yoki bitta tovar) — POST /api/sales/:id/return
// ---------------------------------------------------------------------------
export interface SaleReturnTarget {
  sale: SaleRow;
  /** Berilsa faqat shu tovar qaytariladi; aks holda butun sotuv */
  item?: SaleItem;
}

interface SaleReturnModalProps {
  target: SaleReturnTarget | null;
  onClose: () => void;
  onDone: () => void;
}

export const SaleReturnModal: React.FC<SaleReturnModalProps> = ({ target, onClose, onDone }) => {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  /** Muvaffaqiyatli qaytarishdan keyin: server xaridorga qaytargan summa (null — hali bajarilmagan) */
  const [refunded, setRefunded] = useState<number | null>(null);

  useEffect(() => {
    setError('');
    setRefunded(null);
  }, [target?.sale.id, target?.item?.dealId]);

  if (!target) return null;
  const { sale, item } = target;
  // Butun sotuv qaytarilsa olingan pulning hammasi qaytadi; bitta tovarda summa serverda hisoblanadi (oldindan aytilmaydi)
  const received = num(sale.receivedAmount);
  const done = refunded !== null;

  const handleConfirm = async () => {
    try {
      setWorking(true);
      setError('');
      const res = await axios.post(`/api/sales/${sale.id}/return`, item ? { dealIds: [item.dealId] } : {});
      setRefunded(num(res.data?.refunded));
      onDone();
    } catch (err: any) {
      setError(errorText(err));
      // Sotuv shu orada o'zgargan/qaytarilgan bo'lishi mumkin — ro'yxat yangilanadi
      if (isStaleError(err)) onDone();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-warning" />
          {item ? t('sales.return.titleItem') : t('sales.return.titleSale')}
        </span>
      }
      description={t('sales.payment.line', { number: saleDisplayNumber(sale), name: sale.buyerName || '—' })}
      footer={
        done ? (
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={working} onClick={handleConfirm} leftIcon={<RotateCcw className="h-4 w-4" />}>
              {t('sales.revert.button')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex items-start gap-2 rounded-card border border-success/40 bg-success-soft p-3 text-sm font-medium text-success" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {t('sales.return.done')}
            <span className="mt-1 block font-semibold tabular-nums">
              {refunded! > 0
                ? t('sales.return.refunded', { amount: formatMoney(refunded!) })
                : t('sales.return.noRefund')}
            </span>
          </span>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="leading-relaxed text-fg-secondary">
            {item
              ? t('sales.return.questionItem', { product: item.productName || '—', number: item.dealNumber ?? '—' })
              : t('sales.return.questionSale', { count: sale.itemsCount })}
          </p>
          <div className="flex items-start gap-2 rounded-card border border-warning/40 bg-warning-soft p-3 text-xs font-medium text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {item ? t('sales.return.moneyNoteItem') : t('sales.return.moneyNote')}
              {!item && received > 0 && (
                <span className="mt-1 block whitespace-nowrap font-semibold tabular-nums">
                  {t('sales.return.received', { amount: formatMoney(received) })}
                </span>
              )}
            </span>
          </div>
          {error && (
            <p role="alert" className="text-xs font-semibold text-danger">{error}</p>
          )}
        </div>
      )}
    </Modal>
  );
};
