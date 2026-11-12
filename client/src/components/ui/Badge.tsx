import React from 'react';
import { cn } from '../../lib/cn';
import type { Tone } from './StatCard';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Holat rangi: neutral | brand | success | warning | danger | info | violet */
  tone?: Tone;
  size?: 'sm' | 'md';
  /** soft — yumshoq fon (standart); solid — to'ldirilgan (muhim hisoblagich, "yangi" belgisi) */
  variant?: 'soft' | 'solid';
  /** Matn oldida rangli nuqta */
  dot?: boolean;
  icon?: React.ReactNode;
}

const SOFT: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-secondary border-line',
  brand: 'bg-brand-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  info: 'bg-info-soft text-info border-transparent',
  violet: 'bg-violet-soft text-violet border-transparent',
};

const SOLID: Record<Tone, string> = {
  neutral: 'bg-fg text-fg-inverse border-transparent',
  brand: 'bg-brand text-brand-fg border-transparent',
  success: 'bg-success-solid text-white border-transparent',
  warning: 'bg-warning-solid text-warning-fg border-transparent',
  danger: 'bg-danger-solid text-white border-transparent',
  info: 'bg-info-solid text-white border-transparent',
  violet: 'bg-violet-solid text-white border-transparent',
};

/**
 * Holat yorlig'i.
 *   <Badge tone="warning">{t('approval.PENDING_APPROVAL')}</Badge>
 *   <Badge tone="success" dot>{t('common.active')}</Badge>
 *   <Badge tone="violet">Trust</Badge>
 */
export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', size = 'md', variant = 'soft', dot, icon, className, children, ...rest }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-[3px] text-xs',
      (variant === 'solid' ? SOLID : SOFT)[tone],
      className
    )}
    {...rest}
  >
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
    {icon}
    {children}
  </span>
);

/** Tasdiqlash holati → Badge rangi. Ishlatish: <Badge tone={approvalTone(deal.approvalStatus)}> */
export function approvalTone(status?: string | null): Tone {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'PENDING_APPROVAL':
      return 'warning';
    default:
      return 'neutral';
  }
}
