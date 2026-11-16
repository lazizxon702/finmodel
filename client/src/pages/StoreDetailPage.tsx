import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDownUp,
  ArrowLeft,
  BookOpen,
  HandCoins,
  Handshake,
  Info,
  Layers,
  Receipt,
  Scale,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
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
  Tabs,
  defaultDateRange,
  type DateRangeValue,
} from '../components/ui';
import { apiErrorMessage, periodLabel, rangeParams } from '../components/dashboard/period';
import { isPathAllowed } from '../components/Sidebar';
import { MoneyValue, SettlementBadge } from '../components/stores/SettlementBadge';
import { StoreDealsTable, StoreExpensesTable, StoreLedgerTable } from '../components/stores/StoreDetailTables';
import { balanceTone, settlementCategory, type StoreDetailResponse } from '../components/stores/storeUtils';
import { isQodirStore } from '../components/deals/dealUtils';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatDate, formatMoney, formatNumber } from '../utils/format';

type Section = 'ledger' | 'deals' | 'expenses';
type TypeFilter = 'ALL' | 'DEBT' | 'PAYMENT';

interface StoreDetailPageProps {
  /** true — «Qodir aka daftari» (/qodir-ledger): do'kon id'siz, /api/store-reports/qodir dan olinadi */
  qodir?: boolean;
}

