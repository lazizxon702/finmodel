import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, AlertTriangle, CheckCircle2, Handshake, Info, Landmark, Package, RefreshCw, TrendingUp, Users, Wallet } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangeFilter,
  EmptyState,
  LoadingBlock,
  PageHeader,
  StatCard,
  Table,
  TableContainer,
  TableEmpty,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  cn,
  defaultDateRange,
  type DateRangeValue,
} from '../components/ui';
import { apiErrorMessage, periodLabel, rangeParams } from '../components/dashboard/period';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatMoney, formatNumber, formatPercent } from '../utils/format';

type RowKind = 'line' | 'sub' | 'subtotal' | 'total';

interface LineRowProps {
  label: React.ReactNode;
  value: number | null | undefined;
  /** line — oddiy qator; sub — ichkariga surilgan; subtotal — oraliq jami; total — yakuniy natija */
  kind?: RowKind;
  /** '+' / '−' belgisi (qiymat mutlaq ko'rinishda chiqadi) */
  sign?: '+' | '−';
  hint?: React.ReactNode;
  /** Qiymat rangi (masalan manfiy foyda — danger) */
  valueClass?: string;
}

/** Hisobot qatori: chapda nom, o'ngda summa (tabular-nums). */
const LineRow: React.FC<LineRowProps> = ({ label, value, kind = 'line', sign, hint, valueClass }) => (
  <div
    className={cn(
      'flex items-baseline justify-between gap-4 text-sm',
      kind === 'line' && 'border-b border-line py-2',
      kind === 'sub' && 'border-b border-line py-2 pl-4 text-fg-secondary',
      kind === 'subtotal' && 'rounded-control bg-surface-2 px-3 py-2.5 font-semibold',
      kind === 'total' && 'rounded-control border border-line-strong bg-surface-2 px-3 py-3 text-base font-semibold'
    )}
  >
    <div className="min-w-0">
      <p className={cn(kind === 'line' || kind === 'sub' ? 'text-fg-secondary' : 'text-fg')}>{label}</p>
      {hint && <p className="mt-0.5 text-xs font-normal text-fg-muted">{hint}</p>}
    </div>
    <p className={cn('shrink-0 whitespace-nowrap tabular-nums text-fg', kind === 'line' && 'font-medium', valueClass)}>
      {sign}
      {formatMoney(sign ? Math.abs(Number(value) || 0) : value)}
    </p>
  </div>
);

const profitClass = (v: unknown) => (Number(v) < 0 ? 'text-danger' : 'text-success');

