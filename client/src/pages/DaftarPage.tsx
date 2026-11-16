import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AlertCircle, BadgeDollarSign, BookOpen, HandCoins, Info, TrendingUp, Undo2, Wallet, Warehouse } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangeFilter,
  EmptyState,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  StatCard,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  cn,
  controlClass,
  defaultDateRange,
  type DateRangeValue,
} from '../components/ui';
import { AmountInput } from '../components/AmountInput';
import { apiErrorMessage, periodLabel, rangeParams } from '../components/dashboard/period';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatMoney, formatNumber } from '../utils/format';

/** Daftar cheki bosqichlari: chek urildi → pul tushdi → qurilma olindi → sotildi */
type Stage = 'CHEQUE' | 'MONEY' | 'DEVICE' | 'SOLD';
const STAGES: Stage[] = ['CHEQUE', 'MONEY', 'DEVICE', 'SOLD'];
const STAGE_TONE: Record<Stage, 'warning' | 'info' | 'brand' | 'success'> = { CHEQUE: 'warning', MONEY: 'info', DEVICE: 'brand', SOLD: 'success' };

interface DaftarSummary {
  dealsCount: number;
  limitTotal: number;
  spentTotal: number;
  stages: Record<Stage, number>;
  bought: { count: number; amount: number; missingPrice: number };
  sold: { count: number; salePrice: number; received: number; missingPrice: number };
  profit: number;
  needToBuy: { count: number; limit: number; awaitingMoneyCount: number; awaitingMoneyLimit: number; readyCount: number; readyLimit: number };
  balances: { limitLeft: number; inStock: number; inStockCount: number; buyerDebt: number; cash: number };
}
interface DaftarDeal {
  id: string;
  dealNumber: number;
  dateLabel: string;
  stage: Stage;
  inSale: boolean;
  customerName: string | null;
  productName: string | null;
  agencyName: string | null;
  agentName: string | null;
  withdrawnLimit: number;
  spent: number;
  devicePurchaseAmount: number;
  salePrice: number;
  result: number | null;
}
interface DaftarGroup {
  storeId: string;
  name: string;
  summary: DaftarSummary;
  deals: DaftarDeal[];
}
interface DaftarResponse {
  canEdit: boolean;
  daftars: DaftarGroup[];
  totals: DaftarSummary;
}

/** Egasi so'ragan ko'rsatkichlar: tovar olingan, sotilgan, foyda/zarar, tovar olish kerak, sarflangan pul */
const SummaryCards: React.FC<{ s: DaftarSummary }> = ({ s }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-5">
      <StatCard
        title={t('daftar.bought')}
        value={formatMoney(s.bought.amount)}
        hint={
          t('daftar.cheques', { count: formatNumber(s.bought.count) }) +
          (s.bought.missingPrice > 0 ? ` · ${t('daftar.missing_price', { count: formatNumber(s.bought.missingPrice) })}` : '')
        }
        icon={<Warehouse />}
        tone="brand"
      />
      <StatCard
        title={t('daftar.sold')}
        value={formatMoney(s.sold.salePrice)}
        hint={
          t('daftar.sold_hint', { count: formatNumber(s.sold.count), received: formatMoney(s.sold.received) }) +
          (s.sold.missingPrice > 0 ? ` · ${t('daftar.missing_price', { count: formatNumber(s.sold.missingPrice) })}` : '')
        }
        icon={<BadgeDollarSign />}
        tone="info"
      />
      <StatCard
        title={t('daftar.profit')}
        value={formatMoney(s.profit)}
        hint={t('daftar.profit_hint')}
        icon={<TrendingUp />}
        tone={s.profit < 0 ? 'danger' : 'success'}
      />
      <StatCard
        title={t('daftar.need_to_buy')}
        value={formatMoney(s.needToBuy.limit)}
        hint={t('daftar.need_to_buy_hint', {
          ready: formatNumber(s.needToBuy.readyCount),
          waiting: formatNumber(s.needToBuy.awaitingMoneyCount),
        })}
        icon={<HandCoins />}
        tone={s.needToBuy.limit > 0 ? 'warning' : 'success'}
      />
      <StatCard
        title={t('daftar.spent')}
        value={formatMoney(s.spentTotal)}
        hint={t('daftar.spent_hint', { limit: formatMoney(s.limitTotal) })}
        icon={<Wallet />}
        tone="neutral"
      />
    </div>
  );
};

