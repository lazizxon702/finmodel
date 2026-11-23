import React from 'react';
import { Check, Eye, Inbox, Pencil, Trash2, Wallet, X } from 'lucide-react';
import { Badge, Button, EmptyState, LoadingBlock, Table, TableContainer, Tbody, Td, Th, Thead, Tr, cn } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatMoney, formatNumber, formatPercent } from '../../utils/format';
import type { Deal, Role } from '../../types';
import { ApprovalBadge, DealStatusBadge } from './DealBadges';
import { cleanText, dealDateTime, dealPermissions, dealPhones, isQodirStore, isRegistratura, productSummary } from './dealUtils';

export interface DealRowHandlers {
  onView: (deal: Deal) => void;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
  onApprove: (deal: Deal) => void;
  onReject: (deal: Deal) => void;
  onExpense: (deal: Deal) => void;
}

interface Props extends DealRowHandlers {
  deals: Deal[];
  loading: boolean;
  /** /api/deals/totals javobi (faqat tasdiqlangan bitimlar) */
  totals: any;
  role?: Role | null;
  /** Filtrlar qo'yilganmi — bo'sh holat matni shunga qarab o'zgaradi */
  filtered: boolean;
  onCreate: () => void;
}

const DASH = '—';

type ActionTone = 'neutral' | 'success' | 'danger' | 'warning';
const ACTION_TONE: Record<ActionTone, string> = {
  neutral: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  success: 'text-success hover:bg-success-soft',
  danger: 'text-danger hover:bg-danger-soft',
  warning: 'text-warning hover:bg-warning-soft',
};

/** Jadval qatoridagi ixcham amal tugmasi (qator bosilishini to'xtatadi) */
const RowAction: React.FC<{ label: string; tone?: ActionTone; onClick: () => void; children: React.ReactNode }> = ({
  label,
  tone = 'neutral',
  onClick,
  children,
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={cn('inline-flex h-8 w-8 items-center justify-center rounded-control transition-colors [&>svg]:h-4 [&>svg]:w-4', ACTION_TONE[tone])}
  >
    {children}
  </button>
);

const CustomerCell: React.FC<{ deal: Deal }> = ({ deal }) => {
  const name = cleanText(deal.customerName);
  const phones = dealPhones(deal);
  if (!name && !phones.length) return <span className="text-fg-muted">{DASH}</span>;
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-fg">{name || DASH}</p>
      {phones.map((p) => (
        <p key={p} className="truncate text-xs tabular-nums text-fg-muted">
          {p}
        </p>
      ))}
    </div>
  );
};

const ProductCell: React.FC<{ deal: Deal; showImei?: boolean }> = ({ deal, showImei = true }) => {
  const { t } = useTranslation();
  const p = productSummary(deal);
  if (!p.first && !p.imei) return <span className="text-fg-muted">{DASH}</span>;
  return (
    <div className="min-w-0" title={p.full || undefined}>
      <p className="flex items-center gap-1.5">
        <span className="truncate font-medium text-fg">{p.first || DASH}</span>
        {p.extra > 0 && (
          <Badge tone="brand" size="sm" title={t('dealsPage.items_more', { count: p.extra })}>
            +{p.extra}
          </Badge>
        )}
      </p>
      {showImei && p.imei && <p className="truncate font-mono text-xs tabular-nums text-fg-muted">{p.imei}</p>}
    </div>
  );
};

/** Chek xarajati yozilgan bo'lsa — tugma o'rniga ko'rsatiladigan belgi */
const ExpenseMark: React.FC<{ deal: Deal }> = ({ deal }) => {
  const { t } = useTranslation();
  if (!deal.checkExpense) return null;
  return (
    <Badge
      tone="success"
      size="sm"
      icon={<Wallet className="h-3 w-3" aria-hidden="true" />}
      title={t('dealsPage.expense_written_short', { tx: deal.checkExpense.txNumber, amount: formatMoney(deal.checkExpense.amount) })}
    >
      {deal.checkExpense.txNumber}
    </Badge>
  );
};

/**
 * Bitimlar ro'yxati: lg+ ekranda jadval, kichik ekranda kartochkalar.
 * Qator/kartochka bosilganda batafsil oyna ochiladi.
 */
