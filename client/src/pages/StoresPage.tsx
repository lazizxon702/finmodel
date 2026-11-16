import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronRight, HandCoins, Info, Layers, PiggyBank, Search, Store, TrendingUp, Scale } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangeFilter,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
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
import { BalanceCell, MoneyValue } from '../components/stores/SettlementBadge';
import type { StoreReportsResponse } from '../components/stores/storeUtils';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatDate, formatMoney, formatNumber } from '../utils/format';

// Do'konlar hisoboti: har bir do'kon bo'yicha bitimlar, foyda va hisob-kitob qoldig'i.
// Marshrut: /stores. Real vaqt: stores:updated, deals:updated, dds:updated.
export const StoresPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('month'));
  const [data, setData] = useState<StoreReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
        const res = await axios.get('/api/store-reports', { params: rangeParams(range) });
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

  useRealtime('stores:updated', () => load(true));
  useRealtime('deals:updated', () => load(true));
  useRealtime('dds:updated', () => load(true));

  const stores = data?.stores ?? [];
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? stores.filter((s) => (s.name || '').toLowerCase().includes(q)) : stores;
  }, [stores, search]);

  const totals = data?.totals;
  const period = periodLabel(range, t);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader icon={<Store />} title={t('title.stores')} description={t('dashboardPage.period_shown', { period })} />

      <Card padding="sm" className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <DateRangeFilter value={range} onChange={setRange} />
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted lg:max-w-md">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>
            {t('stores.rule_note')}
            {data?.ledgerStart ? ` ${t('stores.ledger_start_note', { date: formatDate(data.ledgerStart) })}` : ''}
          </span>
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
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5">
            <StatCard
              title={t('stores.total_deals')}
              value={formatNumber(totals?.dealsCount)}
              hint={t('stores.total_payout_hint', { value: formatMoney(totals?.payoutTotal) })}
              icon={<Layers />}
              tone="brand"
            />
            <StatCard
              title={t('stores.total_profit')}
              value={<MoneyValue amount={totals?.profit} />}
              hint={t('stores.total_expenses_hint', { value: formatMoney(totals?.dealExpenses) })}
              icon={<TrendingUp />}
              tone="info"
            />
            <StatCard
              title={t('stores.total_net_profit')}
              value={<MoneyValue amount={totals?.netProfit} />}
              hint={t('stores.net_profit_hint')}
              icon={<Scale />}
              tone={Number(totals?.netProfit) < 0 ? 'danger' : 'success'}
            />
            <StatCard
              title={t('stores.total_stores_owe')}
              value={<MoneyValue amount={totals?.storesOweUs} />}
              hint={t('stores.overall_balance_hint')}
              icon={<HandCoins />}
              tone={Number(totals?.storesOweUs) > 0 ? 'warning' : 'success'}
            />
            <StatCard
              title={t('stores.total_deposits')}
              value={<MoneyValue amount={totals?.storeDeposits} />}
              hint={t('stores.deposits_hint')}
              icon={<PiggyBank />}
              tone={Number(totals?.storeDeposits) > 0 ? 'info' : 'neutral'}
            />
          </div>

          <Card padding="none">
            <CardHeader
              bordered
              title={t('stores.list_title')}
              description={t('stores.rows', { count: formatNumber(visible.length) })}
              actions={
                <div className="w-full sm:w-64">
                  <Input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('stores.search_placeholder')}
                    aria-label={t('stores.search_placeholder')}
                    leftIcon={<Search />}
                  />
                </div>
              }
            />
            <TableContainer bare maxHeightClass="max-h-[70vh]">
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('stores.col_store')}</Th>
                    <Th align="right">{t('stores.col_deals')}</Th>
                    <Th align="right">{t('stores.col_payout')}</Th>
                    <Th align="right">{t('stores.col_profit')}</Th>
                    <Th align="right">{t('stores.col_deal_expenses')}</Th>
                    <Th align="right">{t('stores.col_net_profit')}</Th>
                    <Th align="right">{t('stores.col_period_balance')}</Th>
                    <Th align="right">{t('stores.col_overall_balance')}</Th>
                    <Th aria-hidden="true" className="w-8" />
                  </Tr>
                </Thead>
                <Tbody>
                  {visible.length === 0 && (
                    <TableEmpty
                      colSpan={9}
                      icon={<Store />}
                      title={stores.length === 0 ? t('stores.empty') : t('stores.empty_filtered')}
                      description={stores.length === 0 ? t('stores.empty_hint') : undefined}
                    />
                  )}
                  {visible.map((s) => {
                    const open = () => navigate(`/stores/${s.storeId}`);
                    return (
                      <Tr
                        key={s.storeId}
                        clickable
                        tabIndex={0}
                        role="link"
                        aria-label={t('stores.open_store', { name: s.name })}
                        onClick={open}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            open();
                          }
                        }}
                        className="focus-visible:bg-brand-soft/40 focus-visible:outline-none"
                      >
                        <Td>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <span className="max-w-[14rem] truncate font-medium" title={s.name}>
                              {s.name}
                            </span>
                            {s.isActive === false && (
                              <Badge tone="neutral" size="sm">
                                {t('common.inactive')}
                              </Badge>
                            )}
                          </span>
                        </Td>
                        <Td align="right" numeric>
                          {formatNumber(s.dealsCount)}
                        </Td>
                        <Td align="right" numeric>
                          {formatMoney(s.payoutTotal)}
                        </Td>
                        <Td align="right" numeric>
                          {formatMoney(s.profit)}
                        </Td>
                        <Td align="right" numeric className="text-fg-secondary">
                          {formatMoney(s.dealExpenses)}
                        </Td>
                        <Td align="right" numeric className={cn('font-semibold', Number(s.netProfit) < 0 ? 'text-danger' : 'text-success')}>
                          {formatMoney(s.netProfit)}
                        </Td>
                        <Td align="right" numeric>
                          <BalanceCell settlement={s.settlement} debtLeft={s.period?.debtLeft} deposit={s.period?.deposit} />
                        </Td>
                        <Td align="right" numeric>
                          <BalanceCell settlement={s.settlement} debtLeft={s.overall?.debtLeft} deposit={s.overall?.deposit} withBadge />
                        </Td>
                        <Td className="text-fg-muted">
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
            <p className="border-t border-line px-4 py-2.5 text-xs text-fg-muted sm:px-5">{t('stores.balance_note')}</p>
          </Card>
        </>
      )}
    </div>
  );
};
export default StoresPage;
