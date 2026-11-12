import React from 'react';
import { cn } from '../../lib/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Ichki bo'shliq: none (jadval uchun), sm, md (standart), lg */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /**
   * Ierarxiya (hamma narsa bir xil ramkali quti bo'lmasin):
   *   default — oddiy kartochka: oq sirt, nozik chegara, yumshoq soya
   *   hero    — asosiy ko'rsatkich paneli: brend ko'k fon, oq matn (ichidagi text-fg/-muted o'zi moslashadi)
   *   soft    — ichki blok: yumshoq fon, ramkasiz, soyasiz (karta ichida)
   *   plain   — ichki bo'lim: fonsiz, ramkasiz (faqat guruhlash va bo'shliq)
   */
  variant?: 'default' | 'hero' | 'soft' | 'plain';
}

const PADDING = { none: '', sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-6' };

const VARIANT = {
  default: 'rounded-card border border-line bg-surface text-fg shadow-card',
  hero: 'fm-hero rounded-card',
  soft: 'rounded-card bg-surface-2 text-fg',
  plain: 'text-fg',
};

/**
 * Asosiy sirt bloki.
 *   <Card>...</Card>
 *   <Card padding="none"><CardHeader title="..." /> <TableContainer>...</TableContainer></Card>
 *   <Card variant="hero">...sahifaning bosh raqami...</Card>
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', variant = 'default', className, children, ...rest }, ref) => (
    <div ref={ref} className={cn(VARIANT[variant], PADDING[padding], className)} {...rest}>
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
      bordered ? 'border-b border-line px-4 py-3.5 sm:px-5' : 'mb-4',
      className
    )}
  >
    <div className="flex min-w-0 items-center gap-2.5">
      {icon && <span className="shrink-0 text-accent">{icon}</span>}
      <div className="min-w-0">
        <h3 className="truncate text-[15px] font-semibold leading-snug text-fg">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