// Bitta do'kon hisoboti: yig'ma ko'rsatkichlar, hisob-kitob (hisoblangan / to'langan / qoldiq),
// daftar yozuvlari, bitimlar va bog'langan DDS xarajatlari.
// Marshrutlar: /stores/:storeId va /qodir-ledger. Real vaqt: stores:updated, deals:updated, dds:updated.
export const StoreDetailPage: React.FC<StoreDetailPageProps> = ({ qodir = false }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { storeId } = useParams<{ storeId: string }>();

  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('month'));
  const [data, setData] = useState<StoreDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('ledger');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const requestId = useRef(0);

  const url = qodir ? '/api/store-reports/qodir' : `/api/store-reports/${encodeURIComponent(storeId || '')}`;

  // silent = true — real vaqt hodisasidan keyingi jim yangilash
  const load = useCallback(
    async (silent = false) => {
      const id = ++requestId.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await axios.get(url, { params: rangeParams(range) });
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
    [url, range.startDate, range.endDate]
  );

  // Boshqa do'konga o'tilganda eski do'kon ma'lumoti ko'rinib qolmasin
  useEffect(() => {
    setData(null);
    setSection('ledger');
    setTypeFilter('ALL');
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime('stores:updated', () => load(true));
  useRealtime('deals:updated', () => load(true));
  useRealtime('dds:updated', () => load(true));

  const settlement = data?.settlement ?? 'STORE_OWES';
  // «Qodir aka» ham do'kon bizga qarzdor yo'nalishida, lekin matnlari alohida (qarz = chek + agent ulushi + foyda)
  const isQodir = qodir || isQodirStore(data?.store?.name);
  const dirKey = isQodir ? 'QODIR' : settlement;
  const isTrust = settlement === 'TRUST';
  // Trust do'konida daftar tabi yo'q — standart bo'lim "Bitimlar"
  const activeSection: Section = isTrust && section === 'ledger' ? 'deals' : section;
  const entries = data?.entries ?? [];
  const visibleEntries = useMemo(
    () => (typeFilter === 'ALL' ? entries : entries.filter((e) => e.type === typeFilter)),
    [entries, typeFilter]
  );
  const deals = data?.deals ?? [];
  const expenses = data?.expenses ?? [];
  const expensesTotal = useMemo(() => expenses.reduce((sum, x) => sum + (Number(x.amount) || 0), 0), [expenses]);

  const summary = data?.summary;
  const periodSum = data?.ledger?.period;
  const overall = data?.ledger?.overall;
  const period = periodLabel(range, t);
  const category = settlementCategory(settlement, isQodir ? "Qodir aka" : data?.store?.name);
  const role = user?.role;
  const canOpenDds = isPathAllowed(role, '/dds');
  const canOpenTrust = isPathAllowed(role, '/trust');

  const title = data?.store?.name || (qodir ? t('title.qodir_ledger') : t('title.store_detail'));

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <Link
          to="/stores"
          className="mb-2 inline-flex min-h-touch items-center gap-1.5 rounded-control text-sm font-medium text-accent hover:underline sm:min-h-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('stores.back_to_list')}
        </Link>
        <PageHeader
          className="mb-0 sm:mb-0"
          icon={qodir ? <BookOpen /> : <Store />}
          title={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="min-w-0 break-words">{title}</span>
              {data &&
                (isQodir && settlement !== 'TRUST' ? (
                  <Badge tone="warning">{t('stores.dir_QODIR')}</Badge>
                ) : (
                  <SettlementBadge settlement={settlement} />
                ))}
              {data?.store?.isActive === false && <Badge tone="neutral">{t('common.inactive')}</Badge>}
            </span>
          }
          description={t('dashboardPage.period_shown', { period })}
        />
      </div>

      <Card padding="sm" className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <DateRangeFilter value={range} onChange={setRange} />
        {data?.ledgerStart && !isTrust && (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted lg:max-w-md">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{t('stores.ledger_start_note', { date: formatDate(data.ledgerStart) })}</span>
          </p>
        )}
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
          {/* Davr bo'yicha yig'ma ko'rsatkichlar */}
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            <StatCard title={t('stores.total_deals')} value={formatNumber(summary?.dealsCount)} icon={<Layers />} tone="brand" />
            <StatCard
              title={t('stores.sum_withdrawn')}
              value={<MoneyValue amount={summary?.withdrawnTotal} />}
              icon={<Wallet />}
              tone="info"
            />
            <StatCard
              title={t('stores.sum_payout')}
              value={<MoneyValue amount={summary?.payoutTotal} />}
              hint={isTrust ? undefined : t(isQodir ? 'stores.sum_payout_hint_QODIR' : 'stores.sum_payout_hint')}
              icon={<HandCoins />}
              tone="violet"
            />
            <StatCard title={t('stores.total_profit')} value={<MoneyValue amount={summary?.profit} />} icon={<TrendingUp />} tone="info" />
            <StatCard
              title={t('stores.sum_deal_expenses')}
              value={<MoneyValue amount={summary?.dealExpenses} />}
              hint={t('stores.sum_deal_expenses_hint')}
              icon={<Receipt />}
              tone="neutral"
            />
            <StatCard
              title={t('stores.total_net_profit')}
              value={<MoneyValue amount={summary?.netProfit} />}
              hint={t('stores.net_profit_hint')}
              icon={<Scale />}
              tone={Number(summary?.netProfit) < 0 ? 'danger' : 'success'}
            />
          </div>

          {/* Hisob-kitob: hisoblangan / to'langan / qoldiq. Trust do'konlari Trust daftarida yuritiladi. */}
          {isTrust ? (
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2.5 text-sm leading-relaxed text-fg-secondary">
                <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
                <span>{t('stores.trust_note')}</span>
              </p>
              {canOpenTrust && (
                <Button variant="soft" className="shrink-0" onClick={() => navigate('/trust')} leftIcon={<Handshake className="h-4 w-4" />}>
                  {t('stores.open_trust')}
                </Button>
              )}
            </Card>
          ) : (
            <Card>
              <CardHeader title={t('stores.settlement_title')} description={t(`stores.settlement_desc_${dirKey}`)} />
              <div className="grid grid-cols-1 gap-x-4 gap-y-5 min-[400px]:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  variant="plain"
                  title={t('stores.led_debt')}
                  value={<MoneyValue amount={overall?.debt} />}
                  hint={t('stores.led_debt_hint', { value: formatMoney(periodSum?.debt) })}
                />
                <StatCard
                  variant="plain"
                  title={t('stores.led_paid')}
                  value={<MoneyValue amount={overall?.paid} />}
                  hint={t('stores.led_paid_hint', { value: formatMoney(periodSum?.paid) })}
                  tone="success"
                />
                <StatCard
                  variant="plain"
                  title={t(`stores.balance_${dirKey}`)}
                  value={<MoneyValue amount={overall?.debtLeft} />}
                  hint={t('stores.led_left_hint')}
                  tone={balanceTone(settlement, overall?.debtLeft, overall?.deposit)}
                />
                <StatCard
                  variant="plain"
                  title={t('stores.led_deposit')}
                  value={<MoneyValue amount={overall?.deposit} />}
                  hint={t(isQodir ? 'stores.led_deposit_hint_QODIR' : 'stores.led_deposit_hint')}
                  tone={Number(overall?.deposit) > 0 ? 'info' : 'neutral'}
                />
              </div>

              {/* Qarzni qanday yopish: DDS'ga tegishli kategoriya bilan qator qo'shiladi */}
              <div className="mt-4 flex flex-col gap-3 rounded-control bg-info-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-xs leading-relaxed text-info">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t(`stores.close_hint_${dirKey}`, { category: category || '' })}</span>
                </p>
                {canOpenDds && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => navigate('/dds')}
                    leftIcon={<ArrowDownUp className="h-4 w-4" />}
                  >
                    {t('stores.open_dds')}
                  </Button>
                )}
              </div>
            </Card>
          )}

          <Card padding="none">
            <Tabs<Section>
              ariaLabel={t('stores.sections')}
              className="px-2 sm:px-3"
              value={activeSection}
              onChange={setSection}
              items={[
                ...(isTrust ? [] : [{ value: 'ledger' as Section, label: t('stores.tab_ledger'), icon: <BookOpen />, count: entries.length }]),
                { value: 'deals', label: t('stores.tab_deals'), icon: <Layers />, count: deals.length },
                { value: 'expenses', label: t('stores.tab_expenses'), icon: <Receipt />, count: expenses.length },
              ]}
            />

            {activeSection === 'ledger' && (
              <>
                <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <p className="text-[13px] text-fg-muted">{t('stores.entries_count', { count: formatNumber(visibleEntries.length) })}</p>
                  <SegmentedControl<TypeFilter>
                    ariaLabel={t('common.type')}
                    size="sm"
                    value={typeFilter}
                    onChange={setTypeFilter}
                    items={[
                      { value: 'ALL', label: t('period.all') },
                      { value: 'DEBT', label: t('stores.filter_debt') },
                      { value: 'PAYMENT', label: t('stores.filter_payment') },
                    ]}
                  />
                </div>
                <StoreLedgerTable entries={visibleEntries} totalCount={entries.length} />
                <p className="border-t border-line px-4 py-2.5 text-xs text-fg-muted sm:px-5">{t(`stores.sign_note_${dirKey}`)}</p>
              </>
            )}

            {activeSection === 'deals' && (
              <>
                <StoreDealsTable deals={deals} isQodir={isQodir} />
                <p className="border-t border-line px-4 py-2.5 text-xs text-fg-muted sm:px-5">{t('stores.deals_note')}</p>
              </>
            )}

            {activeSection === 'expenses' && (
              <>
                <StoreExpensesTable expenses={expenses} />
                <p className="border-t border-line px-4 py-2.5 text-xs tabular-nums text-fg-muted sm:px-5">
                  {t('stores.expenses_total', { count: formatNumber(expenses.length), total: formatMoney(expensesTotal) })}
                </p>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
export default StoreDetailPage;
