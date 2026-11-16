import React from 'react';
import { cn } from '../../lib/cn';

/**
 * Macmobi belgisi: ko'k plitka, oq "M" va to'q sariq nuqta. SVG — har qanday fonda (to'q yon menyu,
 * oq kirish sahifasi) va har qanday o'lchamda tiniq. O'lcham className orqali: <BrandMark className="h-10 w-10" />
 *
 * `animated` — kirish sahifasidagi "intro": plitka nuqtadan o'sib chiqadi, "M" chiziladi, to'q sariq nuqta
 * yuqoridan tushadi, to'lqin tarqaladi va ustidan yaltiroq o'tadi (uslublar index.css da: .fm-logo-*).
 * Sahifada bir vaqtda faqat bitta animatsiyali belgi bo'lishi kerak (clipPath id bitta).
 */
export const BrandMark: React.FC<{ className?: string; animated?: boolean }> = ({ className, animated }) => {
  if (!animated) {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className={cn('h-10 w-10 shrink-0', className)}>
        <rect width="48" height="48" rx="13" fill="#2563F0" />
        <path d="M13.5 34V17.5L24 28l10.5-9.5V34" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="35.5" cy="10.5" r="3.4" fill="#FF8A1F" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn('fm-logo h-10 w-10 shrink-0 overflow-visible', className)}>
      <defs>
        <clipPath id="fm-logo-clip">
          <rect width="48" height="48" rx="13" />
        </clipPath>
        <linearGradient id="fm-logo-shine-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="fm-logo-box">
        <rect width="48" height="48" rx="13" fill="#2563F0" />
        <path
          className="fm-logo-m"
          pathLength={1}
          d="M13.5 34V17.5L24 28l10.5-9.5V34"
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g clipPath="url(#fm-logo-clip)">
          <rect className="fm-logo-shine" x="-30" y="-12" width="22" height="72" fill="url(#fm-logo-shine-grad)" />
        </g>
      </g>
      <circle className="fm-logo-ring" cx="35.5" cy="10.5" r="3.4" fill="none" stroke="#fff" strokeWidth="0.5" />
      <circle className="fm-logo-dot" cx="35.5" cy="10.5" r="3.4" fill="#FF8A1F" />
    </svg>
  );
};
