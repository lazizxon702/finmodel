import React from 'react';
import { Badge, Card, CardHeader, Table, TableContainer, TableEmpty, Tbody, Td, Th, Thead, Tr } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../../utils/format';

/** 0 yoki bo'sh summa o'rniga chiziqcha */
const moneyOrDash = (v: unknown) => (Number(v) > 0 ? formatMoney(v as number) : '-');

/** Kunlik SWOT jadvali — tanlangan davrdagi har bir kun bo'yicha yig'ma. */
export const DailyTable: React.FC<{ rows: any[] }> = ({ rows }) => {
  const { t } = useTranslation();
  const count = (n: number) => t('common.items_count', { count: formatNumber(n) });

  return (
    <Card padding="none">
      <CardHeader bordered title={t('dashboardPage.daily_title')} description={t('dashboardPage.daily_sub')} />
      <TableContainer bare maxHeightClass="max-h-[70vh]">
        <Table>
          <Thead>
            <Tr>
              <Th>{t('common.date')}</Th>
              <Th align="right">{t('dashboardPage.col_deals')}</Th>
              <Th align="right">{t('dashboardPage.col_limit_total')}</Th>
              <Th align="right">{t('dashboardPage.col_limit_avg')}</Th>
              <Th align="right">{t('common.agent_commission')}</Th>
              <Th align="right">{t('common.purchase_cost')}</Th>
              <Th align="right">{t('common.customer_payment')}</Th>
              <Th align="right">{t('dashboardPage.col_qodir_chek')}</Th>
              <Th align="right">{t('dashboardPage.col_discount_avg')}</Th>
              <Th align="right">{t('dashboardPage.col_extra_daftar')}</Th>
              <Th align="right">{t('dashboardPage.col_qodir_debt')}</Th>
              <Th align="right">{t('dashboardPage.col_green_bazar')}</Th>
              <Th align="right">{t('dashboardPage.col_trust_balance')}</Th>
              <Th align="right">{t('dashboardPage.col_devices')}</Th>
              <Th align="right">{t('dashboardPage.col_organic_buyout')}</Th>
              <Th align="right">{t('dashboardPage.col_expense_hasan')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && <TableEmpty colSpan={16} title={t('dashboardPage.period_empty')} />}
            {rows.map((row) => (
              <Tr key={row.date}>
                <Td numeric className="font-medium">
                  {formatDate(row.date)}
                </Td>
                <Td align="right" numeric>
                  {count(row.dealsCount)}
                </Td>
                <Td align="right" numeric className="font-semibold">
                  {formatMoney(row.limitTotal)}
                </Td>
                <Td align="right" numeric className="text-fg-secondary">
                  {formatMoney(row.limitAvg)}
                </Td>
                <Td align="right" numeric>
                  {formatMoney(row.agentFeeTotal)}
                </Td>
                <Td align="right" numeric>
                  {formatMoney(row.buyoutTotal)}
                </Td>
                <Td align="right" numeric>
                  {formatMoney(row.payoutTotal)}
                </Td>
                <Td align="right" numeric>
                  {moneyOrDash(row.qodirChekExpenseTotal)}
                </Td>
                <Td align="right" numeric className="text-fg-secondary">
                  {formatPercent(row.discountAvg)}
                </Td>
                <Td align="right" numeric className="text-fg-secondary">
                  {row.extraDaftarTotal > 0 ? `${formatMoney(row.extraDaftarTotal)} (${count(row.extraDaftarCount)})` : '-'}
                </Td>
                <Td align="right" numeric>
                  {moneyOrDash(row.qodirDebtTotal)}
                </Td>
                <Td align="right" numeric>
                  {moneyOrDash(row.greenBazarTotal)}
                </Td>
                <Td align="right" numeric>
                  {moneyOrDash(row.trustTotal)}
                </Td>
                <Td align="right" numeric>
                  {row.physicalItemsQty > 0 ? (
                    <Badge tone="info" size="sm" title={row.physicalItemsList && row.physicalItemsList !== '-' ? row.physicalItemsList : undefined}>
                      {formatNumber(row.physicalItemsQty)} {t('common.pieces')}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </Td>
                <Td align="right" numeric className="font-semibold">
                  {formatMoney(row.organicBuyoutTotal)}
                </Td>
                <Td align="right" numeric className="text-fg-secondary">
                  {formatMoney(row.expenseHasan)}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </Card>
  );
};

interface SegmentRow {
  name: string;
  count: number;
  volume: number;
  commission: number;
  sharePct: number;
}

/** Provayder / do'kon / agentlik kesimidagi taqsimot jadvali (ulush chizig'i bilan). */
export const SegmentTable: React.FC<{ title: string; nameLabel: string; rows: SegmentRow[] }> = ({ title, nameLabel, rows }) => {
  const { t } = useTranslation();

  return (
    <Card padding="none">
      <CardHeader bordered title={title} />
      <TableContainer bare>
        <Table>
          <Thead>
            <Tr>
              <Th>{nameLabel}</Th>
              <Th align="right">{t('dashboardPage.col_deals')}</Th>
              <Th align="right">{t('dashboardPage.seg_col_volume')}</Th>
              <Th align="right">{t('common.agent_commission')}</Th>
              <Th align="right">{t('dashboardPage.seg_col_share')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && <TableEmpty colSpan={5} title={t('dashboardPage.period_empty')} />}
            {rows.map((item) => (
              <Tr key={item.name}>
                <Td className="font-medium">{item.name}</Td>
                <Td align="right" numeric>
                  {t('common.items_count', { count: formatNumber(item.count) })}
                </Td>
                <Td align="right" numeric className="font-semibold">
                  {formatMoney(item.volume)}
                </Td>
                <Td align="right" numeric>
                  {formatMoney(item.commission)}
                </Td>
                <Td align="right" numeric>
                  <div className="ml-auto flex w-28 items-center justify-end gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, Math.max(0, (item.sharePct || 0) * 100))}%` }}
                      />
                    </span>
                    <span>{formatPercent(item.sharePct)}</span>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </Card>
  );
};
