import React from 'react';
import { RotateCcw } from 'lucide-react';
import { formatDate, formatMoney } from '../../utils/format';
import { useTranslation } from '../../context/LanguageContext';
import { Button, cn } from '../ui';
import { SaleItem, SaleRow, num, saleItemImeis } from './saleTypes';

interface SaleDetailsProps {
  sale: SaleRow;
  /** Bitta tovarni omborga qaytarish (faqat yangi, 1 tadan ko'p tovarli sotuvda ko'rinadi) */
  onReturnItem: (item: SaleItem) => void;
}

const th = 'whitespace-nowrap px-3 py-2 text-xs font-semibold text-fg-secondary';
const td = 'px-3 py-2 align-top';

/** Sotuv qatori ochilganda ko'rinadigan qism: tovarlar jadvali va to'lovlar ro'yxati. */
export const SaleDetails: React.FC<SaleDetailsProps> = ({ sale, onReturnItem }) => {
  const { t } = useTranslation();
  const items = Array.isArray(sale.items) ? sale.items : [];
  const payments = Array.isArray(sale.payments) ? sale.payments : [];
  const canReturnItem = !sale.legacy && items.length > 1;

  return (
    <div className="space-y-3 bg-surface-2 px-3 py-3 sm:px-4">
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full border-collapse text-sm text-fg">
          <thead>
            <tr className="border-b border-line text-left">
              <th scope="col" className={th}>{t('sales.items.deal')}</th>
              <th scope="col" className={th}>{t('sales.col.store')}</th>
              <th scope="col" className={th}>{t('common.product_name')}</th>
              <th scope="col" className={th}>{t('sales.col.imei')}</th>
              <th scope="col" className={cn(th, 'text-right')}>{t('sales.col.purchase')}</th>
              <th scope="col" className={cn(th, 'text-right')}>{t('sales.items.priceShare')}</th>
              <th scope="col" className={cn(th, 'text-right')}>{t('sales.col.profit')}</th>
              {canReturnItem && <th scope="col" className={cn(th, 'text-center')}>{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.length === 0 && (
              <tr>
                <td colSpan={canReturnItem ? 8 : 7} className="px-3 py-4 text-center text-xs text-fg-muted">
                  {t('common.noData')}
                </td>
              </tr>
            )}
            {items.map((it) => {
              const imeis = saleItemImeis(it);
              const devices = Array.isArray(it.devices) ? it.devices : [];
              return (
                <tr key={it.dealId}>
                  <td className={cn(td, 'whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-accent')}>
                    №{it.dealNumber ?? '—'}
                  </td>
                  <td className={cn(td, 'text-fg-secondary')}>{it.storeName || '—'}</td>
                  <td className={td}>
                    <div className="font-medium text-fg">{it.productName || '—'}</div>
                    {devices.length > 1 && (
                      <div className="mt-0.5 text-xs text-fg-muted">
                        {devices
                          .map((d) =>
                            [d.productName, d.storageGb ? `${d.storageGb}GB` : '', d.color, num(d.quantity) > 1 ? `× ${d.quantity}` : '']
                              .filter(Boolean)
                              .join(' ')
                          )
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className={cn(td, 'font-mono text-xs tabular-nums text-fg-muted')}>
                    {imeis.length > 0
                      ? imeis.map((v) => (
                          <div key={v} className="whitespace-nowrap">
                            {v}
                          </div>
                        ))
                      : '—'}
                  </td>
                  <td className={cn(td, 'whitespace-nowrap text-right tabular-nums text-fg-secondary')}>
                    {formatMoney(it.cost)}
                  </td>
                  <td className={cn(td, 'whitespace-nowrap text-right font-semibold tabular-nums')}>
                    {formatMoney(it.priceShare)}
                    {num(it.debt) > 0 && (
                      <div className="text-xs font-medium text-danger">{t('sales.debt', { amount: formatMoney(it.debt) })}</div>
                    )}
                  </td>
                  <td
                    className={cn(
                      td,
                      'whitespace-nowrap text-right font-semibold tabular-nums',
                      num(it.profit) >= 0 ? 'text-success' : 'text-danger'
                    )}
                  >
                    {formatMoney(it.profit)}
                  </td>
                  {canReturnItem && (
                    <td className={cn(td, 'whitespace-nowrap text-center')}>
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                        onClick={() => onReturnItem(it)}
                        title={t('sales.return.titleItem')}
                      >
                        {t('sales.revert.button')}
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* To'lovlar */}
      <div className="rounded-card border border-line bg-surface px-3 py-2">
        <div className="mb-1 text-xs font-semibold text-fg-secondary">{t('sales.payments.title')}</div>
        {payments.length === 0 ? (
          <div className="py-1 text-xs text-fg-muted">{t('sales.payments.empty')}</div>
        ) : (
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-1.5 text-xs">
                <span className="whitespace-nowrap font-semibold tabular-nums text-success">+{formatMoney(p.amount)}</span>
                <span className="text-fg-secondary">
                  {p.accountType ? t(`accounts.${p.accountType}`, p.accountType) : '—'}
                  {p.txNumber != null && <span className="ml-1 tabular-nums text-fg-muted">· {t('sales.payments.tx', { number: p.txNumber })}</span>}
                </span>
                <span className="min-w-0 flex-1 truncate text-fg-muted">{p.note || ''}</span>
                <span className="whitespace-nowrap tabular-nums text-fg-secondary">
                  {p.dateLabel || (p.date ? formatDate(p.date) : '—')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {sale.note && (
          <div className="mt-1 border-t border-line pt-1.5 text-xs text-fg-muted">
            {t('common.note')}: <span className="text-fg-secondary">{sale.note}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SaleDetails;
