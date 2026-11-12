import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarCheck, AlertTriangle, CheckCircle, ShoppingBag, ArrowDownLeft, TrendingUp } from 'lucide-react';
import { formatMoney } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { Card, CardHeader, LoadingBlock, PageHeader, StatCard, cn, controlClass } from '../components/ui';

export const DailyAccountingPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState('2026-11');
  const [activeCell, setActiveCell] = useState<{ day: number; code: string; count: number } | null>(null);

  useEffect(() => {
    fetchDailyData();
  }, [yearMonth]);

  const fetchDailyData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/daily?yearMonth=${yearMonth}`);
      setData(res.data);
    } catch (err) {
      console.error('Fetch daily error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCellSave = async (day: number, code: string, count: number) => {
    try {
      await axios.post('/api/daily/cell', {
        yearMonth,
        dayNumber: day,
        providerCode: code,
        dealCount: count,
      });
      setActiveCell(null);
      fetchDailyData();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    }
  };

  if (loading) {
    return (
      <Card>
        <LoadingBlock label={t('daily.loading')} />
      </Card>
    );
  }

  const summary = data?.summary;
  // Server holatni matn ko'rinishida qaytaradi — shu matn bo'yicha kamomadni aniqlaymiz
  const isDeficit = summary?.overallLiquidityStatus?.includes('дефицита') || summary?.overallLiquidityStatus?.includes('UZILISHI');
  const dayList: any[] = data?.days || [];
  const colCount = dayList.length + 2;

  // Jadval katakchalari uchun umumiy klasslar
  const stickyFirst = 'sticky left-0 z-10 border-r border-line';
  const labelCell = cn(stickyFirst, 'border-b border-line bg-surface px-3 py-2 text-left');
  const totalCell = 'border-b border-line bg-surface-2 px-3 py-2 text-right font-semibold';
  const dayCell = 'border-b border-line px-2 py-2 text-right';

  const sectionRow = (label: string) => (
    <tr>
      <td colSpan={colCount} className="border-b border-line bg-surface-2 p-0">
        <div className="sticky left-0 inline-block px-3 py-2 text-xs font-semibold text-fg-secondary">{label}</div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={<CalendarCheck />}
        title={t('daily.title')}
        description={t('daily.subtitle')}
        actions={
          <input
            type="month"
            aria-label={t('common.month')}
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className={cn(controlClass, 'w-auto tabular-nums')}
          />
        }
      />

      {/* Oylik yakunlar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          title={t('daily.devices_bought')}
          value={t('daily.deals_count', { count: summary?.totalDevicesBought ?? 0 })}
          icon={<ShoppingBag />}
          tone="violet"
        />
        <StatCard title={t('daily.revenue')} value={formatMoney(summary?.totalRevenue)} icon={<ArrowDownLeft />} tone="success" />
        <StatCard title={t('daily.net_profit_ebitda')} value={formatMoney(summary?.netProfit)} icon={<TrendingUp />} tone="brand" />
        <StatCard
          title={t('daily.liquidity')}
          value={isDeficit ? t('daily.liq_risk') : t('daily.liq_ok')}
          hint={t('daily.ending_cash', { amount: formatMoney(summary?.endingCash) })}
          icon={isDeficit ? <AlertTriangle /> : <CheckCircle />}
          tone={isDeficit ? 'danger' : 'success'}
          className={isDeficit ? 'border-danger/40 bg-danger-soft' : undefined}
        />
      </div>

      {/* Kunlar bo'yicha hisob matritsasi */}
      <Card padding="none" className="overflow-hidden">
        <CardHeader bordered title={t('daily.matrix_title')} description={t('daily.matrix_hint')} />
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2 text-xs text-fg-muted lg:hidden">
          <span>{t('daily.swipe_hint')}</span>
          <span className="font-semibold tabular-nums text-fg-secondary">{t('daily.days_count', { count: dayList.length })}</span>
        </div>

        <div className="table-scroll-container">
          <table className="w-full text-left text-xs tabular-nums text-fg">
            <thead className="table-sticky-head">
              <tr>
                <th className={cn(stickyFirst, 'z-30 min-w-[200px] border-b border-line bg-surface-2 px-3 py-2.5 font-semibold text-fg-secondary')}>
                  {t('daily.col_item')}
                </th>
                <th className="min-w-[110px] border-b border-line bg-surface-2 px-3 py-2.5 text-right font-semibold text-fg-secondary">
                  {t('daily.col_month_total')}
                </th>
                {dayList.map((d: any) => (
                  <th key={d.dayNumber} className="min-w-[70px] whitespace-nowrap border-b border-line bg-surface-2 px-2 py-2.5 text-center font-semibold text-fg-secondary">
                    {t('daily.day_n', { n: d.dayNumber })}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* 1. Provayderlar kesimida sotib olingan dona */}
              {sectionRow(t('daily.section_ops'))}
              {data?.providers?.map((p: any) => {
                const monthTotal = dayList.reduce((s: number, d: any) => s + (d.providerCounts[p.code] || 0), 0);
                return (
                  <tr key={p.code}>
                    <td className={cn(labelCell, 'font-medium text-fg-secondary')}>{p.name}</td>
                    <td className={totalCell}>{t('common.items_count', { count: monthTotal })}</td>
                    {dayList.map((d: any) => {
                      const count = d.providerCounts[p.code] || 0;
                      const isEditing = activeCell?.day === d.dayNumber && activeCell?.code === p.code;
                      return (
                        <td
                          key={d.dayNumber}
                          onClick={() => setActiveCell({ day: d.dayNumber, code: p.code, count })}
                          className="cursor-pointer border-b border-line px-2 py-2 text-center transition-colors hover:bg-brand-soft"
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              autoFocus
                              aria-label={t('daily.cell_label', { provider: p.name, day: d.dayNumber })}
                              onFocus={(e) => e.target.select()}
                              defaultValue={count}
                              onBlur={(e) => handleCellSave(d.dayNumber, p.code, Number(e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleCellSave(d.dayNumber, p.code, Number((e.target as any).value));
                                }
                              }}
                              className="w-12 rounded border border-accent bg-surface text-center text-xs text-fg outline-none"
                            />
                          ) : (
                            <span className={count > 0 ? 'font-semibold text-fg' : 'text-fg-muted/60'}>{count}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              <tr className="font-semibold">
                <td className={cn(labelCell, 'bg-surface-2')}>{t('daily.total_bought')}</td>
                <td className={totalCell}>{t('common.items_count', { count: summary?.totalDevicesBought ?? 0 })}</td>
                {dayList.map((d: any) => (
                  <td key={d.dayNumber} className="border-b border-line bg-surface-2 px-2 py-2 text-center">
                    {d.dayTotalCount}
                  </td>
                ))}
              </tr>

              {/* 2. Tushum va tannarx */}
              {sectionRow(t('daily.section_revenue'))}
              <tr>
                <td className={labelCell}>{t('daily.row_revenue')}</td>
                <td className={cn(totalCell, 'text-success')}>{formatMoney(summary?.totalRevenue)}</td>
                {dayList.map((d: any) => (
                  <td key={d.dayNumber} className={cn(dayCell, 'text-success')}>
                    {d.totalRevenue > 0 ? formatMoney(d.totalRevenue, '') : '-'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={labelCell}>{t('daily.row_purchase')}</td>
                <td className={totalCell}>{formatMoney(summary?.purchaseCost)}</td>
                {dayList.map((d: any) => (
                  <td key={d.dayNumber} className={cn(dayCell, 'text-fg-secondary')}>
                    {d.purchaseCost > 0 ? formatMoney(d.purchaseCost, '') : '-'}
                  </td>
                ))}
              </tr>
              <tr className="font-semibold text-success">
                <td className={cn(labelCell, 'bg-success-soft')}>{t('daily.row_gross')}</td>
                <td className="border-b border-line bg-success-soft px-3 py-2 text-right">{formatMoney(summary?.grossProfit)}</td>
                {dayList.map((d: any) => (
                  <td key={d.dayNumber} className={cn(dayCell, 'bg-success-soft')}>
                    {d.grossProfit > 0 ? formatMoney(d.grossProfit, '') : '-'}
                  </td>
                ))}
              </tr>

              {/* 3. OPEX va sof foyda */}
              {sectionRow(t('daily.section_opex'))}
              <tr>
                <td className={labelCell}>{t('daily.row_opex')}</td>
                <td className={cn(totalCell, 'text-danger')}>{formatMoney(summary?.totalOpex)}</td>
                {dayList.map((d: any) => (
                  <td key={d.dayNumber} className={cn(dayCell, 'text-danger')}>
                    {formatMoney(d.totalOpex, '')}
                  </td>
                ))}
              </tr>
              <tr className="font-semibold">
                <td className={cn(labelCell, 'bg-brand-soft')}>{t('daily.row_net')}</td>
                <td className="border-b border-line bg-brand-soft px-3 py-2 text-right">{formatMoney(summary?.netProfit)}</td>
                {dayList.map((d: any) => (
                  <td key={d.dayNumber} className={cn(dayCell, 'bg-brand-soft', d.netProfit < 0 && 'text-danger')}>
                    {formatMoney(d.netProfit, '')}
                  </td>
                ))}
              </tr>

              {/* 4. Kassa va likvidlik */}
              {sectionRow(t('daily.section_cash'))}
              <tr className="font-semibold">
                <td className={labelCell}>{t('daily.row_day_end_cash')}</td>
                <td className={totalCell}>{formatMoney(summary?.endingCash)}</td>
                {dayList.map((d: any) => (
                  <td key={d.dayNumber} className={cn(dayCell, d.dayEndCash < 0 && 'bg-danger-soft text-danger')}>
                    {formatMoney(d.dayEndCash, '')}
                  </td>
                ))}
              </tr>
              <tr className="text-xs font-semibold">
                <td className={labelCell}>{t('daily.liquidity')}</td>
                <td className={cn(totalCell, isDeficit ? 'text-danger' : 'text-success')}>
                  {isDeficit ? t('daily.liq_risk') : t('daily.liq_ok')}
                </td>
                {dayList.map((d: any) => {
                  // Server kun holatini ruscha matnda qaytaradi; "В НОРМЕ" — me'yorda
                  const ok = d.liquidityStatus === 'В НОРМЕ';
                  return (
                    <td key={d.dayNumber} className={cn('border-b border-line px-1 py-2 text-center', ok ? 'text-success' : 'text-danger')}>
                      {ok ? t('daily.liq_day_ok') : t('daily.liq_day_gap')}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