// Umumiy moliya: P&L (bitimlar foydasi − operatsion xarajatlar), Trust, pul oqimi va boshqaruv balansi.
// P&L va pul oqimi — tanlangan davr uchun; kartochkalar, debitorlik/kreditorlik va balans — joriy holat.
export const FinancesSummaryPage: React.FC = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('all'));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // silent = true — real vaqt hodisasidan keyingi jim yangilash
  const fetchFinances = useCallback(
    async (silent = false) => {
      const id = ++requestId.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await axios.get('/api/finances/summary', { params: rangeParams(range) });
        if (id !== requestId.current) return; // eskirgan javob
        setData(res.data);
        setError(null);
      } catch (err) {
        if (id !== requestId.current || silent) return;
        setData(null);
        setError(apiErrorMessage(err, t('common.load_error')));
      } finally {
        if (id === requestId.current && !silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.startDate, range.endDate]
  );

  useEffect(() => {
    fetchFinances();
  }, [fetchFinances]);

  useRealtime('deals:updated', () => fetchFinances(true));
  useRealtime('dds:updated', () => fetchFinances(true));
  useRealtime('trust:updated', () => fetchFinances(true));

  const period = periodLabel(range, t);
  const { cards, receivables, payables, totals, pnl, cashFlow, balanceSheet } = data || {};
  const recon = pnl?.reconciliation;
  const trustRate = pnl?.trustRatePercent ?? 16;
  const adjustment = Number(pnl?.dealsProfitAdjustment) || 0;
  const opexBreakdown: any[] = pnl?.opexBreakdown || [];
  const balanceDiff = Number(balanceSheet?.difference) || 0;
  const isBalanced = balanceSheet?.isBalanced !== false;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        icon={<Landmark />}
        title={t('financesPage.title')}
        description={t('dashboardPage.period_shown', { period })}
        actions={
          <Button
            variant="secondary"
            onClick={() => fetchFinances()}
            loading={loading && !!data}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            {t('common.refresh')}
          </Button>
        }
      />

      <Card padding="sm" className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <DateRangeFilter value={range} onChange={setRange} />
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted lg:max-w-md">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{t('financesPage.period_note')}</span>
        </p>
      </Card>

      {loading && !data && <LoadingBlock label={t('common.loading')} className="min-h-[40vh]" />}

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle />}
            title={t('common.load_error')}
            description={error}
            action={
              <Button variant="secondary" onClick={() => fetchFinances()}>
                {t('common.retry')}
              </Button>
            }
          />
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatCard
              title={t('financesPage.card_cash')}
              value={formatMoney(cards?.liquidCash)}
              hint={t('financesPage.card_cash_hint')}
              icon={<Wallet />}
            />
            <StatCard
              title={t('financesPage.card_warehouse')}
              value={formatMoney(cards?.warehouseValue)}
              hint={t('financesPage.card_warehouse_hint', { count: formatNumber(cards?.warehouseCount) })}
              icon={<Package />}
            />
            <StatCard
              title={t('financesPage.card_receivables')}
              value={formatMoney(cards?.receivablesDebt)}
              hint={t('financesPage.card_receivables_hint')}
              icon={<Users />}
              tone={Number(cards?.receivablesDebt) > 0 ? 'warning' : 'neutral'}
            />
            <StatCard
              title={t('financesPage.card_net_profit')}
              value={formatMoney(cards?.netProfit)}
              hint={t('financesPage.card_net_profit_hint', { ros: formatPercent(cards?.rosPct) })}
              icon={<TrendingUp />}
              tone={Number(cards?.netProfit) < 0 ? 'danger' : 'success'}
            />
          </div>

          {/* P&L: bitimlar bo'yicha foyda − operatsion xarajatlar = sof foyda */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={t('financesPage.pnl_title')} description={period} />
              <div className="space-y-1">
                <LineRow label={t('financesPage.pnl_trade_margin')} value={pnl?.tradeMargin} hint={t('financesPage.pnl_trade_margin_hint')} />
                <LineRow
                  label={t('financesPage.pnl_partner_bonus')}
                  value={pnl?.partnerBonus}
                  hint={t('financesPage.pnl_partner_bonus_hint')}
                />
                <LineRow
                  label={t('financesPage.pnl_trust_income', { rate: trustRate })}
                  value={pnl?.trustIncome}
                  hint={t('financesPage.pnl_trust_income_hint', { rate: trustRate })}
                />
                {adjustment !== 0 && (
                  <LineRow
                    label={t('financesPage.pnl_adjustment')}
                    value={adjustment}
                    hint={t('financesPage.pnl_adjustment_hint', { count: formatNumber(recon?.mismatchedDealsCount) })}
                    valueClass="text-warning"
                  />
                )}
                <LineRow
                  kind="subtotal"
                  label={t('financesPage.pnl_deals_profit')}
                  value={pnl?.dealsProfit}
                  valueClass={profitClass(pnl?.dealsProfit)}
                />

                <p className="px-0 pb-1 pt-4 text-xs font-medium text-fg-muted">{t('financesPage.pnl_opex_heading')}</p>
                {opexBreakdown.length === 0 && <p className="border-b border-line py-2 pl-4 text-sm text-fg-muted">{t('financesPage.pnl_opex_empty')}</p>}
                {opexBreakdown.map((row) => (
                  <LineRow key={row.categoryName} kind="sub" sign="−" label={row.categoryName} value={row.amount} />
                ))}
                <LineRow kind="subtotal" sign="−" label={t('financesPage.pnl_total_opex')} value={pnl?.totalOpex} />

                <div className="pt-3">
                  <LineRow
                    kind="total"
                    label={t('financesPage.pnl_net_profit')}
                    value={pnl?.netProfit}
                    hint={t('financesPage.pnl_net_profit_hint')}
                    valueClass={profitClass(pnl?.netProfit)}
                  />
                </div>
              </div>

              {Number(pnl?.soldWithoutSalePrice) > 0 && (
                <p className="mt-3 flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{t('financesPage.pnl_sold_without_price', { count: formatNumber(pnl.soldWithoutSalePrice) })}</span>
                </p>
              )}

              {/* Solishtiruv: Bitimlar sahifasi ↔ P&L */}
              {recon && (
                <div
                  className={cn(
                    'mt-4 rounded-control border border-line px-3 py-3',
                    recon.isReconciled ? 'bg-success-soft' : 'bg-warning-soft'
                  )}
                >
                  <div className={cn('flex items-start gap-2 text-sm font-semibold', recon.isReconciled ? 'text-success' : 'text-warning')}>
                    {recon.isReconciled ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {recon.isReconciled
                        ? t('financesPage.recon_ok')
                        : t('financesPage.recon_mismatch', {
                            diff: formatMoney(recon.difference),
                            count: formatNumber(recon.mismatchedDealsCount),
                          })}
                    </span>
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-secondary">{t('financesPage.recon_deals_page')}</dt>
                      <dd className="whitespace-nowrap font-medium tabular-nums text-fg">{formatMoney(recon.dealsNetProfit)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-secondary">{t('financesPage.recon_pnl')}</dt>
                      <dd className="whitespace-nowrap font-medium tabular-nums text-fg">{formatMoney(recon.pnlDealsProfit)}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </Card>

            {/* Trust: hisoblangan / olingan / qoldiq */}
            <Card>
              <CardHeader icon={<Handshake className="h-4 w-4" />} title={t('financesPage.trust_title')} description={t('financesPage.trust_sub', { rate: trustRate })} />
              <div className="space-y-1">
                <LineRow label={t('financesPage.trust_accrued')} value={pnl?.trustIncome} hint={t('financesPage.trust_accrued_hint')} />
                <LineRow
                  label={t('financesPage.trust_received')}
                  value={pnl?.trustReceived}
                  hint={t('financesPage.trust_received_hint')}
                  valueClass="text-success"
                />
                <div className="pt-2">
                  <LineRow
                    kind="total"
                    label={t('financesPage.trust_outstanding')}
                    value={pnl?.trustOutstanding}
                    hint={t('financesPage.trust_outstanding_hint')}
                    valueClass={Number(pnl?.trustOutstanding) > 0 ? 'text-warning' : 'text-success'}
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Debitorlik va kreditorlik (joriy holat) */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            <Card padding="none">
              <CardHeader
                bordered
                title={t('financesPage.receivables_title')}
                description={t('financesPage.current_state')}
                actions={
                  <span className="text-sm font-semibold tabular-nums text-warning">
                    {t('common.total')}: {formatMoney(totals?.totalReceivables)}
                  </span>
                }
              />
              <TableContainer bare maxHeightClass="max-h-[320px]">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t('financesPage.col_buyer')}</Th>
                      <Th align="right">{t('financesPage.col_shipped')}</Th>
                      <Th align="right">{t('financesPage.col_paid')}</Th>
                      <Th align="right">{t('financesPage.col_remainder')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {(!receivables || receivables.length === 0) && <TableEmpty colSpan={4} title={t('financesPage.receivables_empty')} />}
                    {receivables?.map((r: any) => (
                      <Tr key={r.id}>
                        <Td className="font-medium">
                          {r.id === 'trust' ? t('financesPage.trust_row', { rate: trustRate }) : r.buyerName}
                        </Td>
                        <Td align="right" numeric>
                          {formatMoney(r.shipped)}
                        </Td>
                        <Td align="right" numeric className="text-success">
                          {formatMoney(r.paid)}
                        </Td>
                        <Td align="right" numeric className="font-semibold">
                          {formatMoney(r.remainder)}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            </Card>

            <Card padding="none">
              <CardHeader
                bordered
                title={t('financesPage.payables_title')}
                description={t('financesPage.current_state')}
                actions={
                  <span className="text-sm font-semibold tabular-nums text-danger">
                    {t('common.total')}: {formatMoney(totals?.totalPayables)}
                  </span>
                }
              />
              <TableContainer bare maxHeightClass="max-h-[320px]">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t('financesPage.col_partner')}</Th>
                      <Th align="right">{t('financesPage.col_accrued')}</Th>
                      <Th align="right">{t('financesPage.col_paid')}</Th>
                      <Th align="right">{t('financesPage.col_remainder')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {(!payables || payables.length === 0) && <TableEmpty colSpan={4} title={t('financesPage.payables_empty')} />}
                    {payables?.map((c: any, i: number) => (
                      <Tr key={`${c.name}-${i}`}>
                        <Td className="font-medium">{c.name}</Td>
                        <Td align="right" numeric>
                          {formatMoney(c.accrued)}
                        </Td>
                        <Td align="right" numeric className="text-success">
                          {formatMoney(c.paid)}
                        </Td>
                        <Td align="right" numeric className="font-semibold">
                          {formatMoney(c.remainder)}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </TableContainer>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {/* Pul oqimi (davr) */}
            <Card>
              <CardHeader title={t('financesPage.cf_title')} description={period} />
              <div className="space-y-1">
                <LineRow kind="subtotal" label={t('financesPage.cf_beginning')} value={cashFlow?.beginningCash} />
                <LineRow kind="sub" sign="+" label={t('financesPage.cf_operating_in')} value={cashFlow?.operatingInflows} valueClass="text-success" />
                <LineRow kind="sub" sign="+" label={t('financesPage.cf_trust_in')} value={cashFlow?.trustInflows} valueClass="text-success" />
                <LineRow kind="sub" sign="+" label={t('financesPage.cf_investor_in')} value={cashFlow?.investorLoanInflow} valueClass="text-success" />
                <LineRow kind="sub" sign="−" label={t('financesPage.cf_purchase_out')} value={cashFlow?.purchaseOutflows} />
                <LineRow kind="sub" sign="−" label={t('financesPage.cf_uzimei_out')} value={cashFlow?.uzimeiOutflows} />
                <LineRow kind="sub" sign="−" label={t('financesPage.cf_opex_out')} value={cashFlow?.opexOutflows} />
                <LineRow kind="sub" sign="−" label={t('financesPage.cf_other_out')} value={cashFlow?.otherOutflows} />
                <div className="pt-2">
                  <LineRow kind="total" label={t('financesPage.cf_ending')} value={cashFlow?.endingCash} />
                </div>
              </div>
            </Card>

            {/* Boshqaruv balansi (joriy holat) — farq yashirilmaydi */}
            <Card>
              <CardHeader
                title={t('financesPage.bs_title')}
                description={t('financesPage.current_state')}
                actions={
                  <Badge tone={isBalanced ? 'success' : 'warning'} icon={isBalanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}>
                    {isBalanced ? t('financesPage.bs_balanced') : t('financesPage.bs_not_balanced')}
                  </Badge>
                }
              />

              {!isBalanced && (
                <div role="alert" className="mb-3 flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {balanceDiff > 0
                      ? t('financesPage.bs_diff_assets_more', { diff: formatMoney(Math.abs(balanceDiff)) })
                      : t('financesPage.bs_diff_assets_less', { diff: formatMoney(Math.abs(balanceDiff)) })}
                  </span>
                </div>
              )}

              <div className="space-y-1">
                <p className="pb-1 text-xs font-medium text-fg-muted">{t('financesPage.bs_assets')}</p>
                <LineRow kind="sub" label={t('financesPage.bs_cash')} value={balanceSheet?.assets?.cash} />
                <LineRow kind="sub" label={t('financesPage.bs_inventory')} value={balanceSheet?.assets?.inventory} />
                <LineRow kind="sub" label={t('financesPage.bs_buyer_receivables')} value={balanceSheet?.assets?.buyerReceivables} />
                <LineRow kind="sub" label={t('financesPage.bs_trust_receivable')} value={balanceSheet?.assets?.trustReceivable} />
                <LineRow kind="sub" label={t('financesPage.bs_fixed_assets')} value={balanceSheet?.assets?.fixedAssets} />
                <LineRow kind="subtotal" label={t('financesPage.bs_total_assets')} value={balanceSheet?.assets?.totalAssets} />

                <p className="pb-1 pt-4 text-xs font-medium text-fg-muted">{t('financesPage.bs_liabilities')}</p>
                <LineRow kind="sub" label={t('financesPage.bs_payables')} value={balanceSheet?.liabilities?.payables} />
                <LineRow kind="sub" label={t('financesPage.bs_loan')} value={balanceSheet?.liabilities?.longTermLoan} />
                <LineRow kind="sub" label={t('financesPage.bs_capital')} value={balanceSheet?.liabilities?.charterCapital} />
                <LineRow kind="sub" label={t('financesPage.bs_retained')} value={balanceSheet?.liabilities?.retainedEarnings} />
                <LineRow
                  kind="subtotal"
                  label={t('financesPage.bs_total_liabilities')}
                  value={balanceSheet?.liabilities?.totalLiabilitiesAndEquity}
                />

                <div className="pt-2">
                  <LineRow
                    kind="total"
                    label={t('financesPage.bs_difference')}
                    value={balanceDiff}
                    hint={t('financesPage.bs_difference_hint')}
                    valueClass={isBalanced ? 'text-success' : 'text-warning'}
                  />
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
export default FinancesSummaryPage;
