import React from 'react';
import { cn } from '../../lib/cn';
import type { Tone } from './StatCard';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Holat rangi: neutral | brand | success | warning | danger | info */
  tone?: Tone;
  size?: 'sm' | 'md';
  /** Matn oldida rangli nuqta */
  dot?: boolean;
  icon?: React.ReactNode;
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-secondary border-line',
  brand: 'bg-brand-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  info: 'bg-info-soft text-info border-transparent',
};

/**
 * Holat yorlig'i.
 *   <Badge tone="warning">{t('approval.PENDING_APPROVAL')}</Badge>
 *   <Badge tone="success" dot>{t('common.active')}</Badge>
 */
export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', size = 'md', dot, icon, className, children, ...rest }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
      TONES[tone],
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
