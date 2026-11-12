import React, { useState, useEffect } from 'react';

interface AmountInputProps {
  value: number | string;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
  id?: string;
  /** Masalan Enter bosilganda formani yubormaslik uchun */
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

export const formatSpaced = (val: number | string): string => {
  if (val === undefined || val === null || val === '' || val === 0 || val === '0') return '';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return '';
  // Remove leading zeros
  const normalized = String(parseInt(digits, 10));
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const AmountInput: React.FC<AmountInputProps> = ({
  value,
  onChange,
  className = '',
  placeholder = '0 UZS',
  required = false,
  disabled = false,
  autoFocus = false,
  name,
  id,
  onKeyDown,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}) => {
  const [displayValue, setDisplayValue] = useState<string>(() => {
    const num = Number(value) || 0;
    return num === 0 ? '' : formatSpaced(num);
  });

  // Sync external changes
  useEffect(() => {
    const num = Number(value) || 0;
    const formatted = num === 0 ? '' : formatSpaced(num);
    setDisplayValue(formatted);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setDisplayValue('');
      onChange(0);
      return;
    }
    // Remove leading zeros: '05' -> 5
    const parsed = parseInt(raw, 10);
    const formatted = formatSpaced(parsed);
    setDisplayValue(formatted);
    onChange(parsed);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      id={id}
      name={name}
      autoFocus={autoFocus}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid || undefined}
      className={className}
    />
  );
};
export default AmountInput;
