import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Layers,
  LayoutDashboard,
  Package,
  Receipt,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangeFilter,
  EmptyState,
  LoadingBlock,
  PageHeader,
  StatCard,
  Tabs,
  defaultDateRange,
  type DateRangeValue,
  type Tone,
} from '../components/ui';
import { ChartTooltip, chartColors } from '../components/dashboard/ChartTooltip';
import { DailyTable, SegmentTable } from '../components/dashboard/DashboardTables';
import { KpiDetailsModal, type KpiMetric } from '../components/dashboard/KpiDetailsModal';
import { apiErrorMessage, periodLabel, rangeParams } from '../components/dashboard/period';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatDate, formatMoney, formatNumber, todayYmd } from '../utils/format';

type SegmentTab = 'daily' | 'providers' | 'stores' | 'agencies';

// KPI kartochkalari — tartib va ko'rinish. Qiymatlar serverdagi `summary` dan (faqat tasdiqlangan bitimlar).
const KPI_CARDS: { metric: KpiMetric; icon: React.ReactNode; tone: Tone }[] = [
  { metric: 'totalDeals', icon: <Layers />, tone: 'brand' },
  { metric: 'totalLimitVolume', icon: <CreditCard />, tone: 'brand' },
  { metric: 'totalAgentCommission', icon: <Users />, tone: 'neutral' },
  { metric: 'totalBuyoutExpense', icon: <Package />, tone: 'neutral' },
  { metric: 'totalPayout', icon: <Wallet />, tone: 'neutral' },
  { metric: 'grossMargin', icon: <TrendingUp />, tone: 'success' },
  { metric: 'totalQodirChekExpense', icon: <Receipt />, tone: 'neutral' },
];

