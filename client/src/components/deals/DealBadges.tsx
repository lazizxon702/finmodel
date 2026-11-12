import React from 'react';
import { Badge, approvalTone } from '../ui';
import type { Tone } from '../ui';
import { useTranslation } from '../../context/LanguageContext';

const STATUS_TONE: Record<string, Tone> = {
  IN_WAREHOUSE: 'info',
  IN_TRANSIT: 'brand',
  PENDING: 'warning',
  SOLD: 'success',
  NEED_TO_BUY: 'danger',
  MONEY_RECEIVED: 'success',
  PARTIAL_AMOUNT: 'warning',
};

/** Tovar holati nishoni (Omborda / Sotilgan ...) */
export const DealStatusBadge: React.FC<{ status: string; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const { t } = useTranslation();
  const known = status in STATUS_TONE;
  return (
    <Badge tone={STATUS_TONE[status] || 'neutral'} size={size}>
      {known ? t(`dealStatus.${status}`) : status}
    </Badge>
  );
};

/** Tasdiqlash holati nishoni. Eski yozuvlarda maydon bo'lmasa — tasdiqlangan deb olinadi. */
export const ApprovalBadge: React.FC<{ status?: string | null; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const { t } = useTranslation();
  const value = status || 'APPROVED';
  return (
    <Badge tone={approvalTone(value)} size={size} dot>
      {t(`approval.${value}`)}
    </Badge>
  );
};
