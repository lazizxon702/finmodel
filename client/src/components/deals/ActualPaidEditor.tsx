import React, { useState } from 'react';
import axios from 'axios';
import { Button, Field, controlClass } from '../ui';
import { AmountInput } from '../AmountInput';
import { useTranslation } from '../../context/LanguageContext';
import { formatMoney } from '../../utils/format';
import type { Deal, Role } from '../../types';
import { apiError } from './dealUtils';

const EDIT_ROLES = new Set(['ADMIN', 'CASHIER', 'MANAGER', 'CFO']);

/**
 * "Faktik berilgan summa" (egasi, 23.11.2026): kassir mijozga pul berganda kiritadi (chek tasdiqlanmaguncha).
 * Tasdiqlangan chekda faqat ko'rsatiladi.
 */
export const ActualPaidEditor: React.FC<{ deal: Deal; role?: Role | null }> = ({ deal, role }) => {
  const { t } = useTranslation();
  const approved = (deal.approvalStatus || 'APPROVED') === 'APPROVED';
  const calculated = Number(deal.calculatedAmount) || 0;
  const initial = deal.actualPaidAmount != null ? Number(deal.actualPaidAmount) : null;
  const [value, setValue] = useState<number>(initial ?? calculated);
  const [saved, setSaved] = useState<number | null>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const canEdit = !approved && EDIT_ROLES.has(String(role || ''));

  if (!canEdit) {
    if (saved === null) return null;
    const diff = saved - calculated;
    return (
      <p className="rounded-control border border-line px-3 py-2 text-sm">
        <span className="text-fg-muted">{t('dealsPage.actual_paid')}:</span>{' '}
        <span className="font-medium tabular-nums">{formatMoney(saved)}</span>
        {diff !== 0 && (
          <span className="ml-2 tabular-nums text-xs text-warning">
            ({diff > 0 ? '+' : '−'}
            {formatMoney(Math.abs(diff))})
          </span>
        )}
      </p>
    );
  }

  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      await axios.post(`/api/deals/${deal.id}/actual-paid`, { amount: value });
      setSaved(value);
      setMsg(t('dealsPage.actual_paid_saved'));
    } catch (e) {
      setMsg(apiError(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field label={t('dealsPage.actual_paid')} hint={t('dealsPage.actual_paid_hint', { amount: formatMoney(calculated) })}>
      <div className="flex gap-2">
        <AmountInput value={value} onChange={(v) => setValue(Number(v) || 0)} className={controlClass + ' tabular-nums'} />
        <Button type="button" variant="secondary" onClick={save} loading={busy} disabled={!(value > 0)}>
          {t('dealsPage.actual_paid_save')}
        </Button>
      </div>
      {msg && <p className="mt-1 text-xs text-fg-secondary">{msg}</p>}
    </Field>
  );
};
