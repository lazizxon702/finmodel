import React from 'react';
import { cn } from '../../lib/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Ichki bo'shliq: none (jadval uchun), sm, md (standart), lg */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING = { none: '', sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-6' };

/**
 * Asosiy sirt bloki.
 *   <Card>...</Card>
 *   <Card padding="none"><CardHeader title="..." /> <TableContainer>...</TableContainer></Card>
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', className, children, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-card border border-line bg-surface text-fg shadow-card', PADDING[padding], className)}
      {...rest}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

interface CardHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** O'ng tomondagi tugmalar / filtrlar */
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  /** true — pastida ajratuvchi chiziq va o'z padding'i (padding="none" kartada ishlating) */
  bordered?: boolean;
  className?: string;
}

/** Karta sarlavhasi: chapda nom + tavsif, o'ngda amallar. */
export const CardHeader: React.FC<CardHeaderProps> = ({ title, description, actions, icon, bordered, className }) => (
  <div
    className={cn(
      'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
      bordered ? 'border-b border-line px-4 py-3 sm:px-5' : 'mb-4',
      className
    )}
  >
    <div className="flex min-w-0 items-center gap-2.5">
      {icon && <span className="shrink-0 text-accent">{icon}</span>}
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