export const DealsTable: React.FC<Props> = ({ deals, loading, totals, role, filtered, onCreate, ...handlers }) => {
  const { t } = useTranslation();
  const { onView, onEdit, onDelete, onApprove, onReject, onExpense } = handlers;
  // Registratura: pul ustunlaridan faqat "Yechilgan limit" va "Xarid xarajati" ko'rinadi
  // (mijozga to'lov, agent komissiyasi, foyda, Daftar/Qodir summalari, chek xarajati — yashirin)
  const hideFinance = isRegistratura(role) || totals?.financeHidden === true;

  if (loading && deals.length === 0) return <LoadingBlock label={t('common.loading')} />;

  if (deals.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title={t('dealsPage.empty_title')}
        description={filtered ? t('dealsPage.empty_filtered') : t('dealsPage.empty_hint')}
        action={filtered || role === 'VIEWER' ? undefined : <Button onClick={onCreate}>{t('deals.add_deal')}</Button>}
      />
    );
  }

  const actions = (deal: Deal) => {
    const can = dealPermissions(role, deal);
    return (
      <>
        <RowAction label={t('common.details')} onClick={() => onView(deal)}>
          <Eye />
        </RowAction>
        {can.approve && (
          <RowAction label={t('approval.approve')} tone="success" onClick={() => onApprove(deal)}>
            <Check />
          </RowAction>
        )}
        {can.reject && (
          <RowAction label={t('approval.reject')} tone="danger" onClick={() => onReject(deal)}>
            <X />
          </RowAction>
        )}
        {can.expense && (
          <RowAction label={t('dealsPage.expense_submit')} tone="warning" onClick={() => onExpense(deal)}>
            <Wallet />
          </RowAction>
        )}
        {can.edit && (
          <RowAction label={t('common.edit')} onClick={() => onEdit(deal)}>
            <Pencil />
          </RowAction>
        )}
        {can.remove && (
          <RowAction label={t('common.delete')} tone="danger" onClick={() => onDelete(deal)}>
            <Trash2 />
          </RowAction>
        )}
      </>
    );
  };

  return (
    <div className={cn('transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
      {/* Jadval — keng ekran */}
      <TableContainer bare maxHeightClass="max-h-[70vh]" className="hidden lg:block">
        {/* Ixcham jadval: tor katak chetlari — 12 ustun oddiy ekranga sig'sin */}
        <Table className="[&_td]:px-2 [&_th]:px-2 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4">
          <Thead>
            <Tr>
              <Th>№</Th>
              <Th>{t('common.date_time')}</Th>
              <Th>{t('common.customer')}</Th>
              <Th>{t('common.product_name')}</Th>
              <Th>{t('dealsPage.col_store_provider')}</Th>
              <Th align="right" className="whitespace-normal leading-tight">{t('common.withdrawn_limit')}</Th>
              {!hideFinance && <Th align="right" className="whitespace-normal leading-tight">{t('common.customer_payment')}</Th>}
              {hideFinance ? (
                // Registratura: mijozga to'lov (limit − diskont %) — xarid xarajati emas (unda agent ulushi bor)
                <Th align="right" className="whitespace-normal leading-tight">{t('common.customer_payment')}</Th>
              ) : (
                <Th align="right" className="whitespace-normal leading-tight">
                  {/* Ulush qoidasi bor jamoa operatori (Jahongir): agent komissiyasi o'rniga o'z ulushi */}
                  {t(totals?.operatorShareRule ? 'dealsPage.sum_operator_share' : 'common.agent_commission')}
                  <span className="block font-normal text-fg-muted">{t('common.purchase_cost')}</span>
                </Th>
              )}
              <Th>{t('common.status')}</Th>
              {!hideFinance && <Th align="right">{t('common.profit')}</Th>}
              <Th align="right" className="sticky right-0">
                {t('common.actions')}
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {/* Yig'ma qator: faqat tasdiqlangan bitimlar bo'yicha */}
            <tr className="bg-surface-2 font-semibold">
              <Td colSpan={5} className="text-xs text-fg-secondary">
                {t('dealsPage.totals_row')}, UZS
              </Td>
              <Td align="right" numeric>
                {formatNumber(totals?.totalWithdrawn)}
              </Td>
              {!hideFinance && (
                <Td align="right" numeric>
                  {formatNumber(totals?.totalCalculatedAmount)}
                </Td>
              )}
              {hideFinance ? (
                <Td align="right" numeric>
                  {formatNumber(totals?.totalCalculatedAmount)}
                </Td>
              ) : (
                <Td align="right" numeric>
                  <p>{formatNumber(totals?.operatorShareRule ? totals?.operatorShare : totals?.totalAgentAmount)}</p>
                  <p className="text-xs font-normal text-fg-muted">{formatNumber(totals?.totalPurchaseCost)}</p>
                </Td>
              )}
              <Td />
              {!hideFinance && (
                <Td align="right" numeric className="text-success">
                  {formatNumber(totals?.totalProfit)}
                </Td>
              )}
              <Td className="sticky right-0 bg-surface-2" />
            </tr>

            {deals.map((d) => {
              const status = d.approvalStatus || 'APPROVED';
              return (
                <Tr key={d.id} clickable onClick={() => onView(d)} className={cn('group', d.isStale && 'bg-danger-soft/60')} title={d.isStale ? t('dealsPage.stale_hint') : undefined}>
                  <Td numeric className="font-semibold text-accent">
                    {d.dealNumber}
                  </Td>
                  <Td numeric className="max-w-[7rem]">
                    <p className="text-fg">{dealDateTime(d).split(' ')[0]}</p>
                    {/* Registrator (bo'lmasa eski erkin matnli sotuvchi) */}
                    <p
                      className="truncate text-xs text-fg-muted"
                      title={d.registrator?.fullName || d.sellerName ? `${t('dealsPage.registrator')}: ${d.registrator?.fullName || d.sellerName}` : undefined}
                    >
                      {dealDateTime(d).split(' ')[1] || ''} {d.registrator?.fullName || d.sellerName}
                    </p>
                  </Td>
                  <Td className="max-w-[9rem]">
                    <CustomerCell deal={d} />
                  </Td>
                  <Td className="max-w-[10rem]">
                    <ProductCell deal={d} />
                  </Td>
                  <Td className="max-w-[9rem]">
                    <p className="truncate text-fg">{d.store?.name || DASH}</p>
                    <p className="truncate text-xs text-fg-muted">{d.provider?.name || DASH}</p>
                    {d.agency?.name && (
                      <p className="truncate text-xs text-fg-muted" title={t('common.agency')}>
                        {d.agency.name}
                        {d.agent?.name && d.agent.name !== d.agency.name ? ' / ' + d.agent.name : ''}
                      </p>
                    )}
                    <div className="mt-0.5 flex flex-wrap gap-1 empty:hidden">
                      {d.isDaftar && (
                        <Badge tone="warning" size="sm">
                          {t('dealsPage.daftar')}
                          {!hideFinance && Number(d.extraDaftar) > 0 && <span className="tabular-nums">+{formatMoney(d.extraDaftar)}</span>}
                        </Badge>
                      )}
                      {!hideFinance && isQodirStore(d.store?.name) && (
                        <Badge tone="neutral" size="sm" title={t('dealsPage.qodir_check_title')}>
                          <span className="tabular-nums">
                            {t('dealsPage.qodir_check', { amount: formatMoney(Number(d.calculatedAmount) + Number(d.agentAmount)) })}
                          </span>
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td align="right" numeric className="font-semibold">
                    {formatNumber(d.withdrawnLimit)}
                  </Td>
                  {!hideFinance && (
                    <Td align="right" numeric>
                      <p>{formatNumber(d.calculatedAmount)}</p>
                      <p className="text-xs text-fg-muted" title={t('common.discount_pct')}>
                        −{formatPercent(d.purchaseDiscountPct)}
                      </p>
                    </Td>
                  )}
                  {hideFinance ? (
                    <Td align="right" numeric>
                      <p>{formatNumber(d.calculatedAmount)}</p>
                      <p className="text-xs text-fg-muted" title={t('common.discount_pct')}>
                        −{formatPercent(d.purchaseDiscountPct)}
                      </p>
                    </Td>
                  ) : (
                    <Td align="right" numeric>
                      <p>{formatNumber(totals?.operatorShareRule ? (d as any).operatorShare ?? 0 : d.agentAmount)}</p>
                      <p className="text-xs text-fg-muted" title={t('common.purchase_cost')}>
                        {formatNumber(d.totalPurchaseCost)}
                      </p>
                    </Td>
                  )}
                  <Td className="max-w-[8.5rem]">
                    <div className="flex flex-wrap items-center gap-1">
                      <DealStatusBadge status={d.status} />
                      <ApprovalBadge status={status} />
                      {!hideFinance && <ExpenseMark deal={d} />}
                    </div>
                    {status === 'REJECTED' && cleanText(d.rejectReason) && (
                      <p className="mt-0.5 truncate text-xs text-danger" title={d.rejectReason || undefined}>
                        {d.rejectReason}
                      </p>
                    )}
                  </Td>
                  {!hideFinance && (
                    <Td align="right" numeric>
                      <p className={cn('font-semibold', Number(d.profit) < 0 ? 'text-danger' : 'text-success')}>{formatNumber(d.profit)}</p>
                      {Number(d.salePrice) > 0 && (
                        <p className="text-xs text-fg-muted" title={t('common.sale_price')}>
                          {formatNumber(d.salePrice)}
                        </p>
                      )}
                    </Td>
                  )}
                  <Td align="right" className="sticky right-0 border-l border-line bg-surface group-hover:bg-surface-2">
                    <div className="flex items-center justify-end gap-0.5">{actions(d)}</div>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </TableContainer>

      {/* Kartochkalar — telefon va planshet */}
      <ul className="divide-y divide-line lg:hidden">
        {deals.map((d) => {
          const status = d.approvalStatus || 'APPROVED';
          const can = dealPermissions(role, d);
          return (
            <li key={d.id} className={cn('space-y-2.5 p-4', d.isStale && 'bg-danger-soft/60')}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onView(d)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onView(d);
                  }
                }}
                className="cursor-pointer space-y-2.5 rounded-control"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-fg">
                      <span className="text-accent">№{d.dealNumber}</span>
                      <span className="ml-2 font-normal text-fg-muted">{dealDateTime(d)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ApprovalBadge status={status} />
                    <DealStatusBadge status={d.status} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-xs text-fg-muted">{t('common.customer')}</p>
                    <CustomerCell deal={d} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-fg-muted">{t('common.product_name')}</p>
                    <ProductCell deal={d} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-fg-muted">{t('common.withdrawn_limit')}</p>
                    <p className="font-medium tabular-nums text-fg">{formatMoney(d.withdrawnLimit)}</p>
                  </div>
                  <div className="min-w-0">
                    {/* Registratura: mijozga to'lov o'rniga xarid xarajati */}
                    <p className="text-xs text-fg-muted">{t('common.customer_payment')}</p>
                    <p className="font-medium tabular-nums text-fg">
                      {formatMoney(d.calculatedAmount)}
                      {hideFinance && <span className="ml-1 text-xs font-normal text-fg-muted">−{formatPercent(d.purchaseDiscountPct)}</span>}
                    </p>
                  </div>
                </div>

                <p className="truncate text-xs text-fg-muted">
                  {[d.store?.name, d.provider?.name, d.agency?.name].filter(Boolean).join(', ') || DASH}
                </p>

                {status === 'REJECTED' && cleanText(d.rejectReason) && (
                  <p className="rounded-control bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
                    {t('approval.rejectReason')}: {d.rejectReason}
                  </p>
                )}
                {!hideFinance && d.checkExpense && (
                  <p className="text-xs tabular-nums text-success">
                    {t('dealsPage.expense_written_short', { tx: d.checkExpense.txNumber, amount: formatMoney(d.checkExpense.amount) })}
                  </p>
                )}
              </div>

              {(can.approve || can.reject || can.expense || can.edit || can.remove) && (
                <div className="flex flex-wrap gap-2">
                  {can.approve && (
                    <Button size="sm" variant="success" leftIcon={<Check className="h-4 w-4" />} onClick={() => onApprove(d)}>
                      {t('approval.approve')}
                    </Button>
                  )}
                  {can.reject && (
                    <Button size="sm" variant="secondary" className="text-danger" leftIcon={<X className="h-4 w-4" />} onClick={() => onReject(d)}>
                      {t('approval.reject')}
                    </Button>
                  )}
                  {can.expense && (
                    <Button size="sm" variant="secondary" leftIcon={<Wallet className="h-4 w-4" />} onClick={() => onExpense(d)}>
                      {t('dealsPage.expense_submit')}
                    </Button>
                  )}
                  {can.edit && (
                    <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(d)}>
                      {t('common.edit')}
                    </Button>
                  )}
                  {can.remove && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-danger hover:text-danger"
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                      onClick={() => onDelete(d)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
