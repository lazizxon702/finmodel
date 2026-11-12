import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Macmobi belgisi: ko'k plitka, oq "M" va to'q sariq nuqta. SVG — har qanday fonda (to'q yon menyu,
 * oq kirish sahifasi) va har qanday o'lchamda tiniq. O'lcham className orqali: <BrandMark className="h-10 w-10" />
 */
export const BrandMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className={cn('h-10 w-10 shrink-0', className)}>
    <rect width="48" height="48" rx="13" fill="#2563F0" />
    <path d="M13.5 34V17.5L24 28l10.5-9.5V34" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="35.5" cy="10.5" r="3.4" fill="#FF8A1F" />
  </svg>
);
