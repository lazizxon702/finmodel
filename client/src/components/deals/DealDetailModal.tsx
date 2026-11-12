import React from 'react';
import { Check, Pencil, Trash2, Wallet, X } from 'lucide-react';
import { Badge, Button, Modal, cn } from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatDateTime, formatMoney, formatPercent } from '../../utils/format';
import type { Deal, Role } from '../../types';
import { ApprovalBadge, DealStatusBadge } from './DealBadges';
import { cleanText, dealDateTime, dealItems, dealPermissions, dealPhones, isQodirStore } from './dealUtils';

interface Props {
  deal: Deal;
  role?: Role | null;
  onClose: () => void;
  onEdit: (deal: Deal) => void;
  onApprove: (deal: Deal) => void;
  onReject: (deal: Deal) => void;
  onExpense: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <section className={className}>
    <h3 className="mb-2 text-sm font-semibold text-fg">{title}</h3>
    {children}
  </section>
);

const Rows: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <dl className="divide-y divide-line rounded-control border border-line text-sm">{children}</dl>
);

const Row: React.FC<{ label: string; children: React.ReactNode; numeric?: boolean }> = ({ label, children, numeric }) => (
  <div className="flex items-baseline justify-between gap-4 px-3 py-2">
    <dt className="shrink-0 text-fg-muted">{label}</dt>
    <dd className={cn('min-w-0 break-words text-right text-fg', numeric && 'font-medium tabular-nums')}>{children}</dd>
  </div>
);

const DASH = '—';

