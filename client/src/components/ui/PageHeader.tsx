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
  <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 sm:mb-6', className)}>
    <div className="flex min-w-0 flex-1 basis-full items-center gap-3.5 sm:basis-[22rem]">
      {icon && (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.875rem] bg-brand text-brand-fg shadow-[0_8px_18px_-8px_rgb(var(--brand)/0.7)] [&>svg]:h-[22px] [&>svg]:w-[22px]">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-[1.375rem] font-bold leading-tight text-fg sm:text-[1.625rem]">{title}</h1>
        {description && <p className="mt-1 max-w-[72ch] text-sm leading-snug text-fg-muted">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
