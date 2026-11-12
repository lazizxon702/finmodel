import React from 'react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  /** Keyingi qadam tugmasi, masalan <Button>{t('common.add')}</Button> */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Bo'sh holat — nima yo'qligini va keyin nima qilish mumkinligini aytadi.
 *   <EmptyState icon={<Inbox />} title={t('x.empty')} description={t('x.empty_hint')} action={<Button>...</Button>} />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-4 py-12 text-center', className)}>
    {icon && (
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-fg-muted [&>svg]:h-6 [&>svg]:w-6">
        {icon}
      </div>
    )}
    <p className="text-sm font-semibold text-fg">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-fg-muted">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