/** Faqat o'qish uchun batafsil oyna (tahrir formasidan alohida). */
export const DealDetailModal: React.FC<Props> = ({ deal, role, onClose, onEdit, onApprove, onReject, onExpense, onDelete }) => {
  const { t } = useTranslation();
  const can = dealPermissions(role, deal);
  const items = dealItems(deal);
  const phones = dealPhones(deal);
  const status = deal.approvalStatus || 'APPROVED';
  const trustDebt = Number(deal.trustDebtAmount) || 0;
  const expense = deal.checkExpense;
  const qodir = isQodirStore(deal.store?.name);
  const hasActions = can.edit || can.approve || can.reject || can.remove;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t('dealsPage.detail_title', { number: deal.dealNumber })}
      description={dealDateTime(deal)}
      footer={
        hasActions ? (
          <>
            {can.remove && (
              <Button
                variant="ghost"
                className="text-danger hover:text-danger sm:mr-auto"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => onDelete(deal)}
              >
                {t('common.delete')}
              </Button>
            )}
            {can.edit && (
              <Button variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => onEdit(deal)}>
                {t('common.edit')}
              </Button>
            )}
            {can.reject && (
              <Button variant="danger" leftIcon={<X className="h-4 w-4" />} onClick={() => onReject(deal)}>
                {t('approval.reject')}
              </Button>
            )}
            {can.approve && (
              <Button variant="success" leftIcon={<Check className="h-4 w-4" />} onClick={() => onApprove(deal)}>
                {t('approval.approve')}
              </Button>
            )}
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <ApprovalBadge status={status} size="md" />
          <DealStatusBadge status={deal.status} size="md" />
          {deal.isDaftar && (
            <Badge tone="warning" size="md">
              {t('dealsPage.daftar')}
            </Badge>
          )}
        </div>

        {status === 'REJECTED' && (
          <div className="rounded-control bg-danger-soft px-3 py-2.5 text-sm">
            <p className="font-medium text-danger">{t('approval.rejectReason')}</p>
            <p className="mt-0.5 break-words text-fg">{cleanText(deal.rejectReason) || DASH}</p>
          </div>
        )}
        {status === 'PENDING_APPROVAL' && (
          <p className="rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning">{t('dealsPage.pending_note')}</p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Section title={t('common.customer')}>
            <Rows>
              <Row label={t('dealsPage.customer_name')}>{cleanText(deal.customerName) || DASH}</Row>
              <Row label={t('dealsPage.phone1')} numeric>
                {phones[0] ? (
                  <a href={`tel:${phones[0].replace(/[^\d+]/g, '')}`} className="text-accent hover:underline">
                    {phones[0]}
                  </a>
                ) : (
                  DASH
                )}
              </Row>
              <Row label={t('dealsPage.phone2')} numeric>
                {phones[1] ? (
                  <a href={`tel:${phones[1].replace(/[^\d+]/g, '')}`} className="text-accent hover:underline">
                    {phones[1]}
                  </a>
                ) : (
                  DASH
                )}
              </Row>
            </Rows>
          </Section>

          <Section title={t('dealsPage.section_deal')}>
            <Rows>
              <Row label={t('common.date_time')} numeric>
                {dealDateTime(deal)}
              </Row>
              <Row label={t('common.store')}>{deal.store?.name || DASH}</Row>
              <Row label={t('common.provider')}>{deal.provider?.name || DASH}</Row>
              <Row label={t('common.agency')}>{deal.agency?.name || DASH}</Row>
              <Row label={t('dealsPage.agent')}>{deal.agent?.name || DASH}</Row>
              <Row label={t('common.seller')}>{deal.sellerName || DASH}</Row>
            </Rows>
          </Section>
        </div>

        <Section title={t('dealsPage.section_amounts')}>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <Rows>
              <Row label={t('dealsPage.customer_limit')} numeric>
                {formatMoney(deal.customerLimit)}
              </Row>
              <Row label={t('common.withdrawn_limit')} numeric>
                {formatMoney(deal.withdrawnLimit)}
              </Row>
              <Row label={t('common.customer_payment')} numeric>
                {formatMoney(deal.calculatedAmount)}
              </Row>
              <Row label={t('common.agent_commission')} numeric>
                {formatMoney(deal.agentAmount)}
              </Row>
            </Rows>
            <Rows>
              <Row label={t('common.purchase_cost')} numeric>
                {formatMoney(deal.totalPurchaseCost)}
              </Row>
              <Row label={t('common.discount_pct')} numeric>
                {formatPercent(deal.purchaseDiscountPct)}
              </Row>
              <Row label={t('common.sale_price')} numeric>
                {formatMoney(deal.salePrice)}
              </Row>
              <Row label={t('common.profit')} numeric>
                {formatMoney(deal.profit)}
              </Row>
            </Rows>
          </div>
        </Section>

        <Section title={t('dealsPage.items_title', { count: items.length })}>
          {items.length === 0 ? (
            <p className="rounded-control border border-line px-3 py-3 text-sm text-fg-muted">{t('dealsPage.no_items')}</p>
          ) : (
            <ol className="divide-y divide-line rounded-control border border-line">
              {items.map((it, idx) => (
                <li key={idx} className="px-3 py-2.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 break-words font-medium text-fg">
                      <span className="tabular-nums text-fg-muted">{idx + 1}.</span> {it.productName || DASH}
                    </p>
                    <p className="shrink-0 tabular-nums text-fg-secondary">
                      {t('common.items_count', { count: it.quantity })}
                      {it.price > 0 && <span className="ml-2 font-medium text-fg">{formatMoney(it.price)}</span>}
                    </p>
                  </div>
                  <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-fg-muted">
                    {it.color && (
                      <div className="flex gap-1">
                        <dt>{t('dealsPage.color')}:</dt>
                        <dd className="text-fg-secondary">{it.color}</dd>
                      </div>
                    )}
                    {it.storageGb && (
                      <div className="flex gap-1">
                        <dt>{t('dealsPage.storage')}:</dt>
                        <dd className="text-fg-secondary">{it.storageGb}</dd>
                      </div>
                    )}
                    <div className="flex gap-1">
                      <dt>{t('dealsPage.imei1')}:</dt>
                      <dd className="font-mono tabular-nums text-fg-secondary">{it.imei1 || DASH}</dd>
                    </div>
                    {it.imei2 && (
                      <div className="flex gap-1">
                        <dt>{t('dealsPage.imei2')}:</dt>
                        <dd className="font-mono tabular-nums text-fg-secondary">{it.imei2}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title={t('dealsPage.section_accounting')}>
          <Rows>
            <Row label={t('approval.label')}>
              <ApprovalBadge status={status} />
            </Row>
            {status === 'APPROVED' && (
              <Row label={t('dealsPage.approved_by')}>
                {deal.approvedBy?.fullName || DASH}
                {deal.approvedAt && <span className="ml-2 tabular-nums text-fg-muted">{formatDateTime(deal.approvedAt)}</span>}
              </Row>
            )}
            {trustDebt > 0 && (
              <Row label={t('dealsPage.trust_debt')} numeric>
                {formatMoney(trustDebt)}
              </Row>
            )}
            <Row label={t('dealsPage.check_expense')}>
              {expense ? (
                <span className="tabular-nums">
                  {t('dealsPage.expense_written', {
                    tx: expense.txNumber,
                    amount: formatMoney(expense.amount),
                    date: formatDateTime(expense.dateTime),
                  })}
                  <span className="ml-1 text-fg-muted">({t(`accounts.${expense.account}`)})</span>
                </span>
              ) : qodir && !can.expense ? (
                <span className="text-fg-muted">{t('dealsPage.qodir_note')}</span>
              ) : can.expense ? (
                <Button size="sm" variant="secondary" leftIcon={<Wallet className="h-4 w-4" />} onClick={() => onExpense(deal)}>
                  {t('dealsPage.expense_submit')}
                </Button>
              ) : (
                <span className="text-fg-muted">{t('dealsPage.expense_none')}</span>
              )}
            </Row>
            <Row label={t('dealsPage.created_by')}>
              {deal.createdBy ? (
                <>
                  {deal.createdBy.fullName}
                  <span className="ml-2 text-fg-muted">{t(`roles.${deal.createdBy.role}`)}</span>
                </>
              ) : (
                DASH
              )}
              {deal.createdAt && <span className="ml-2 tabular-nums text-fg-muted">{formatDateTime(deal.createdAt)}</span>}
            </Row>
          </Rows>
        </Section>

        {cleanText(deal.note) && (
          <Section title={t('common.note')}>
            <p className="whitespace-pre-wrap break-words rounded-control border border-line px-3 py-2.5 text-sm text-fg-secondary">{deal.note}</p>
          </Section>
        )}
      </div>
    </Modal>
  );
};