/** Qoldiqlar: limit qoldig'i, ombordagi tovar, xaridorlar qarzi, pul qoldig'i */
const Balances: React.FC<{ s: DaftarSummary }> = ({ s }) => {
  const { t } = useTranslation();
  const rows = [
    { label: t('daftar.bal_limit_left'), value: s.balances.limitLeft, note: t('daftar.cheques', { count: formatNumber(s.needToBuy.count) }) },
    { label: t('daftar.bal_in_stock'), value: s.balances.inStock, note: t('daftar.cheques', { count: formatNumber(s.balances.inStockCount) }) },
    { label: t('daftar.bal_buyer_debt'), value: s.balances.buyerDebt, note: '' },
    { label: t('daftar.bal_cash'), value: s.balances.cash, note: t('daftar.bal_cash_note') },
  ];
  return (
    <dl className="grid grid-cols-1 divide-y divide-line border-t border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
      {rows.map((r) => (
        <div key={r.label} className="px-4 py-3 sm:px-5">
          <dt className="text-xs text-fg-muted">{r.label}</dt>
          <dd className={cn('mt-0.5 text-base font-semibold tabular-nums', r.value < 0 ? 'text-danger' : 'text-fg')}>{formatMoney(r.value)}</dd>
          {r.note && <p className="text-xs text-fg-muted">{r.note}</p>}
        </div>
      ))}
    </dl>
  );
};

