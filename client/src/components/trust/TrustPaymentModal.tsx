import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertCircle } from 'lucide-react';
import { Button, Field, Input, Modal, Select, Textarea, cn, controlClass } from '../ui';
import { AmountInput } from '../AmountInput';
import { useTranslation } from '../../context/LanguageContext';
import { formatMoney, formatTime, todayYmd } from '../../utils/format';
import { apiErrorMessage } from '../dashboard/period';

export const TRUST_ACCOUNTS = ['CASH', 'BANK_CARD', 'SETTLEMENT_ACCOUNT'] as const;
export type TrustAccount = (typeof TRUST_ACCOUNTS)[number];

export interface TrustSummary {
  totalDebt: number;
  totalPaid: number;
  balance: number;
}

interface TrustPaymentModalProps {
  open: boolean;
  onClose: () => void;
  /** Joriy qoldiq (butun davr) — forma ichida eslatma sifatida ko'rsatiladi */
  currentBalance?: number;
  /** Muvaffaqiyatli saqlangach: serverdan qaytgan yangi umumiy holat va kiritilgan summa */
  onSaved: (result: { overall: TrustSummary | null; amount: number }) => void;
}

/** Hozirgi lahza Toshkent vaqti bilan: "YYYY-MM-DDTHH:mm" (datetime-local formati) */
const nowLocalTashkent = () => `${todayYmd()}T${formatTime(new Date())}`;

/**
 * "Trust to'lovini kiritish" formasi: Trust pul berdi → DDS'ga "Trust 1 daromadi" kirimi yoziladi
 * va shu summa Trust qarzidan ayiriladi (POST /api/trust/payment).
 */
export const TrustPaymentModal: React.FC<TrustPaymentModalProps> = ({ open, onClose, currentBalance, onSaved }) => {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState<TrustAccount>('CASH');
  const [dateTime, setDateTime] = useState('');
  const [dateTouched, setDateTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Har ochilganda formani tozalaymiz
  useEffect(() => {
    if (!open) return;
    setAmount(0);
    setAccount('CASH');
    setDateTime(nowLocalTashkent());
    setDateTouched(false);
    setDescription('');
    setAmountError(null);
    setServerError(null);
    setSaving(false);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // ikki marta yuborilmasin
    if (!amount || amount <= 0) {
      setAmountError(t('trust.form_amount_required'));
      return;
    }
    setAmountError(null);
    setServerError(null);
    setSaving(true);
    try {
      const res = await axios.post('/api/trust/payment', {
        amount,
        account,
        // Sana o'zgartirilmagan bo'lsa yuborilmaydi — server aniq hozirgi vaqtni yozadi
        dateTime: dateTouched && dateTime ? `${dateTime}:00+05:00` : undefined,
        description: description.trim() || undefined,
      });
      onSaved({ overall: res.data?.overall ?? null, amount });
    } catch (err) {
      setServerError(apiErrorMessage(err, t('common.save_error')));
    } finally {
      setSaving(false);
    }
  };

  const formId = 'trust-payment-form';

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      closeOnBackdrop={!saving}
      title={t('trust.add_payment')}
      description={t('trust.form_description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {t('trust.form_submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {serverError && (
          <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        <Field
          label={t('trust.form_amount')}
          required
          htmlFor="trust-payment-amount"
          error={amountError}
          hint={currentBalance !== undefined ? t('trust.form_balance_hint', { balance: formatMoney(currentBalance) }) : undefined}
        >
          <AmountInput
            id="trust-payment-amount"
            value={amount}
            onChange={(v) => {
              setAmount(v);
              if (v > 0) setAmountError(null);
            }}
            autoFocus
            disabled={saving}
            placeholder={t('trust.form_amount_placeholder')}
            className={cn(controlClass, 'text-base font-semibold tabular-nums', amountError && 'border-danger')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('accounts.label')} htmlFor="trust-payment-account">
            <Select
              id="trust-payment-account"
              value={account}
              onChange={(e) => setAccount(e.target.value as TrustAccount)}
              disabled={saving}
            >
              {TRUST_ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {t(`accounts.${a}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('trust.form_datetime')} htmlFor="trust-payment-datetime" hint={t('period.tashkent_note')}>
            <Input
              id="trust-payment-datetime"
              type="datetime-local"
              value={dateTime}
              max={`${todayYmd()}T23:59`}
              onChange={(e) => {
                setDateTime(e.target.value);
                setDateTouched(true);
              }}
              disabled={saving}
              className="tabular-nums"
            />
          </Field>
        </div>

        <Field label={t('common.comment')} htmlFor="trust-payment-note">
          <Textarea
            id="trust-payment-note"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
            placeholder={t('trust.form_note_placeholder')}
          />
        </Field>
      </form>
    </Modal>
  );
};
