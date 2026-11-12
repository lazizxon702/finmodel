import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Barcha forma boshqaruvlari uchun umumiy klass (o'z elementingizga ham qo'llash mumkin). */
export const controlClass =
  'block w-full min-h-touch sm:min-h-[2.5rem] rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-fg ' +
  'placeholder:text-fg-muted transition-colors duration-150 ' +
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60';

const invalidClass = 'border-danger focus:border-danger focus:ring-danger/25';

// ---------------------------------------------------------------------------
// Field — label + boshqaruv + xato/izoh matni
// ---------------------------------------------------------------------------
export interface FieldProps {
  label?: React.ReactNode;
  /** Xato matni (bo'lsa qizil rangda ko'rsatiladi) */
  error?: React.ReactNode;
  /** Yordamchi izoh (xato bo'lmasa ko'rinadi) */
  hint?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 *   <Field label={t('common.amount')} error={errors.amount} required>
 *     <Input type="number" value={amount} onChange={...} invalid={!!errors.amount} />
 *   </Field>
 */
export const Field: React.FC<FieldProps> = ({ label, error, hint, required, htmlFor, className, children }) => (
  <div className={cn('min-w-0', className)}>
    {label && (
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-fg-secondary">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
    )}
    {children}
    {error ? (
      <p role="alert" className="mt-1 text-xs text-danger">
        {error}
      </p>
    ) : hint ? (
      <p className="mt-1 text-xs text-fg-muted">{hint}</p>
    ) : null}
  </div>
);

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** Chap tomondagi ikonka (masalan qidiruv) */
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ invalid, leftIcon, className, ...rest }, ref) => {
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClass, invalid && invalidClass, leftIcon && 'pl-9', className)}
      {...rest}
    />
  );
  if (!leftIcon) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted [&>svg]:h-4 [&>svg]:w-4">
        {leftIcon}
      </span>
      {input}
    </div>
  );
});
Input.displayName = 'Input';

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ invalid, className, children, ...rest }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(controlClass, 'appearance-none pr-9', invalid && invalidClass, className)}
      {...rest}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
  </div>
));
Select.displayName = 'Select';

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ invalid, className, rows = 3, ...rest }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    aria-invalid={invalid || undefined}
    className={cn(controlClass, 'resize-y leading-relaxed', invalid && invalidClass, className)}
    {...rest}
  />
));
Textarea.displayName = 'Textarea';
