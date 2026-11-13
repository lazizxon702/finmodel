import React from 'react';
import { Badge, cn } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatMoney } from '../../utils/format';
import { balanceTone, settlementTone, type Settlement } from './storeUtils';

/** Hisob-kitob yo'nalishi yorlig'i: «Do'kon bizga qarzdor» / «Biz qarzdormiz» / «Trust daftarida» */
export const SettlementBadge: React.FC<{ settlement: Settlement; size?: 'sm' | 'md'; className?: string }> = ({
  settlement,
  size = 'md',
  className,
}) => {
  const { t } = useTranslation();
  return (
    <Badge tone={settlementTone(settlement)} size={size} className={className}>
      {t(`stores.dir_${settlement}`)}
    </Badge>
  );
};

/**
 * Kartochkadagi pul qiymati: raqam o'rtasidan sinmaydi (formatMoney oddiy bo'shliq ishlatadi),
 * joy yetmasa faqat valyuta belgisi keyingi qatorga tushadi.
 */
export const MoneyValue: React.FC<{ amount: number | string | null | undefined }> = ({ amount }) => {
  const text = formatMoney(amount);
  const cut = text.lastIndexOf(' ');
  return (
    <>
      <span className="whitespace-nowrap">{text.slice(0, cut)}</span> {text.slice(cut + 1)}
    </>
  );
};

const VALUE_CLASS: Record<string, string> = {
  warning: 'text-warning',
  danger: 'text-danger',
  success: 'text-success',
};

interface BalanceCellProps {
  settlement: Settlement;
  balance: number | null | undefined;
  /** true — summa yonida holat yorlig'i (kim qarzdor / yopilgan) ko'rsatiladi */
  withBadge?: boolean;
}

/**
 * Jadval katagi uchun qoldiq: rang yo'nalishga qarab (do'kon qarzi — warning, bizning qarzimiz — danger,
 * yopilgan — success). Trust do'konlarida raqam o'rniga «Trust daftarida» yorlig'i chiqadi.
 * Summa hech qachon o'rtasidan sinmaydi (whitespace-nowrap).
 */
export const BalanceCell: React.FC<BalanceCellProps> = ({ settlement, balance, withBadge }) => {
  const { t } = useTranslation();
  if (settlement === 'TRUST') {
    return (
      <Badge tone="violet" size="sm">
        {t('stores.dir_TRUST')}
      </Badge>
    );
  }
  const value = Number(balance) || 0;
  const tone = balanceTone(settlement, value);
  const stateKey = value > 0 ? `stores.state_${settlement}` : value < 0 ? 'stores.state_overpaid' : 'stores.state_settled';
  return (
    <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
      <span className={cn('font-semibold tabular-nums', VALUE_CLASS[tone] || 'text-fg')}>{formatMoney(value)}</span>
      {withBadge && (
        <Badge tone={value < 0 ? 'info' : tone} size="sm">
          {t(stateKey)}
        </Badge>
      )}
    </span>
  );
};
