import React from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';

export interface StatCardProps {
  /** Ko'rsatkich nomi */
  title: React.ReactNode;
  /** Asosiy qiymat (allaqachon formatlangan) */
  value: React.ReactNode;
  /** Qiymat ostidagi izoh */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** Ikonka belgisi va qiymat rangi: neutral | brand | success | warning | danger | info | violet */
  tone?: Tone;
  /**
   * Ierarxiya:
   *   card  — oddiy kartochka (standart)
   *   hero  — sahifaning ASOSIY ko'rsatkichi: brend ko'k fon, oq yirik raqam (sahifada 1 ta, ko'pi bilan 2 ta)
   *   plain — ramkasiz, fonsiz (boshqa karta ichidagi ko'rsatkich)
   */
  variant?: 'card' | 'hero' | 'plain';
  /** Berilsa karta tugmaga aylanadi: hover, klaviatura fokusi, Enter/Space */
  onClick?: () => void;
  /** Tanlangan holat (masalan, filtr sifatida ishlatilganda) */
  active?: boolean;
  className?: string;
}

// Ikonka belgisi: yumshoq rangli fon + to'q rangli ikonka
const ICON_TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-secondary',
  brand: 'bg-brand-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
};

// Pul ma'nosi bor tonlarda raqamning o'zi ham rangli (kirim/chiqim/kutilmoqda); qolganlarida siyoh
const VALUE_TONE: Record<Tone, string> = {
  neutral: 'text-fg',
  brand: 'text-fg',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-fg',
  violet: 'text-fg',
};

/**
 * Ko'rsatkich kartasi.
 *   <StatCard title={t('x.income')} value={formatMoney(sum)} hint="..." tone="success" icon={<ArrowDown />} />
 *   <StatCard variant="hero" title={t('x.cash')} value={formatMoney(cash)} icon={<Wallet />} />
 *   <StatCard title="..." value="12" onClick={() => setFilter('PENDING')} active={filter === 'PENDING'} />
 */
export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  hint,
  icon,
  tone = 'neutral',
  variant = 'card',
  onClick,
  active,
  className,
}) => {
  const hero = variant === 'hero';

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 pt-0.5 text-[13px] font-medium leading-snug text-fg-secondary">{title}</p>
        {icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-control [&>svg]:h-[18px] [&>svg]:w-[18px]',
              hero ? 'bg-white/15 text-white' : ICON_TONE[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn(
          'fm-num mt-2.5 break-words font-bold leading-[1.1]',
          hero ? 'fm-stat-value-hero text-fg' : ['fm-stat-value', VALUE_TONE[tone]]
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs leading-snug text-fg-muted">{hint}</p>}
    </>
  );

  const base = cn(
    'fm-stat block w-full text-left',
    variant === 'card' && 'rounded-card border bg-surface p-4 shadow-card',
    variant === 'card' && (active ? 'border-accent bg-brand-soft/40 ring-2 ring-accent/25' : 'border-line'),
    hero && 'fm-hero rounded-card p-4 sm:p-5',
    hero && active && 'outline outline-2 outline-offset-2 outline-brand',
    variant === 'plain' && 'rounded-control',
    variant === 'plain' && active && 'bg-brand-soft/50',
    className
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cn(
          base,
          'cursor-pointer transition-[border-color,box-shadow,background-color,filter,transform] duration-150 active:translate-y-px',
          variant === 'card' && 'hover:border-accent/60 hover:shadow-pop',
          hero && 'hover:brightness-110',
          variant === 'plain' && 'hover:bg-surface-2'
        )}
      >
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
};
