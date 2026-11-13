import React from 'react';
import { BookOpen, Layers, Receipt } from 'lucide-react';
import { Badge, Table, TableContainer, TableEmpty, Tbody, Td, Th, Thead, Tr, cn } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format';
import type { Settlement, StoreDealRow, StoreExpenseRow, StoreLedgerEntry } from './storeUtils';

// Do'kon sahifasidagi uchta jadval: hisob-kitob daftari, bitimlar, bog'langan DDS xarajatlari.
// Hammasi TableContainer ichida — tor oynada (~1024px) karta ichida gorizontal suriladi.

const MAX_HEIGHT = 'max-h-[70vh]';

interface LedgerProps {
  entries: StoreLedgerEntry[];
  settlement: Settlement;
  /** Filtrsiz yozuvlar soni — bo'sh holat matnini tanlash uchun */
  totalCount: number;
}

/** Hisob-kitob daftari: DEBT — bitimdan yozilgan qarz, PAYMENT — DDS orqali to'lov */
export const StoreLedgerTable: React.FC<LedgerProps> = ({ entries, settlement, totalCount }) => {
  const { t } = useTranslation();
  return (
    <TableContainer bare maxHeightClass={MAX_HEIGHT}>
      <Table>
        <Thead>
          <Tr>
            <Th>{t('stores.col_datetime')}</Th>
            <Th>{t('common.type')}</Th>
            <Th>{t('stores.col_source')}</Th>
            <Th align="right">{t('common.amount')}</Th>
            <Th>{t('common.comment')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {entries.length === 0 && (
            <TableEmpty
              colSpan={5}
              icon={<BookOpen />}
              title={t('stores.ledger_empty')}
              description={totalCount === 0 ? t('stores.ledger_empty_hint') : undefined}
            />
          )}
          {entries.map((e) => {
            const isDebt = e.type === 'DEBT';
            return (
              <Tr key={e.id}>
                <Td numeric className="text-fg-secondary">
                  {e.dateLabel || formatDateTime(e.dateTime)}
                </Td>
                <Td>
                  <Badge tone={isDebt ? (settlement === 'WE_OWE' ? 'danger' : 'warning') : 'success'}>
                    {isDebt ? t('stores.type_debt') : t('stores.type_payment')}
                  </Badge>
                </Td>
                <Td>
                  {e.deal ? (
                    <>
                      <span className="block whitespace-nowrap font-medium tabular-nums">
                        {t('stores.deal_no', { number: e.deal.dealNumber })}
                      </span>
                      <span className="block max-w-[16rem] truncate text-xs text-fg-muted" title={e.deal.customerName || ''}>
                        {e.deal.customerName || '-'}
                      </span>
                    </>
                  ) : e.ddsTransaction ? (
                    <>
                      <span className="block whitespace-nowrap font-medium tabular-nums">{e.ddsTransaction.txNumber}</span>
                      <span className="block whitespace-nowrap text-xs text-fg-muted">
                        {t(`accounts.${e.ddsTransaction.account}`)}
                        {e.ddsTransaction.categoryName ? `, ${e.ddsTransaction.categoryName}` : ''}
                      </span>
                    </>
                  ) : (
                    '-'
                  )}
                </Td>
                <Td align="right" numeric className={cn('font-semibold', isDebt ? 'text-fg' : 'text-success')}>
                  {isDebt ? '+' : '−'}
                  {formatMoney(e.amount)}
                </Td>
                <Td className="max-w-[18rem] text-fg-secondary">
                  <span className="block truncate" title={e.note || ''}>
                    {e.note || '-'}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

interface DealsProps {
  deals: StoreDealRow[];
  settlement: Settlement;
}

/** Davrdagi tasdiqlangan bitimlar va ularning cheki DDS'ga yozilgan-yozilmagani */
export const StoreDealsTable: React.FC<DealsProps> = ({ deals, settlement }) => {
  const { t } = useTranslation();
  return (
    <TableContainer bare maxHeightClass={MAX_HEIGHT}>
      <Table>
        <Thead>
          <Tr>
            <Th>{t('stores.col_deal')}</Th>
            <Th>{t('common.date')}</Th>
            <Th>{t('common.customer')}</Th>
            <Th align="right">{t('stores.col_withdrawn')}</Th>
            <Th align="right">{t('stores.col_payout')}</Th>
            <Th align="right">{t('stores.col_profit')}</Th>
            <Th>{t('stores.col_check')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {deals.length === 0 && <TableEmpty colSpan={7} icon={<Layers />} title={t('stores.deals_empty')} />}
          {deals.map((d) => (
            <Tr key={d.id}>
              <Td numeric className="font-medium">
                №{d.dealNumber}
              </Td>
              <Td numeric className="text-fg-secondary">
                {d.dateLabel || formatDate(d.date)}
              </Td>
              <Td className="max-w-[16rem]">
                <span className="block truncate" title={d.customerName || ''}>
                  {d.customerName || '-'}
                </span>
              </Td>
              <Td align="right" numeric>
                {formatMoney(d.withdrawnLimit)}
              </Td>
              <Td align="right" numeric className="font-semibold">
                {formatMoney(d.calculatedAmount)}
              </Td>
              <Td align="right" numeric className={cn('font-semibold', Number(d.profit) < 0 ? 'text-danger' : 'text-success')}>
                {formatMoney(d.profit)}
              </Td>
              <Td>
                {d.checkExpense ? (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <Badge tone="success" size="sm">
                      {t('stores.check_in_dds')}
                    </Badge>
                    <span className="text-xs tabular-nums text-fg-muted">
                      {d.checkExpense.txNumber}
                      {d.checkExpense.dateLabel ? `, ${d.checkExpense.dateLabel}` : ''}
                    </span>
                  </span>
                ) : settlement === 'WE_OWE' ? (
                  // Qodir aka cheki DDS'ga chiqim qilinmaydi — summa uning daftariga qarz bo'lib yoziladi
                  <Badge tone="neutral" size="sm">
                    {t('stores.check_in_ledger')}
                  </Badge>
                ) : (
                  <Badge tone="warning" size="sm">
                    {t('stores.check_missing')}
                  </Badge>
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};

/** Do'kon bitimlariga bog'langan DDS xarajatlari (chek to'lovi ham shu yerda ko'rinadi) */
export const StoreExpensesTable: React.FC<{ expenses: StoreExpenseRow[] }> = ({ expenses }) => {
  const { t } = useTranslation();
  return (
    <TableContainer bare maxHeightClass={MAX_HEIGHT}>
      <Table>
        <Thead>
          <Tr>
            <Th>{t('stores.col_tx')}</Th>
            <Th>{t('stores.col_datetime')}</Th>
            <Th>{t('common.category')}</Th>
            <Th>{t('stores.col_expense_class')}</Th>
            <Th>{t('accounts.label')}</Th>
            <Th>{t('stores.col_deal')}</Th>
            <Th align="right">{t('common.amount')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {expenses.length === 0 && <TableEmpty colSpan={7} icon={<Receipt />} title={t('stores.expenses_empty')} />}
          {expenses.map((x) => (
            <Tr key={x.id}>
              <Td numeric className="font-medium text-fg-secondary">
                {x.txNumber}
              </Td>
              <Td numeric className="text-fg-secondary">
                {x.dateLabel || formatDateTime(x.dateTime)}
              </Td>
              <Td className="whitespace-nowrap font-medium">{x.categoryName}</Td>
              <Td className="whitespace-nowrap text-fg-secondary">
                {x.expenseType ? t(`ddsPage.class_${x.expenseType}`, x.expenseType) : '-'}
              </Td>
              <Td className="whitespace-nowrap">{t(`accounts.${x.account}`)}</Td>
              <Td numeric className="text-fg-secondary">
                {x.dealNumber !== null && x.dealNumber !== undefined && x.dealNumber !== '' ? `№${x.dealNumber}` : '-'}
              </Td>
              <Td align="right" numeric className="font-semibold">
                {formatMoney(x.amount)}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
};