// Daftar hisoboti: Daftar Denov va Daftar Jizzax — alohida-alohida. Marshrut: /daftar.
// Qodir aka bilan hisob-kitob bu yerga kirmaydi (/qodir-ledger).
export const DaftarPage: React.FC = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('month'));
  const [data, setData] = useState<DaftarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deviceDeal, setDeviceDeal] = useState<DaftarDeal | null>(null);
  const [deviceAmount, setDeviceAmount] = useState(0);
  const requestId = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      const id = ++requestId.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await axios.get('/api/daftar-reports', { params: rangeParams(range) });
        if (id !== requestId.current) return;
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
    load();
  }, [load]);
  useRealtime('deals:updated', () => load(true));

  /** Bosqichni o'zgartiradi: money-received | device-purchased | back */
  const act = async (deal: DaftarDeal, action: 'money-received' | 'device-purchased' | 'back', body?: object) => {
    setBusyId(deal.id);
    setActionError('');
    try {
      await axios.post(`/api/daftar-reports/${deal.id}/${action}`, body || {});
      setDeviceDeal(null);
      await load(true);
    } catch (err) {
      setActionError(apiErrorMessage(err, t('common.load_error')));
    } finally {
      setBusyId(null);
    }
  };

  const openDevice = (deal: DaftarDeal) => {
    setActionError('');
    setDeviceAmount(deal.devicePurchaseAmount || 0);
    setDeviceDeal(deal);
  };

  const daftars = data?.daftars ?? [];
  const canEdit = !!data?.canEdit;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader icon={<BookOpen />} title={t('title.daftar')} description={t('dashboardPage.period_shown', { period: periodLabel(range, t) })} />

      <Card padding="sm" className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <DateRangeFilter value={range} onChange={setRange} />
        <p className="flex items-start gap-2 text-xs leading-relaxed text-fg-muted lg:max-w-xl">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{t('daftar.rule_note')}</span>
        </p>
      </Card>

      {actionError && !deviceDeal && (
        <p role="alert" className="rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}

      {loading && !data && <LoadingBlock label={t('common.loading')} className="min-h-[30vh]" />}

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle />}
            title={t('common.load_error')}
            description={error}
            action={
              <Button variant="secondary" onClick={() => load()}>
                {t('common.retry')}
              </Button>
            }
          />
        </Card>
      )}

      {data && daftars.length === 0 && (
        <Card>
          <EmptyState icon={<BookOpen />} title={t('daftar.empty')} description={t('daftar.empty_hint')} />
        </Card>
      )}

      {data && daftars.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-fg">
            {t('daftar.all_title')}{' '}
            <span className="text-sm font-normal text-fg-muted">· {t('daftar.cheques', { count: formatNumber(data.totals.dealsCount) })}</span>
          </h2>
          <SummaryCards s={data.totals} />
        </section>
      )}

      {daftars.map((g) => (
        <section key={g.storeId} className="space-y-3">
          <h2 className="text-lg font-semibold text-fg">
            {t('daftar.name', { name: g.name })}{' '}
            <span className="text-sm font-normal text-fg-muted">· {t('daftar.cheques', { count: formatNumber(g.summary.dealsCount) })}</span>
          </h2>
          <SummaryCards s={g.summary} />

          <Card padding="none">
            <CardHeader
              bordered
              title={t('daftar.balances')}
              description={STAGES.map((st) => `${t(`daftar.stage_${st}`)}: ${formatNumber(g.summary.stages[st])}`).join(' · ')}
            />
            <Balances s={g.summary} />
          </Card>

          <Card padding="none">
            <CardHeader bordered title={t('daftar.deals_title')} description={t('daftar.cheques', { count: formatNumber(g.deals.length) })} />
            <TableContainer bare maxHeightClass="max-h-[65vh]">
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('daftar.col_cheque')}</Th>
                    <Th>{t('daftar.col_customer')}</Th>
                    <Th>{t('daftar.col_stage')}</Th>
                    <Th align="right">{t('daftar.col_limit')}</Th>
                    <Th align="right">{t('daftar.col_spent')}</Th>
                    <Th align="right">{t('daftar.col_device')}</Th>
                    <Th align="right">{t('daftar.col_sale')}</Th>
                    <Th align="right">{t('daftar.col_result')}</Th>
                    {canEdit && <Th align="right">{t('common.actions')}</Th>}
                  </Tr>
                </Thead>
                <Tbody>
                  {g.deals.map((d) => {
                    const busy = busyId === d.id;
                    return (
                      <Tr key={d.id}>
                        <Td className="whitespace-nowrap">
                          <p className="font-medium">№{d.dealNumber}</p>
                          <p className="text-xs text-fg-muted">{d.dateLabel}</p>
                        </Td>
                        <Td className="min-w-[11rem]">
                          <p>{d.customerName || d.productName || '—'}</p>
                          <p className="text-xs text-fg-muted">
                            {[d.customerName ? d.productName : null, d.agentName, d.agencyName && d.agencyName !== d.agentName ? d.agencyName : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </Td>
                        <Td className="whitespace-nowrap">
                          <Badge tone={STAGE_TONE[d.stage]} size="sm">
                            {STAGES.indexOf(d.stage) + 1}/4 · {t(`daftar.stage_${d.stage}`)}
                          </Badge>
                        </Td>
                        <Td align="right" numeric className="font-semibold">
                          {formatMoney(d.withdrawnLimit)}
                        </Td>
                        <Td align="right" numeric>
                          {formatMoney(d.spent)}
                        </Td>
                        <Td align="right" numeric>
                          {d.devicePurchaseAmount > 0 ? formatMoney(d.devicePurchaseAmount) : '—'}
                        </Td>
                        <Td align="right" numeric>
                          {d.salePrice > 0 ? formatMoney(d.salePrice) : '—'}
                        </Td>
                        <Td align="right" numeric className={cn('font-semibold', d.result !== null && (d.result < 0 ? 'text-danger' : 'text-success'))}>
                          {d.result === null ? '—' : formatMoney(d.result)}
                        </Td>
                        {canEdit && (
                          <Td align="right" className="whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {d.stage === 'CHEQUE' && !d.inSale && (
                                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(d, 'money-received')}>
                                  {t('daftar.act_money')}
                                </Button>
                              )}
                              {d.stage === 'MONEY' && !d.inSale && (
                                <Button size="sm" disabled={busy} onClick={() => openDevice(d)}>
                                  {t('daftar.act_device')}
                                </Button>
                              )}
                              {d.stage === 'DEVICE' && !d.inSale && (
                                <>
                                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => openDevice(d)}>
                                    {t('daftar.act_fix_price')}
                                  </Button>
                                  <Link to="/sales" className="text-sm font-medium text-accent hover:underline">
                                    {t('daftar.act_sell')}
                                  </Link>
                                </>
                              )}
                              {d.stage === 'SOLD' && !d.inSale && !(d.devicePurchaseAmount > 0) && (
                                <Button size="sm" variant="secondary" disabled={busy} onClick={() => openDevice(d)}>
                                  {t('daftar.act_enter_price')}
                                </Button>
                              )}
                              {(d.stage === 'MONEY' || d.stage === 'DEVICE') && !d.inSale && (
                                <button
                                  type="button"
                                  title={t('daftar.act_back')}
                                  aria-label={t('daftar.act_back')}
                                  disabled={busy}
                                  onClick={() => void act(d, 'back')}
                                  className="rounded-control p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                                >
                                  <Undo2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </Td>
                        )}
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
            <p className="border-t border-line px-4 py-2.5 text-xs text-fg-muted sm:px-5">{t('daftar.profit_note')}</p>
          </Card>
        </section>
      ))}

      <Modal
        open={!!deviceDeal}
        onClose={() => busyId === null && setDeviceDeal(null)}
        size="sm"
        title={t('daftar.device_title', { number: deviceDeal?.dealNumber ?? '' })}
        description={t('daftar.device_desc', { limit: formatMoney(deviceDeal?.withdrawnLimit ?? 0) })}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeviceDeal(null)} disabled={busyId !== null}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busyId !== null || !(deviceAmount > 0)}
              onClick={() => deviceDeal && void act(deviceDeal, 'device-purchased', { amount: deviceAmount })}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <Field label={t('daftar.device_amount')} required>
          <AmountInput value={deviceAmount} onChange={setDeviceAmount} autoFocus className={cn(controlClass, 'tabular-nums')} placeholder="6 000 000" />
        </Field>
        {actionError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {actionError}
          </p>
        )}
      </Modal>
    </div>
  );
};
export default DaftarPage;
