// Bitim ustidagi amallar oynalari: tasdiqlash, rad etish, DDS'ga xarajat yozish, o'chirish.
import React, { useRef, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Info } from 'lucide-react';
import { Button, Field, Modal, Select, Textarea } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatDateTime, formatMoney } from '../../utils/format';
import type { Deal } from '../../types';
import { ACCOUNT_CODES, type AccountCode, apiError, cleanText, isQodirStore } from './dealUtils';
import { AmountInput } from '../AmountInput';
import { DealAttachments } from './DealAttachments';
import { Input, controlClass } from '../ui';

interface BaseProps {
  deal: Deal;
  onClose: () => void;
}

const ErrorText: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  children ? (
    <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  ) : null;

/** Bitimning qisqa tavsifi: mijoz, do'kon, mijozga beriladigan summa */
const DealSummary: React.FC<{ deal: Deal }> = ({ deal }) => {
  const { t } = useTranslation();
  const rows: [string, React.ReactNode][] = [
    [t('common.customer'), cleanText(deal.customerName) || '—'],
    [t('common.store'), deal.store?.name || '—'],
    [t('common.customer_payment'), formatMoney(deal.calculatedAmount)],
  ];
  return (
    <dl className="divide-y divide-line rounded-control border border-line text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 px-3 py-2">
          <dt className="shrink-0 text-fg-muted">{label}</dt>
          <dd className="min-w-0 break-words text-right font-medium tabular-nums text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

const AccountSelect: React.FC<{ value: AccountCode; onChange: (v: AccountCode) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => {
  const { t } = useTranslation();
  return (
    <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as AccountCode)}>
      {ACCOUNT_CODES.map((a) => (
        <option key={a} value={a}>
          {t(`accounts.${a}`)}
        </option>
      ))}
    </Select>
  );
};

// ---------------------------------------------------------------------------
// Tasdiqlash (faqat ADMIN)
// ---------------------------------------------------------------------------
interface ApproveResult {
  deal?: Deal;
  trustDebt?: number;
  check?: { transaction?: any; created?: boolean; skippedReason?: string | null } | null;
}

export const ApproveDealModal: React.FC<BaseProps & { onApproved: (deal?: Deal) => void }> = ({ deal, onClose, onApproved }) => {
  const { t } = useTranslation();
  const [account, setAccount] = useState<AccountCode>('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ApproveResult | null>(null);
  const qodir = isQodirStore(deal.store?.name);
  // Faktik berilgan summa (egasi, 23.11.2026): kassir kiritgani yoki hisoblangan summa
  const calculated = Number(deal.calculatedAmount) || 0;
  const [actual, setActual] = useState<number>(deal.actualPaidAmount != null ? Number(deal.actualPaidAmount) : calculated);
  const [reason, setReason] = useState('');
  const [needReason, setNeedReason] = useState(false);
  const diff = actual - calculated;

  const approve = async () => {
    if (busy) return;
    if (needReason && reason.trim().length < 5) {
      setError(t('dealsPage.err_override_reason'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`/api/deals/${deal.id}/approve`, {
        account,
        actualPaidAmount: actual,
        ...(needReason ? { overrideReason: reason.trim() } : {}),
      });
      setResult(res.data || {});
      onApproved(res.data?.deal);
    } catch (err: any) {
      // Hujjat yo'q yoki faktik summa farqi katta — admin sabab yozib qayta tasdiqlaydi
      if (err?.response?.data?.overridable) setNeedReason(true);
      setError(apiError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const tx = result?.check?.transaction;
  const trustDebt = Number(result?.trustDebt) || 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t('dealsPage.approve_title', { number: deal.dealNumber })}
      footer={
        result ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="success" onClick={approve} loading={busy}>
              {t('approval.approve')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            {t('dealsPage.approve_done')}
          </p>
          <dl className="divide-y divide-line rounded-control border border-line text-sm">
            <div className="px-3 py-2.5">
              <dt className="text-xs text-fg-muted">{t('dealsPage.check_expense')}</dt>
              <dd className="mt-0.5 tabular-nums text-fg">
                {tx
                  ? t(result.check?.created ? 'dealsPage.approve_dds_written' : 'dealsPage.approve_dds_existing', {
                      tx: tx.txNumber,
                      amount: formatMoney(tx.amount),
                      account: t(`accounts.${tx.account}`),
                    })
                  : result.check?.skippedReason || t('dealsPage.approve_dds_none')}
              </dd>
            </div>
            <div className="px-3 py-2.5">
              <dt className="text-xs text-fg-muted">{t('dealsPage.trust_debt')}</dt>
              <dd className="mt-0.5 tabular-nums text-fg">
                {trustDebt > 0 ? t('dealsPage.approve_trust_written', { amount: formatMoney(trustDebt) }) : t('dealsPage.approve_trust_none')}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="space-y-4">
          <DealSummary deal={deal} />
          {qodir ? (
            <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t('dealsPage.qodir_note')}
            </p>
          ) : (
            <Field label={t('dealsPage.approve_account')} hint={t('dealsPage.approve_account_hint')}>
              <AccountSelect value={account} onChange={setAccount} disabled={busy} />
            </Field>
          )}
          <Field label={t('dealsPage.actual_paid')} hint={t('dealsPage.actual_paid_hint', { amount: formatMoney(calculated) })}>
            <AmountInput value={actual} onChange={(v) => setActual(Number(v) || 0)} className={controlClass + ' tabular-nums'} />
          </Field>
          {diff !== 0 && (
            <p className="text-xs tabular-nums text-warning">
              {t('dealsPage.actual_paid_diff', { amount: (diff > 0 ? '+' : '−') + formatMoney(Math.abs(diff)) })}
            </p>
          )}
          <DealAttachments dealId={deal.id} canAdd canDelete={() => true} />
          {needReason && (
            <Field label={t('dealsPage.override_reason')} required hint={t('dealsPage.override_reason_hint')}>
              <Input value={reason} autoComplete="off" onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <p className="text-xs leading-relaxed text-fg-muted">{t('dealsPage.approve_effect')}</p>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Rad etish (faqat ADMIN, sabab majburiy)
// ---------------------------------------------------------------------------
export const RejectDealModal: React.FC<BaseProps & { onRejected: (deal?: Deal) => void }> = ({ deal, onClose, onRejected }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reject = async () => {
    if (busy) return;
    if (!reason.trim()) {
      setError(t('dealsPage.reject_reason_required'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await axios.post(`/api/deals/${deal.id}/reject`, { reason: reason.trim() });
      onRejected(res.data?.deal);
    } catch (err) {
      setError(apiError(err, t));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t('dealsPage.reject_title', { number: deal.dealNumber })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={reject} loading={busy}>
            {t('approval.reject')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <DealSummary deal={deal} />
        <Field label={t('approval.rejectReason')} required hint={t('dealsPage.reject_hint')}>
          <Textarea
            autoFocus
            rows={3}
            value={reason}
            invalid={Boolean(error) && !reason.trim()}
            placeholder={t('approval.rejectReason_placeholder')}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// "Rasxod": chek summasini DDS chiqimiga yozish
// ---------------------------------------------------------------------------
export const ExpenseDealModal: React.FC<BaseProps & { onDone: () => void }> = ({ deal, onClose, onDone }) => {
  const { t } = useTranslation();
  const [account, setAccount] = useState<AccountCode>('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: boolean; message: string; transaction?: any } | null>(null);
  // Tugma ikki marta bosilsa ham bitta so'rov ketadi (state yangilanishini kutmasdan bloklaydi)
  const sentRef = useRef(false);
  const qodir = isQodirStore(deal.store?.name);

  const submit = async () => {
    if (sentRef.current) return;
    sentRef.current = true;
    setBusy(true);
    setError('');
    try {
      // Summa yuborilmaydi — server bitimdagi "mijozga to'lov" summasini o'zi oladi
      const res = await axios.post(`/api/deals/${deal.id}/expense-to-dds`, { account });
      const data = res.data || {};
      setResult({
        created: Boolean(data.created),
        message: data.message || data.skippedReason || t('dealsPage.expense_not_written'),
        transaction: data.transaction,
      });
      onDone();
    } catch (err) {
      setError(apiError(err, t));
      sentRef.current = false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t('dealsPage.expense_title', { number: deal.dealNumber })}
      footer={
        result ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={busy}>
              {t('dealsPage.expense_submit')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-2">
          <p
            className={
              result.created
                ? 'rounded-control bg-success-soft px-3 py-2.5 text-sm text-success'
                : 'rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning'
            }
          >
            {result.message}
          </p>
          {result.transaction && (
            <p className="text-xs tabular-nums text-fg-muted">
              {t('dealsPage.expense_written', {
                tx: result.transaction.txNumber,
                amount: formatMoney(result.transaction.amount),
                date: formatDateTime(result.transaction.dateTime),
              })}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <DealSummary deal={deal} />
          {qodir && (
            <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t('dealsPage.qodir_note')}
            </p>
          )}
          <Field label={t('dealsPage.expense_account')} hint={t('dealsPage.expense_hint')}>
            <AccountSelect value={account} onChange={setAccount} disabled={busy} />
          </Field>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// O'chirishni tasdiqlash (confirm() o'rniga)
// ---------------------------------------------------------------------------
export const DeleteDealModal: React.FC<BaseProps & { onDeleted: () => void }> = ({ deal, onClose, onDeleted }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await axios.delete(`/api/deals/${deal.id}`);
      onDeleted();
    } catch (err) {
      setError(apiError(err, t));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('dealsPage.delete_title', { number: deal.dealNumber })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={remove} loading={busy}>
            {t('common.delete')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-secondary">{t('dealsPage.delete_text')}</p>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
};
