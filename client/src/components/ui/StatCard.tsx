import React from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface StatCardProps {
  /** Ko'rsatkich nomi */
  title: React.ReactNode;
  /** Asosiy qiymat (allaqachon formatlangan) */
  value: React.ReactNode;
  /** Qiymat ostidagi izoh */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** Ikonka va qiymat rangi */
  tone?: Tone;
  /** Berilsa karta tugmaga aylanadi: hover, klaviatura fokusi, Enter/Space */
  onClick?: () => void;
  /** Tanlangan holat (masalan, filtr sifatida ishlatilganda) */
  active?: boolean;
  className?: string;
}

const ICON_TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-secondary',
  brand: 'bg-brand-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

const VALUE_TONE: Record<Tone, string> = {
  neutral: 'text-fg',
  brand: 'text-fg',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-fg',
};

/**
 * Ko'rsatkich kartasi.
 *   <StatCard title={t('x.income')} value={formatMoney(sum)} hint="..." tone="success" icon={<ArrowDown />} />
 *   <StatCard title="..." value="12" onClick={() => setFilter('PENDING')} active={filter === 'PENDING'} />
 */
export const StatCard: React.FC<StatCardProps> = ({ title, value, hint, icon, tone = 'neutral', onClick, active, className }) => {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-xs font-medium leading-snug text-fg-muted">{title}</p>
        {icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-control [&>svg]:h-4 [&>svg]:w-4', ICON_TONE[tone])}>
            {icon}
          </span>
        )}
      </div>
      <p className={cn('mt-2 break-words text-xl font-semibold leading-tight tabular-nums sm:text-2xl', VALUE_TONE[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-fg-muted">{hint}</p>}
    </>
  );

  const base = cn(
    'block w-full rounded-card border bg-surface p-4 text-left shadow-card',
    active ? 'border-accent ring-1 ring-accent' : 'border-line',
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(base, 'cursor-pointer transition-colors duration-150 hover:border-line-strong hover:bg-surface-2')}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
};