const axisTick = { fontSize: 11, fill: chartColors.tick };

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('today'));
  const [swotData, setSwotData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<SegmentTab>('daily');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsMetric, setDetailsMetric] = useState<KpiMetric | null>(null);
  const requestId = useRef(0);

  // silent = true — real vaqt hodisasidan keyingi jim yangilash (spinner va xato bloki ko'rsatilmaydi)
  const fetchSwotDaily = useCallback(
    async (silent = false) => {
      const id = ++requestId.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await axios.get('/api/deals/swot-daily', { params: rangeParams(range) });
        if (id !== requestId.current) return; // eskirgan javob
        setSwotData(res.data);
        setError(null);
      } catch (err) {
        if (id !== requestId.current || silent) return;
        setSwotData(null); // eski davr raqamlari yangi davr sarlavhasi ostida qolmasin
        setError(apiErrorMessage(err, t('common.load_error')));
      } finally {
        if (id === requestId.current && !silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.startDate, range.endDate]
  );

  useEffect(() => {
    fetchSwotDaily();
  }, [fetchSwotDaily]);

  useRealtime('deals:updated', () => fetchSwotDaily(true));
  useRealtime('dds:updated', () => fetchSwotDaily(true)); // kassa qoldig'i

  const period = periodLabel(range, t);
  const today = todayYmd();
  const isTodayRange = range.startDate === today && range.endDate === today;

  const summary = swotData?.summary || {};
  const todayKPI = swotData?.todayKPI || {};
  const buyout = swotData?.orderBuyoutAnalytics || {};
  const dailyRows: any[] = swotData?.dailyRows || [];
  const segmentations = swotData?.segmentations || {};
  const providers: any[] = segmentations.providers || [];
  const stores: any[] = segmentations.stores || [];
  const agencies: any[] = segmentations.agencies || [];

  const kpiValue = (metric: KpiMetric, source: any) =>
    metric === 'totalDeals' ? t('common.items_count', { count: formatNumber(source?.[metric]) }) : formatMoney(source?.[metric]);

  const formatAxisMoney = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : formatNumber(v));

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        icon={<LayoutDashboard />}
        title={t('dashboardPage.title')}
        description={t('dashboardPage.period_shown', { period })}
        actions={
          <Button
            variant="secondary"
            onClick={() => fetchSwotDaily()}
            loading={loading && !!swotData}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            {t('common.refresh')}
          </Button>
        }
      />

      <Card padding="sm">
        <DateRangeFilter value={range} onChange={setRange} />
      </Card>

      {loading && !swotData && <LoadingBlock label={t('common.loading')} className="min-h-[40vh]" />}

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle />}
            title={t('common.load_error')}
            description={error}
            action={
              <Button variant="secondary" onClick={() => fetchSwotDaily()}>
                {t('common.retry')}
              </Button>
            }
          />
        </Card>
      )}

      {swotData && (
        <>
          {/* 7 ta KPI — bosilganda tarkibidagi bitimlar ro'yxati ochiladi */}
          <section aria-label={t('dashboardPage.kpi_section', { period })}>
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {KPI_CARDS.map(({ metric, icon, tone }) => (
                <StatCard
                  key={metric}
                  title={t(`dashboardPage.kpi_${metric}`)}
                  value={kpiValue(metric, summary)}
                  hint={
                    isTodayRange
                      ? t('dashboardPage.kpi_open_hint')
                      : t('dashboardPage.kpi_today_hint', { value: kpiValue(metric, todayKPI) })
                  }
                  icon={icon}
                  tone={tone}
                  onClick={() => setDetailsMetric(metric)}
                  active={detailsMetric === metric}
                />
              ))}
            </div>
          </section>

          {/* Xarid holati va kassa */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            <Card>
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  {t('dashboardPage.need_to_buy')}
                </p>
                <Badge tone="warning" size="sm">
                  {t('dashboardPage.deals_count', { count: formatNumber(buyout.needToBuyCount) })}
                </Badge>
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums text-fg">{formatMoney(buyout.needToBuyTotal)}</p>
              <p className="mt-1 text-xs text-fg-muted">{t('dashboardPage.need_to_buy_hint')}</p>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  {t('dashboardPage.bought_goods')}
                </p>
                <Badge tone="success" size="sm">
                  {t('dashboardPage.deals_count', { count: formatNumber(buyout.boughtGoodsCount) })}
                </Badge>
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums text-fg">{formatMoney(buyout.boughtGoodsTotal)}</p>
              <p className="mt-1 truncate text-xs text-fg-muted" title={buyout.boughtGoodsList?.join(', ') || undefined}>
                {buyout.boughtGoodsList?.length > 0 ? buyout.boughtGoodsList.slice(0, 3).join(', ') : t('dashboardPage.bought_goods_hint')}
              </p>
            </Card>

            <Card>
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <Wallet className="h-4 w-4 text-accent" />
                  {t('dashboardPage.free_cash')}
                </p>
                <Badge tone="neutral" size="sm">
                  {t('dashboardPage.free_cash_badge')}
                </Badge>
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums text-fg">{formatMoney(buyout.liquidCash)}</p>
              <p className="mt-1 text-xs text-fg-muted">{t('dashboardPage.free_cash_hint')}</p>
            </Card>
          </div>

          {/* Grafiklar — ranglar tokenlardan (CSS o'zgaruvchilari) */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('dashboardPage.chart_limits_title')} description={period} />
              {dailyRows.length === 0 ? (
                <EmptyState title={t('dashboardPage.period_empty')} className="h-64 py-0" />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyRows} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                      <XAxis dataKey="date" tick={axisTick} tickFormatter={(d) => formatDate(d).slice(0, 5)} stroke={chartColors.grid} />
                      <YAxis tick={axisTick} tickFormatter={formatAxisMoney} stroke={chartColors.grid} />
                      <Tooltip
                        cursor={{ stroke: chartColors.tick, strokeDasharray: '3 3' }}
                        content={
                          <ChartTooltip
                            formatLabel={(l) => formatDate(l)}
                            formatValue={(v) => formatMoney(v)}
                            seriesLabel={t('dashboardPage.chart_volume')}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="limitTotal"
                        stroke={chartColors.primary}
                        strokeWidth={2}
                        fill={chartColors.primary}
                        fillOpacity={0.14}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title={t('dashboardPage.chart_deals_title')} description={period} />
              {dailyRows.length === 0 ? (
                <EmptyState title={t('dashboardPage.period_empty')} className="h-64 py-0" />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyRows} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                      <XAxis dataKey="date" tick={axisTick} tickFormatter={(d) => formatDate(d).slice(0, 5)} stroke={chartColors.grid} />
                      <YAxis tick={axisTick} allowDecimals={false} stroke={chartColors.grid} />
                      <Tooltip
                        cursor={{ fill: chartColors.cursor }}
                        content={
                          <ChartTooltip
                            formatLabel={(l) => formatDate(l)}
                            formatValue={(v) => t('dashboardPage.deals_count', { count: formatNumber(v) })}
                          />
                        }
                      />
                      <Bar dataKey="dealsCount" fill={chartColors.secondary} radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Tabs<SegmentTab>
            ariaLabel={t('dashboardPage.tabs_label')}
            value={activeTab}
            onChange={setActiveTab}
            items={[
              { value: 'daily', label: t('dashboardPage.tab_daily'), count: dailyRows.length },
              { value: 'providers', label: t('dashboardPage.tab_providers'), count: providers.length },
              { value: 'stores', label: t('dashboardPage.tab_stores'), count: stores.length },
              { value: 'agencies', label: t('dashboardPage.tab_agencies'), count: agencies.length },
            ]}
          />

          {activeTab === 'daily' && <DailyTable rows={dailyRows} />}
          {activeTab === 'providers' && (
            <SegmentTable title={t('dashboardPage.seg_providers_title')} nameLabel={t('common.provider')} rows={providers} />
          )}
          {activeTab === 'stores' && (
            <SegmentTable title={t('dashboardPage.seg_stores_title')} nameLabel={t('common.store')} rows={stores} />
          )}
          {activeTab === 'agencies' && (
            <SegmentTable title={t('dashboardPage.seg_agencies_title')} nameLabel={t('common.agency')} rows={agencies} />
          )}
        </>
      )}

      <KpiDetailsModal metric={detailsMetric} range={range} onClose={() => setDetailsMetric(null)} />
    </div>
  );
};
export default DashboardPage;
