import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Wallet, Plus, ArrowDownLeft, ArrowUpRight, Scale, Users } from 'lucide-react';
import { formatMoney } from '../utils/format';
import { AmountInput } from '../components/AmountInput';
import { useTranslation } from '../context/LanguageContext';
import {
  Button, Card, CardHeader, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatCard,
  Tabs, cn, controlClass,
} from '../components/ui';

// Modal pastki panelidagi "Saqlash" tugmasi shu formani yuboradi
const DEPOSIT_FORM_ID = 'balance-deposit-form';

export const BalancePage: React.FC = () => {
  const { t } = useTranslation();
  const [matrixData, setMatrixData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState('2026-11');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');

  // Depozit modali
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [depForm, setDepForm] = useState({
    partnerId: '',
    date: '2026-11-01',
    accountType: 'CASH',
    depositAmount: 10000000,
  });

  useEffect(() => {
    fetchMatrix();
  }, [yearMonth]);

  const fetchMatrix = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/balance/matrix?yearMonth=${yearMonth}`);
      setMatrixData(res.data);
      if (res.data.partners?.length > 0 && !selectedPartnerId) {
        setSelectedPartnerId(res.data.partners[0].partnerId);
        setDepForm((prev) => ({ ...prev, partnerId: res.data.partners[0].partnerId }));
      }
    } catch (err) {
      console.error('Fetch balance matrix error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/balance/deposit', depForm);
      setIsModalOpen(false);
      fetchMatrix();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    }
  };

  const partners: any[] = matrixData?.partners || [];
  const selectedPartner = partners.find((p: any) => p.partnerId === selectedPartnerId) || partners[0];
  const daysInMonth: number = matrixData?.daysInMonth || 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Jadval katakchalari uchun umumiy klasslar
  const stickyFirst = 'sticky left-0 z-10 border-r border-line';
  const cell = 'border-b border-line px-2 py-1.5 text-right';

  // Bitta kichik qator (daromad / xarajat / sof foyda)
  const renderSubRow = (row: any, field: 'income' | 'expense' | 'netProfit', label: string, tone: string, strong?: boolean) => (
    <tr className={cn(tone, strong && 'font-semibold')}>
      <td className={cn(stickyFirst, 'border-b border-line py-1.5 pl-6 pr-3 text-left', strong ? 'bg-surface-2' : 'bg-surface')}>
        {label}
      </td>
      <td className={cn(cell, 'bg-surface-2 px-3 font-semibold')}>{formatMoney(row.monthlyTotals[field])}</td>
      {days.map((d) => (
        <td key={d} className={cn(cell, strong && 'bg-surface-2')}>
          {row.days[d]?.[field] ? formatMoney(row.days[d][field], '') : '-'}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        icon={<Wallet />}
        title={t('balance.title')}
        description={t('balance.subtitle')}
        actions={
          <>
            <input
              type="month"
              aria-label={t('common.month')}
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className={cn(controlClass, 'w-auto tabular-nums')}
            />
            <Button onClick={() => setIsModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
              {t('balance.add_deposit')}
            </Button>
          </>
        }
      />

      {loading && !matrixData ? (
        <Card>
          <LoadingBlock label={t('balance.loading')} />
        </Card>
      ) : partners.length === 0 ? (
        <Card>
          <EmptyState icon={<Users />} title={t('balance.no_partners')} description={t('balance.no_partners_hint')} />
        </Card>
      ) : (
        <>
          {/* Sheriklar */}
          <Tabs
            ariaLabel={t('balance.partners')}
            value={selectedPartner?.partnerId || ''}
            onChange={(partnerId) => {
              setSelectedPartnerId(partnerId);
              setDepForm((prev) => ({ ...prev, partnerId }));
            }}
            items={partners.map((p: any) => ({ value: p.partnerId as string, label: p.partnerName }))}
          />

          {/* Oylik yakunlar */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard title={t('balance.month_deposit')} value={formatMoney(selectedPartner?.monthlyTotals?.deposit)} icon={<Wallet />} />
            <StatCard title={t('balance.month_income')} value={formatMoney(selectedPartner?.monthlyTotals?.income)} icon={<ArrowDownLeft />} tone="success" />
            <StatCard title={t('balance.month_expense')} value={formatMoney(selectedPartner?.monthlyTotals?.expense)} icon={<ArrowUpRight />} tone="danger" />
            <StatCard title={t('balance.net_profit')} value={formatMoney(selectedPartner?.monthlyTotals?.netProfit)} icon={<Scale />} tone="brand" />
          </div>

          {/* Kunlar bo'yicha to'liq jadval */}
          <Card padding="none" className="overflow-hidden">
            <CardHeader
              bordered
              title={t('balance.matrix_title', { name: selectedPartner?.partnerName ?? '', days: daysInMonth })}
            />
            <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 text-xs text-fg-muted lg:hidden">
              <span>{t('balance.swipe_hint')}</span>
              <span className="font-semibold tabular-nums text-fg-secondary">{t('balance.days_count', { count: daysInMonth })}</span>
            </div>

            <div className="table-scroll-container">
              <table className="w-full text-left text-xs tabular-nums text-fg">
                <thead className="table-sticky-head">
                  <tr>
                    <th className={cn(stickyFirst, 'z-30 min-w-[150px] border-b border-line bg-surface-2 px-3 py-2.5 font-semibold text-fg-secondary')}>
                      {t('balance.col_account')}
                    </th>
                    <th className="min-w-[110px] border-b border-line bg-surface-2 px-3 py-2.5 text-right font-semibold text-fg-secondary">
                      {t('balance.col_month_total')}
                    </th>
                    {days.map((d) => (
                      <th key={d} className="min-w-[76px] whitespace-nowrap border-b border-line bg-surface-2 px-2 py-2.5 text-center font-semibold text-fg-secondary">
                        {t('balance.day_n', { n: d })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedPartner?.accountRows?.map((row: any, rIdx: number) => (
                    <React.Fragment key={rIdx}>
                      {/* Depozit qatori */}
                      <tr>
                        <td className={cn(stickyFirst, 'border-b border-line bg-surface px-3 py-2 font-semibold')}>
                          {t('balance.row_deposit', { account: row.accountLabel })}
                        </td>
                        <td className={cn(cell, 'bg-surface-2 px-3 py-2 font-semibold')}>{formatMoney(row.monthlyTotals.deposit)}</td>
                        {days.map((d) => (
                          <td key={d} className={cn(cell, 'py-2 text-fg-secondary')}>
                            {row.days[d]?.deposit ? formatMoney(row.days[d].deposit, '') : '-'}
                          </td>
                        ))}
                      </tr>
                      {renderSubRow(row, 'income', t('balance.row_income'), 'text-success')}
                      {renderSubRow(row, 'expense', t('balance.row_expense'), 'text-danger')}
                      {renderSubRow(row, 'netProfit', t('balance.row_net'), 'text-fg', true)}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Depozit kiritish */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('balance.add_deposit')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form={DEPOSIT_FORM_ID}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id={DEPOSIT_FORM_ID} onSubmit={handleDepositSubmit} className="space-y-4">
          <Field label={t('balance.partner')}>
            <Select value={depForm.partnerId} onChange={(e) => setDepForm({ ...depForm, partnerId: e.target.value })}>
              {partners.map((p: any) => (
                <option key={p.partnerId} value={p.partnerId}>
                  {p.partnerName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('common.date')} required>
            <Input type="date" required value={depForm.date} onChange={(e) => setDepForm({ ...depForm, date: e.target.value })} />
          </Field>

          <Field label={t('balance.col_account')}>
            <Select value={depForm.accountType} onChange={(e) => setDepForm({ ...depForm, accountType: e.target.value })}>
              <option value="CASH">{t('accounts.CASH')}</option>
              <option value="BANK_CARD">{t('accounts.BANK_CARD')}</option>
              <option value="SETTLEMENT_ACCOUNT">{t('accounts.SETTLEMENT_ACCOUNT')}</option>
            </Select>
          </Field>

          <Field label={t('balance.deposit_amount')} required>
            <AmountInput
              required
              placeholder={t('balance.amount_placeholder')}
              value={depForm.depositAmount}
              onChange={(val) => setDepForm({ ...depForm, depositAmount: val })}
              className={cn(controlClass, 'font-semibold tabular-nums')}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
};
