import React from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary — sahifaning asosiy amali (ko'k); secondary — oddiy; soft — yumshoq ko'k; ghost — fonsiz */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** true bo'lsa spinner ko'rsatiladi va tugma bosilmaydi */
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

// To'ldirilgan tugmalar ostida o'z rangidagi yumshoq soya — sirtdan "ko'tarilib" turadi
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-fg border border-transparent hover:bg-brand-hover ' +
    'shadow-[0_1px_2px_rgb(var(--shadow-color)/0.18),0_6px_14px_-6px_rgb(var(--brand)/0.65)]',
  secondary:
    'bg-surface text-fg border border-line-strong hover:border-accent/50 hover:bg-surface-2 ' +
    'shadow-[0_1px_2px_rgb(var(--shadow-color)/0.05)]',
  soft: 'bg-brand-soft text-accent border border-transparent hover:bg-brand/20',
  ghost: 'bg-transparent text-fg-secondary border border-transparent hover:bg-surface-2 hover:text-fg',
  danger:
    'bg-danger-solid text-white border border-transparent hover:brightness-110 ' +
    'shadow-[0_1px_2px_rgb(var(--shadow-color)/0.18),0_6px_14px_-6px_rgb(var(--danger-solid)/0.6)]',
  success:
    'bg-success-solid text-white border border-transparent hover:brightness-110 ' +
    'shadow-[0_1px_2px_rgb(var(--shadow-color)/0.18),0_6px_14px_-6px_rgb(var(--success-solid)/0.6)]',
};

// Mobil qurilmada 44px teginish maydoni, sm+ ekranda ixchamroq
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-touch sm:min-h-[2rem] px-3 text-[13px] gap-1.5',
  md: 'min-h-touch sm:min-h-[2.5rem] px-4 text-sm gap-2',
  lg: 'min-h-[3rem] px-5 text-[15px] gap-2',
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
        'transition-[background-color,border-color,color,filter,transform] duration-150 active:translate-y-px',
        'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:active:translate-y-0',
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
