import React from 'react';
import { Badge, cn } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatMoney } from '../../utils/format';
import { balanceTone, settlementTone, type Settlement } from './storeUtils';

/** Hisob-kitob yo'nalishi yorlig'i: «Do'kon bizga qarzdor» / «Trust daftarida» */
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
  info: 'text-info',
  success: 'text-success',
};

interface BalanceCellProps {
  settlement: Settlement;
  /** Do'kon hali qarzdor summa (max(0, qoldiq)) */
  debtLeft: number | null | undefined;
  /** Oldindan to'langan ortiqcha summa (depozit) */
  deposit: number | null | undefined;
  /** true — summa yonida holat yorlig'i (qarzdor / yopilgan) ko'rsatiladi */
  withBadge?: boolean;
}

/**
 * Jadval katagi uchun qoldiq: qolgan qarz (warning) yoki yopilgan (success). Depozit bo'lsa raqam o'rniga
 * alohida «Depozit: X» yorlig'i chiqadi. Trust do'konlarida «Trust daftarida» yorlig'i.
 * Summa hech qachon o'rtasidan sinmaydi (whitespace-nowrap).
 */
export const BalanceCell: React.FC<BalanceCellProps> = ({ settlement, debtLeft, deposit, withBadge }) => {
  const { t } = useTranslation();
  if (settlement === 'TRUST') {
    return (
      <Badge tone="violet" size="sm">
        {t('stores.dir_TRUST')}
      </Badge>
    );
  }
  const left = Number(debtLeft) || 0;
  const dep = Number(deposit) || 0;
  if (dep > 0 && left <= 0) {
    return (
      <Badge tone="info" size="sm" className="whitespace-nowrap">
        {t('stores.deposit_badge', { value: formatMoney(dep) })}
      </Badge>
    );
  }
  const tone = balanceTone(settlement, left, dep);
  return (
    <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
      <span className={cn('font-semibold tabular-nums', VALUE_CLASS[tone] || 'text-fg')}>{formatMoney(left)}</span>
      {withBadge && (
        <Badge tone={tone} size="sm">
          {left > 0 ? t('stores.state_STORE_OWES') : t('stores.state_settled')}
        </Badge>
      )}
    </span>
  );
};
