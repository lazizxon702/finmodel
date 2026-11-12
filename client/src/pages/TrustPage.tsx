import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Handshake, HandCoins, Info, Plus, Scale, TrendingUp, Wallet, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangeFilter,
  EmptyState,
  LoadingBlock,
  PageHeader,
  SegmentedControl,
  StatCard,
  Table,
  TableContainer,
  TableEmpty,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  cn,
  defaultDateRange,
  type DateRangeValue,
} from '../components/ui';
import { apiErrorMessage, periodLabel, rangeParams } from '../components/dashboard/period';
import { TrustPaymentModal, type TrustSummary } from '../components/trust/TrustPaymentModal';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatDateTime, formatMoney, formatNumber } from '../utils/format';

interface TrustEntry {
  id: string;
  type: 'DEBT' | 'PAYMENT';
  amount: number;
  dateTime: string;
  dateTimeLabel?: string;
  note?: string | null;
  deal: {
    id: string;
    dealNumber: number | string;
    customerName: string | null;
    withdrawnLimit: number;
    storeName: string | null;
    providerName: string | null;
  } | null;
  ddsTransaction: { id: string; txNumber: string; account: string; sourcePerson?: string | null } | null;
}

interface TrustResponse {
  ratePercent: number;
  period: TrustSummary;
  overall: TrustSummary;
  entries: TrustEntry[];
}

type TypeFilter = 'ALL' | 'DEBT' | 'PAYMENT';

// Serverdagi WRITE_ROLES (trust.routes.ts) bilan bir xil
const WRITE_ROLES = ['ADMIN', 'MANAGER', 'CFO', 'CASHIER'];

