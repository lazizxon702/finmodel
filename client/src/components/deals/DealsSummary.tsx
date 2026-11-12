import React from 'react';
import { useTranslation } from '../../context/LanguageContext';
import { formatMoney, formatNumber, formatPercent } from '../../utils/format';
import { cn } from '../ui';

export interface DealsSummaryTotals {
  dealCount?: number;
  totalLimit?: number;
  totalWithdrawn?: number;
  totalCalculatedAmount?: number;
  totalAgentAmount?: number;
  totalPurchaseCost?: number;
  totalQodirChekExpense?: number;
  totalProfit?: number;
}

interface Props {
  totals: DealsSummaryTotals | null | undefined;
  avgDiscount: number;
  className?: string;
}

const num = (v: unknown) => Number(v) || 0;

/**
 * Bitimlar yig'masi: bitta panel. Chapda asosiy raqam — yechilgan limit va u qayerga ketgani
 * (mijozga to'lov / agent komissiyasi / qolgan farq) nisbat chizig'ida; o'ngda qolgan ko'rsatkichlar.
 * Faqat tasdiqlangan bitimlar bo'yicha.
 */
export const DealsSummary: React.FC<Props> = ({ totals, avgDiscount, className }) => {
  const { t } = useTranslation();

  const count = num(totals?.dealCount);
  const withdrawn = num(totals?.totalWithdrawn);
  const payout = num(totals?.totalCalculatedAmount);
  const agent = num(totals?.totalAgentAmount);
  const rest = Math.max(0, withdrawn - payout - agent);
  const avgCheck = count > 0 ? Math.round(withdrawn / count) : 0;

  const share = (v: number) => (withdrawn > 0 ? Math.max(0, Math.min(100, (v / withdrawn) * 100)) : 0);
  const segments = [
    { key: 'payout', label: t('dealsPage.sum_payout'), value: payout, bar: 'bg-brand', dot: 'bg-brand' },
    { key: 'agent', label: t('dealsPage.sum_agent'), value: agent, bar: 'bg-[rgb(var(--violet,124_92_255))]', dot: 'bg-[rgb(var(--violet,124_92_255))]' },
    { key: 'rest', label: t('dealsPage.sum_rest'), value: rest, bar: 'bg-success', dot: 'bg-success' },
  ];

  // Har bir qo'shimcha ko'rsatkich o'z ma'nosiga mos rang oladi (xarid — xarajat, Qodir aka — ogohlantirish, limit — asosiy hajm)
  const side = [
    { label: t('dealsPage.kpi_purchase'), value: formatMoney(totals?.totalPurchaseCost ?? 0), hint: t('dealsPage.kpi_purchase_hint'), dot: 'bg-danger', text: 'text-danger' },
    { label: t('dealsPage.kpi_qodir'), value: formatMoney(totals?.totalQodirChekExpense ?? 0), hint: t('dealsPage.kpi_qodir_hint'), dot: 'bg-warning', text: 'text-warning' },
    { label: t('dealsPage.kpi_avg_discount'), value: formatPercent(avgDiscount), hint: t('dealsPage.kpi_avg_discount_hint'), dot: 'bg-info', text: 'text-info' },
    { label: t('dealsPage.kpi_total_limit'), value: formatMoney(totals?.totalLimit ?? 0), hint: t('dealsPage.sum_limit_hint'), dot: 'bg-brand', text: 'text-accent' },
  ];

  const profit = num(totals?.totalProfit);

  return (
    <section
      aria-label={t('dealsPage.kpi_label')}
      className={cn('overflow-hidden rounded-card border border-line bg-surface shadow-card', className)}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Asosiy raqam va taqsimot */}
        <div className="p-4 sm:p-6">
          <p className="text-sm text-fg-secondary">{t('dealsPage.sum_withdrawn')}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-fg tabular-nums sm:text-4xl">
            {formatNumber(withdrawn)} <span className="text-base font-medium text-fg-muted sm:text-lg">UZS</span>
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            {t('dealsPage.sum_count_avg', { count, avg: formatMoney(avgCheck) })}
          </p>

          <div
            className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="img"
            aria-label={segments.map((s) => `${s.label}: ${share(s.value).toFixed(1)}%`).join(', ')}
          >
            {segments.map((s) => (
              <div key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.bar)} style={{ width: `${share(s.value)}%` }} />
            ))}
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
            {segments.map((s) => (
              <div key={s.key} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} aria-hidden="true" />
                  <span className="truncate">{s.label}</span>
                </dt>
                <dd className="mt-0.5 text-sm font-semibold text-fg tabular-nums">
                  <span className="whitespace-nowrap">{formatNumber(s.value)}</span>{' '}
                  <span className="whitespace-nowrap text-xs font-normal text-fg-muted">{share(s.value).toFixed(1)}%</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Qolgan ko'rsatkichlar */}
        <div className="border-t border-line bg-surface lg:border-l lg:border-t-0">
          <dl className="grid h-full grid-cols-2 lg:grid-cols-3">
            <div className="col-span-2 flex flex-col justify-center border-b border-line bg-success-soft p-4 sm:p-5 lg:col-span-1 lg:row-span-2 lg:border-b-0 lg:border-r">
              <dt className="text-sm font-medium text-fg-secondary">{t('dealsPage.kpi_profit')}</dt>
              <dd className={cn('mt-1 text-2xl font-semibold tabular-nums', profit < 0 ? 'text-danger' : 'text-success')}>
                {formatNumber(profit)} <span className="text-sm font-medium opacity-70">UZS</span>
              </dd>
              <p className="mt-1 text-xs text-fg-muted">{t('dealsPage.kpi_profit_hint')}</p>
            </div>
            {side.map((m, i) => (
              <div
                key={m.label}
                className={cn(
                  'min-w-0 p-4 sm:px-5',
                  i % 2 === 0 && 'border-r border-line',
                  i < 2 && 'border-b border-line'
                )}
              >
                <dt className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', m.dot)} aria-hidden="true" />
                  <span className="truncate">{m.label}</span>
                </dt>
                <dd className={cn('mt-1 truncate text-base font-semibold tabular-nums', m.text)}>{m.value}</dd>
                <p className="mt-0.5 truncate text-xs text-fg-muted" title={m.hint}>
                  {m.hint}
                </p>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-fg-muted sm:px-6">{t('dealsPage.kpi_note')}</p>
    </section>
  );
};
