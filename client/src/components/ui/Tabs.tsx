import React from 'react';
import { cn } from '../../lib/cn';

export interface TabItem<V extends string = string> {
  value: V;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Yorliq yonidagi son (masalan kutilayotganlar soni) */
  count?: number;
  disabled?: boolean;
}

interface BaseProps<V extends string> {
  items: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
  /** Ekran o'quvchilar uchun guruh nomi */
  ariaLabel?: string;
}

/**
 * Tagiga chizilgan tablar — sahifa bo'limlari orasida o'tish uchun. Mobilda gorizontal skroll.
 *   <Tabs items={[{ value: 'stores', label: t('references.stores') }, ...]} value={tab} onChange={setTab} />
 */
export function Tabs<V extends string>({ items, value, onChange, className, ariaLabel }: BaseProps<V>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('no-scrollbar flex gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              '-mb-px inline-flex min-h-touch shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-sm transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4',
              active ? 'border-accent font-semibold text-accent' : 'border-transparent font-medium text-fg-muted hover:border-line-strong hover:text-fg'
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none',
                  active ? 'bg-brand-soft text-accent' : 'bg-surface-2 text-fg-secondary'
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedProps<V extends string> extends BaseProps<V> {
  size?: 'sm' | 'md';
  /** Bo'limlar butun kenglikni teng bo'lib egallasin */
  fullWidth?: boolean;
}

/**
 * Segmentli almashtirgich — 2–5 ta qisqa variant (ko'rinish, davr, til) uchun.
 *   <SegmentedControl items={[{ value: 'INCOME', label: t('common.income') }, ...]} value={type} onChange={setType} />
 */
export function SegmentedControl<V extends string>({ items, value, onChange, className, ariaLabel, size = 'md', fullWidth }: SegmentedProps<V>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full gap-0.5 rounded-control border border-line bg-surface-2 p-[3px]', fullWidth && 'flex w-full', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.4375rem] transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4',
              size === 'sm' ? 'min-h-[2.25rem] px-2.5 text-xs sm:min-h-[1.75rem]' : 'min-h-[2.5rem] px-3 text-sm sm:min-h-[2rem]',
              fullWidth && 'flex-1',
              // Tanlangan bo'lim: yorug'da oq tugmacha, to'q rejimda ko'tarilgan sirt; matn — accent
              active
                ? 'bg-surface font-semibold text-accent shadow-[0_1px_2px_rgb(var(--shadow-color)/0.14),0_2px_6px_-2px_rgb(var(--shadow-color)/0.14)] dark:bg-elevated'
                : 'font-medium text-fg-secondary hover:text-fg'
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && <span className="tabular-nums text-fg-muted">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