// Trust hisob-kitobi: bitimlardan yozilgan qarz (yechilgan limitning 16%) va Trust bergan pul.
// Marshrut: /trust. Real vaqt: trust:updated, deals:updated, dds:updated.
export const TrustPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = !!user && WRITE_ROLES.includes(user.role);

  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('month'));
  const [data, setData] = useState<TrustResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [savedAmount, setSavedAmount] = useState<number | null>(null);
  const requestId = useRef(0);

  // silent = true — real vaqt hodisasidan keyingi jim yangilash
  const load = useCallback(
    async (silent = false) => {
      const id = ++requestId.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await axios.get('/api/trust', { params: rangeParams(range) });
        if (id !== requestId.current) return; // eskirgan javob
        setData(res.data);
        setError(null);
      } catch (err) {
        if (id !== requestId.current || silent) return;
        setData(null);
        setError(apiErrorMessage(err, t('common.load_error')));
      } finally {
        if (id === requestId.current && !silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.startDate, range.endDate]
  );

  useEffect(() => {
    load();
  }, [load]);

  useRealtime('trust:updated', () => load(true));
  useRealtime('deals:updated', () => load(true));
  useRealtime('dds:updated', () => load(true));

  const entries = data?.entries ?? [];
  const visible = useMemo(
    () => (typeFilter === 'ALL' ? entries : entries.filter((e) => e.type === typeFilter)),
    [entries, typeFilter]
  );

  const rate = data?.ratePercent ?? 16;
  const period = periodLabel(range, t);
  const overall = data?.overall;
  const periodSum = data?.period;

  const balanceTone = (balance: number | undefined) => (Number(balance) > 0 ? 'warning' : 'success');
  const overallHint = (value: number | undefined) => t('trust.overall_hint', { value: formatMoney(value) });

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        icon={<Handshake />}
        title={t('title.trust')}
        description={t('dashboardPage.period_shown', { period })}
        actions={
          canWrite ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
              {t('trust.add_payment')}
            </Button>
          ) : undefined
        }
      />

      {savedAmount !== null && (
        <div role="status" className="flex items-start gap-2.5 rounded-card border border-line bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold tabular-nums">{formatMoney(savedAmount)}</span> — {t('trust.saved_message')}
          </p>
          <button
            type="button"
            onClick={() => setSavedAmount(null)}
            aria-label={t('common.close')}
            className="-my-1.5 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-control hover:bg-surface/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card padding="sm" className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <DateRangeFilter value={range} onChange={setRange} />
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted lg:max-w-md">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{t('trust.rule_note', { rate })}</span>
        </p>
      </Card>

      {loading && !data && <LoadingBlock label={t('common.loading')} className="min-h-[30vh]" />}

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle />}
            title={t('common.load_error')}
            description={error}
            action={
              <Button variant="secondary" onClick={() => load()}>
                {t('common.retry')}
              </Button>
            }
          />
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatCard
              title={t('trust.total_debt')}
              value={formatMoney(periodSum?.totalDebt)}
              hint={overallHint(overall?.totalDebt)}
              icon={<TrendingUp />}
            />
            <StatCard
              title={t('trust.total_paid')}
              value={formatMoney(periodSum?.totalPaid)}
              hint={overallHint(overall?.totalPaid)}
              icon={<HandCoins />}
              tone="success"
            />
            <StatCard
              title={t('trust.period_balance')}
              value={formatMoney(periodSum?.balance)}
              hint={t('trust.period_balance_hint')}
              icon={<Scale />}
              tone={balanceTone(periodSum?.balance)}
            />
            <StatCard
              title={t('trust.current_balance')}
              value={formatMoney(overall?.balance)}
              hint={Number(overall?.balance) > 0 ? t('trust.current_balance_hint_owed') : t('trust.current_balance_hint_settled')}
              icon={<Wallet />}
              tone={balanceTone(overall?.balance)}
              className="border-line-strong"
            />
          </div>

          <Card padding="none">
            <CardHeader
              bordered
              title={t('trust.ledger')}
              description={t('trust.rows', { count: formatNumber(visible.length) })}
              actions={
                <SegmentedControl<TypeFilter>
                  ariaLabel={t('common.type')}
                  size="sm"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  items={[
                    { value: 'ALL', label: t('period.all') },
                    { value: 'DEBT', label: t('trust.filter_debt') },
                    { value: 'PAYMENT', label: t('trust.filter_payment') },
                  ]}
                />
              }
            />
            <TableContainer bare maxHeightClass="max-h-[70vh]">
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('trust.col_datetime')}</Th>
                    <Th>{t('common.type')}</Th>
                    <Th>{t('trust.col_source')}</Th>
                    <Th align="right">{t('common.amount')}</Th>
                    <Th>{t('common.comment')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {visible.length === 0 && (
                    <TableEmpty
                      colSpan={5}
                      icon={<Handshake />}
                      title={t('trust.empty')}
                      description={entries.length === 0 ? t('trust.empty_hint') : undefined}
                    />
                  )}
                  {visible.map((e) => {
                    const isDebt = e.type === 'DEBT';
                    return (
                      <Tr key={e.id}>
                        <Td numeric className="text-fg-secondary">
                          {e.dateTimeLabel || formatDateTime(e.dateTime)}
                        </Td>
                        <Td>
                          <Badge tone={isDebt ? 'warning' : 'success'}>
                            {isDebt ? t('trust.type_debt', { rate }) : t('trust.type_payment')}
                          </Badge>
                        </Td>
                        <Td>
                          {e.deal ? (
                            <>
                              <span className="block whitespace-nowrap font-medium tabular-nums">
                                {t('trust.deal_no', { number: e.deal.dealNumber })}
                              </span>
                              <span className="block max-w-[16rem] truncate text-xs text-fg-muted" title={e.deal.customerName || ''}>
                                {e.deal.customerName || '-'}
                                {isDebt && `, ${t('trust.limit_short', { value: formatMoney(e.deal.withdrawnLimit) })}`}
                              </span>
                            </>
                          ) : e.ddsTransaction ? (
                            <>
                              <span className="block whitespace-nowrap font-medium tabular-nums">{e.ddsTransaction.txNumber}</span>
                              <span className="block text-xs text-fg-muted">{t(`accounts.${e.ddsTransaction.account}`)}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </Td>
                        <Td align="right" numeric className={cn('font-semibold', isDebt ? 'text-fg' : 'text-success')}>
                          {isDebt ? '+' : '−'}
                          {formatMoney(e.amount)}
                        </Td>
                        <Td className="max-w-[18rem] text-fg-secondary">
                          <span className="block truncate" title={e.note || ''}>
                            {e.note || '-'}
                          </span>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
            <p className="border-t border-line px-4 py-2.5 text-xs text-fg-muted sm:px-5">{t('trust.sign_note')}</p>
          </Card>
        </>
      )}

      <TrustPaymentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentBalance={overall?.balance}
        onSaved={({ overall: next, amount }) => {
          setModalOpen(false);
          setSavedAmount(amount);
          // Javobdagi yangi umumiy holatni darhol ko'rsatamiz, so'ng ro'yxatni yangilaymiz
          if (next) setData((prev) => (prev ? { ...prev, overall: next } : prev));
          load(true);
        }}
      />
    </div>
  );
};
export default TrustPage;
