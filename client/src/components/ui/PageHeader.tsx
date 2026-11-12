import React from 'react';
import { cn } from '../../lib/cn';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** O'ng tomondagi amallar (tugmalar, filtrlar). Mobilda sarlavha ostiga tushadi. */
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Sahifa sarlavhasi.
 *   <PageHeader title={t('balance.title')} description={t('balance.subtitle')}
 *               actions={<Button leftIcon={<Plus className="h-4 w-4" />}>{t('common.add')}</Button>} />
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions, icon, className }) => (
  <div className={cn('mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between', className)}>
    <div className="flex min-w-0 items-start gap-3">
      {icon && (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-accent [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-lg font-semibold leading-tight tracking-tight text-fg sm:text-xl">{title}</h1>
        {description && <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-fg-muted">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
