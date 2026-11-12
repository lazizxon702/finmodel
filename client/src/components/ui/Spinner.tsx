import React from 'react';
import { cn } from '../../lib/cn';

interface SpinnerProps {
  /** sm = 16px, md = 20px, lg = 32px */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Ekran o'quvchilar uchun matn */
  label?: string;
}

const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-5 w-5 border-2', lg: 'h-8 w-8 border-[3px]' };

/** Aylanuvchi yuklanish belgisi. Rangi `currentColor` — ota element matn rangini oladi. */
export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className, label }) => (
  <span
    role="status"
    aria-label={label}
    className={cn(
      'inline-block shrink-0 animate-spin rounded-full border-current border-t-transparent',
      SIZES[size],
      className
    )}
  />
);

/** Kontent yuklanguncha joyini egallab turuvchi kulrang blok. */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-surface-2', className)} />
);

/** Sahifa/blok markazida spinner + matn. */
export const LoadingBlock: React.FC<{ label?: string; className?: string }> = ({ label, className }) => (
  <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-fg-muted', className)}>
    <Spinner size="lg" className="text-accent" />
    {label && <p className="text-sm">{label}</p>}
  </div>
);
