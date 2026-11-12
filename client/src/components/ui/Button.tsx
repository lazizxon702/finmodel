import React from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** true bo'lsa spinner ko'rsatiladi va tugma bosilmaydi */
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover border border-transparent',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-fg-secondary border border-transparent hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger-solid text-white border border-transparent hover:brightness-110',
  success: 'bg-success-solid text-white border border-transparent hover:brightness-110',
};

// Mobil qurilmada 44px teginish maydoni, sm+ ekranda ixchamroq
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-touch sm:min-h-[2rem] px-3 text-xs gap-1.5',
  md: 'min-h-touch sm:min-h-[2.5rem] px-4 text-sm gap-2',
  lg: 'min-h-[3rem] px-5 text-sm gap-2',
  icon: 'min-h-touch min-w-touch sm:min-h-[2.5rem] sm:min-w-[2.5rem] px-0 text-sm',
};

/**
 * Yagona tugma.
 *   <Button onClick={save} loading={saving}>{t('common.save')}</Button>
 *   <Button variant="secondary" leftIcon={<Plus className="h-4 w-4" />}>...</Button>
 *   <Button variant="ghost" size="icon" aria-label={t('common.close')}><X className="h-4 w-4" /></Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, fullWidth, className, children, disabled, type, ...rest },
    ref
  ) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-control font-semibold',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
);
Button.displayName = 'Button';
