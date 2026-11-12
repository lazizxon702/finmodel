import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind.config.js da qo'shilgan maxsus qiymatlarni tailwind-merge'ga tanitamiz,
// aks holda `rounded-card` va `rounded-xl` kabi ziddiyatlar hal qilinmaydi.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['control', 'card', 'sheet'] }],
      shadow: [{ shadow: ['card', 'pop'] }],
      'min-h': [{ 'min-h': ['touch'] }],
      'min-w': [{ 'min-w': ['touch'] }],
    },
  },
});

/**
 * Klasslarni birlashtiradi (clsx) va ziddiyatli Tailwind klasslarini hal qiladi (tailwind-merge).
 * Oxirgi kelgan klass yutadi — komponentga `className` orqali ustidan yozish mumkin.
 * Misol: cn('px-3 py-2', isActive && 'bg-brand text-brand-fg', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
