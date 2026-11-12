import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTranslation } from '../../context/LanguageContext';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Pastki panel (tugmalar). Doim ko'rinib turadi, kontent esa ichkarida skroll bo'ladi. */
  footer?: React.ReactNode;
  /** Desktopdagi maksimal kenglik */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Fon bosilganda yopilsinmi (standart: ha) */
  closeOnBackdrop?: boolean;
  /** Esc bosilganda yopilsinmi (standart: ha) */
  closeOnEsc?: boolean;
  /** Kontent atrofidagi standart padding'ni o'chirish (masalan jadval uchun) */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-[min(96vw,1200px)]',
};

// Bir vaqtda ochiq modallar soni — body skrollini to'g'ri qulflash/ochish uchun
let openCount = 0;

/**
 * Yagona modal oyna.
 * - Mobil: pastdan chiqadigan to'liq kenglikdagi varaq; sm+ ekranda markazda.
 * - Esc va fon bosilganda yopiladi, kontent ichkarida skroll bo'ladi, body skrolli qulflanadi.
 *
 *   <Modal open={open} onClose={close} title={t('x.add')}
 *          footer={<><Button variant="secondary" onClick={close}>{t('common.cancel')}</Button>
 *                    <Button onClick={save} loading={saving}>{t('common.save')}</Button></>}>
 *     ...forma...
 *   </Modal>
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  flush = false,
  className,
  children,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Esc bilan yopish
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc]);

  // Body skrollini qulflash + fokusni modalga o'tkazish va yopilganda qaytarish
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openCount += 1;
    document.body.style.overflow = 'hidden';
    // Ichidagi element allaqachon fokusda bo'lmasa (autoFocus) — panelning o'ziga fokus
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
      panelRef.current.focus();
    }
    return () => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fm-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-overlay/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'fm-sheet-in flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line bg-elevated text-fg shadow-pop outline-none',
          'rounded-t-sheet sm:max-h-[88vh] sm:rounded-sheet',
          SIZES[size],
          className
        )}
      >
        {(title || description) && (
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6">
            <div className="min-w-0">
              {title && (
                <h2 id={titleId} className="text-[17px] font-semibold leading-snug text-fg">
                  {title}
                </h2>
              )}
              {description && <p className="mt-0.5 text-[13px] leading-snug text-fg-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg sm:h-9 sm:w-9"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', !flush && 'px-4 py-4 sm:px-6 sm:py-5')}>{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface-2/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
