import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Calculator, TrendingUp, Layers, DollarSign, Award } from 'lucide-react';
import { formatMoney, formatPercent } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import {
  Card, CardHeader, LoadingBlock, PageHeader, StatCard, TableContainer, Table, Thead, Tbody, Tr, Th, Td, cn,
} from '../components/ui';

export const FinModelPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModel();
  }, []);

  const fetchModel = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/finmodel');
      setData(res.data);
    } catch (err) {
      console.error('Fetch model error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <LoadingBlock label={t('finmodel.loading')} />
      </Card>
    );
  }

  const { assumptions, providers, months, yearSummary, weightedAvgRate } = data || {};
  const monthList: any[] = months || [];

  const assumptionRows: { label: string; value: React.ReactNode; tone?: string }[] = [
    { label: t('finmodel.a_base_check'), value: formatMoney(assumptions?.baseCheck) },
    { label: t('finmodel.a_wholesale_share'), value: formatPercent(assumptions?.wholesaleShare) },
    { label: t('finmodel.a_retail_share'), value: formatPercent(assumptions?.retailShare) },
    { label: t('finmodel.a_wholesale_coef'), value: `${assumptions?.wholesaleCoef ?? '-'} (-15%)` },
    { label: t('finmodel.a_retail_coef'), value: `${assumptions?.retailCoef ?? '-'} (-5%)` },
    { label: t('finmodel.a_growth'), value: t('finmodel.per_month', { value: formatPercent(assumptions?.monthlyGrowth) }), tone: 'text-success' },
    { label: t('finmodel.a_weighted'), value: formatPercent(weightedAvgRate), tone: 'text-accent' },
  ];

  // P&L jadvali katakchalari uchun umumiy klasslar
  const stickyFirst = 'sticky left-0 z-10 border-r border-line';
  const labelCell = cn(stickyFirst, 'border-b border-line bg-surface px-3 py-2 text-left');
  const totalCell = 'border-b border-line bg-surface-2 px-3 py-2 text-right font-semibold';
  const monthCell = 'border-b border-line px-3 py-2 text-right whitespace-nowrap';

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader icon={<Calculator />} title={t('finmodel.title')} description={t('finmodel.subtitle')} />

      {/* Yillik ko'rsatkichlar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          title={t('finmodel.kpi_deals')}
          value={t('finmodel.devices_count', { count: yearSummary?.totalDeals ?? 0 })}
          hint={t('finmodel.avg_deals', { count: yearSummary?.avgDealsPerMonth ?? 0 })}
          icon={<Layers />}
          tone="violet"
        />
        <StatCard
          title={t('finmodel.kpi_revenue')}
          value={formatMoney(yearSummary?.totalRevenue)}
          hint={t('finmodel.avg_revenue', { amount: formatMoney(yearSummary?.avgRevenuePerMonth) })}
          icon={<DollarSign />}
          tone="success"
        />
        <StatCard
          title={t('finmodel.gross_profit')}
          value={formatMoney(yearSummary?.totalGrossProfit)}
          hint={t('finmodel.margin', { value: formatPercent(yearSummary?.grossMarginPct) })}
          icon={<TrendingUp />}
          tone="info"
        />
        <StatCard
          title={t('finmodel.kpi_net')}
          value={formatMoney(yearSummary?.totalNetProfit)}
          hint={t('finmodel.net_margin', { value: formatPercent(yearSummary?.netMarginPct) })}
          icon={<Award />}
          tone="brand"
          className="border-accent/50"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        {/* Model parametrlari */}
        <Card>
          <CardHeader title={t('finmodel.assumptions')} />
          <dl className="divide-y divide-line text-sm">
            {assumptionRows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-fg-muted">{row.label}</dt>
                <dd className={cn('whitespace-nowrap font-semibold tabular-nums', row.tone ?? 'text-fg')}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Provayderlar */}
        <Card padding="none" className="overflow-hidden lg:col-span-2">
          <CardHeader
            bordered
            title={t('finmodel.providers_title')}
            description={t('finmodel.providers_count', { count: providers?.length || 0 })}
          />
          <TableContainer bare maxHeightClass="max-h-[320px]">
            <Table className="text-xs">
              <Thead>
                <Tr>
                  <Th>{t('finmodel.col_provider')}</Th>
                  <Th align="right">{t('finmodel.col_base')}</Th>
                  <Th align="right">{t('finmodel.col_bonus')}</Th>
                  <Th align="right">{t('finmodel.col_final')}</Th>
                  <Th align="right">{t('finmodel.col_mix')}</Th>
                  <Th align="right">{t('finmodel.col_weighted')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {providers?.map((p: any, i: number) => (
                  <Tr key={i}>
                    <Td className="whitespace-nowrap font-medium">{p.name}</Td>
                    <Td align="right" numeric>{formatPercent(p.baseCommission)}</Td>
                    <Td align="right" numeric className="text-fg-muted">+{formatPercent(p.uzimeiBonus)}</Td>
                    <Td align="right" numeric className="font-semibold text-accent">{formatPercent(p.finalCommission)}</Td>
                    <Td align="right" numeric className="text-fg-secondary">{formatPercent(p.mixShare)}</Td>
                    <Td align="right" numeric className="font-semibold">{formatPercent(p.weightedRate)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>
      </div>

      {/* 12 oylik P&L */}
      <Card padding="none" className="overflow-hidden">
        <CardHeader bordered title={t('finmodel.pnl_title')} />
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 text-xs text-fg-muted lg:hidden">
          <span>{t('finmodel.swipe_hint')}</span>
          <span className="font-semibold tabular-nums text-fg-secondary">{t('finmodel.months_count', { count: monthList.length })}</span>
        </div>
        <div className="table-scroll-container">
          <table className="w-full text-left text-xs tabular-nums text-fg">
            <thead className="table-sticky-head">
              <tr>
                <th className={cn(stickyFirst, 'z-30 min-w-[200px] border-b border-line bg-surface-2 px-3 py-2.5 font-semibold text-fg-secondary')}>
                  {t('finmodel.col_item')}
                </th>
                <th className="min-w-[120px] border-b border-line bg-surface-2 px-3 py-2.5 text-right font-semibold text-fg-secondary">
                  {t('finmodel.col_year_total')}
                </th>
                {monthList.map((m: any) => (
                  <th key={m.monthNumber} className="min-w-[110px] whitespace-nowrap border-b border-line bg-surface-2 px-3 py-2.5 text-right font-semibold text-fg-secondary">
                    {t('finmodel.month_n', { n: m.monthNumber })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="font-semibold">
                <td className={labelCell}>{t('finmodel.row_deals')}</td>
                <td className={totalCell}>{t('common.items_count', { count: yearSummary?.totalDeals ?? 0 })}</td>
                {monthList.map((m: any) => (
                  <td key={m.monthNumber} className={monthCell}>
                    {t('common.items_count', { count: m.dealsCount })}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(labelCell, 'font-semibold')}>{t('finmodel.row_revenue')}</td>
                <td className={cn(totalCell, 'text-success')}>{formatMoney(yearSummary?.totalRevenue)}</td>
                {monthList.map((m: any) => (
                  <td key={m.monthNumber} className={cn(monthCell, 'font-medium text-success')}>
                    {formatMoney(m.totalRevenue)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(labelCell, 'text-fg-secondary')}>{t('finmodel.row_purchase')}</td>
                <td className={totalCell}>{formatMoney(monthList.reduce((s: number, m: any) => s + m.purchaseCost, 0))}</td>
                {monthList.map((m: any) => (
                  <td key={m.monthNumber} className={cn(monthCell, 'text-fg-secondary')}>
                    {formatMoney(m.purchaseCost)}
                  </td>
                ))}
              </tr>
              <tr className="font-semibold text-success">
                <td className={cn(labelCell, 'bg-success-soft')}>{t('finmodel.gross_profit')}</td>
                <td className="border-b border-line bg-success-soft px-3 py-2 text-right">{formatMoney(yearSummary?.totalGrossProfit)}</td>
                {monthList.map((m: any) => (
                  <td key={m.monthNumber} className={cn(monthCell, 'bg-success-soft')}>
                    {formatMoney(m.grossProfit)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cn(labelCell, 'text-danger')}>{t('finmodel.row_opex')}</td>
                <td className={cn(totalCell, 'text-danger')}>{formatMoney(monthList.reduce((s: number, m: any) => s + m.totalOpex, 0))}</td>
                {monthList.map((m: any) => (
                  <td key={m.monthNumber} className={cn(monthCell, 'text-danger')}>
                    {formatMoney(m.totalOpex)}
                  </td>
                ))}
              </tr>
              <tr className="text-[13px] font-semibold">
                <td className={cn(labelCell, 'bg-brand-soft py-2.5')}>{t('finmodel.row_net')}</td>
                <td className="border-b border-line bg-brand-soft px-3 py-2.5 text-right">{formatMoney(yearSummary?.totalNetProfit)}</td>
                {monthList.map((m: any) => (
                  <td key={m.monthNumber} className={cn(monthCell, 'bg-brand-soft py-2.5', m.netProfit < 0 && 'text-danger')}>
                    {formatMoney(m.netProfit)}
                  </td>
                ))}
              </tr>
              <tr className="text-xs text-fg-muted">
                <td className={cn(labelCell, 'border-b-0 py-1.5')}>{t('finmodel.row_net_margin')}</td>
                <td className="bg-surface-2 px-3 py-1.5 text-right font-semibold">{formatPercent(yearSummary?.netMarginPct)}</td>
                {monthList.map((m: any) => (
                  <td key={m.monthNumber} className="px-3 py-1.5 text-right">
                    {formatPercent(m.netMarginPct)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
