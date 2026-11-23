import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Input,
  LoadingBlock,
  PageHeader,
  StatCard,
  Table,
  TableContainer,
  TableEmpty,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  cn,
} from '../components/ui';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { formatDate, formatMoney } from '../utils/format';

// Nazorat (egasi, 23.11.2026): 7-blok tovar kutish, 6-blok registrator xatolari, 2-blok do'kon — provayder juftliklari.
type Tab = 'awaiting' | 'errors' | 'pairs';

const errText = (e: any, fallback: string) => e?.response?.data?.error || fallback;

export const ControlPage: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('awaiting');
  return (
    <div className="space-y-5">
      <PageHeader icon={<ShieldCheck className="h-5 w-5" />} title={t('control.title')} description={t('control.subtitle')} />
      <Tabs<Tab>
        items={[
          { value: 'awaiting', label: t('control.tab_awaiting') },
          { value: 'errors', label: t('control.tab_errors') },
          { value: 'pairs', label: t('control.tab_pairs') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'awaiting' && <AwaitingGoods />}
      {tab === 'errors' && <RegistratorErrors />}
      {tab === 'pairs' && <StoreProviderPairs />}
    </div>
  );
};

// ─────────────── 7-blok ───────────────
const AwaitingGoods: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    axios.get('/api/control/awaiting-goods').then((r) => setData(r.data)).catch((e) => setError(errText(e, t('common.error'))));
  }, [t]);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <LoadingBlock />;
  const tot = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t('control.aw_count')} value={tot.count} hint={t('control.aw_stale', { count: tot.staleCount, days: data.staleDays })} tone={tot.staleCount ? 'danger' : 'neutral'} />
        <StatCard title={t('control.aw_limit')} value={formatMoney(tot.withdrawnLimit)} />
        <StatCard title={t('control.aw_paid')} value={formatMoney(tot.calculatedAmount)} />
        <StatCard title={t('control.aw_profit')} value={formatMoney(tot.profit)} tone="success" />
      </div>
      {data.stores.length === 0 && <p className="text-sm text-fg-muted">{t('control.aw_none')}</p>}
      {data.stores.map((g: any) => (
        <Card key={g.storeId} padding="none" className={cn(g.staleCount > 0 && 'border-danger')}>
          <button
            type="button"
            className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
            onClick={() => setOpen((o) => ({ ...o, [g.storeId]: !o[g.storeId] }))}
          >
            <span className="font-semibold text-fg">
              {g.storeName}
              {g.staleCount > 0 && (
                <Badge tone="danger" size="sm" className="ml-2">
                  {t('control.aw_stale_badge', { count: g.staleCount })}
                </Badge>
              )}
            </span>
            <span className="text-sm tabular-nums text-fg-secondary">
              {t('control.aw_store_line', { count: g.count, limit: formatMoney(g.withdrawnLimit), profit: formatMoney(g.profit) })}
            </span>
          </button>
          {(open[g.storeId] ?? g.staleCount > 0) && (
            <TableContainer>
              <Table>
                <Thead>
                  <Tr>
                    <Th>№</Th>
                    <Th>{t('control.col_since')}</Th>
                    <Th align="right">{t('control.col_days')}</Th>
                    <Th>{t('control.col_status')}</Th>
                    <Th>{t('control.col_product')}</Th>
                    <Th align="right">{t('control.col_limit')}</Th>
                    <Th align="right">{t('control.col_profit')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {g.deals.map((d: any) => (
                    <Tr key={d.id} className={cn(d.stale && 'bg-danger-soft/60')}>
                      <Td numeric>#{d.dealNumber}</Td>
                      <Td numeric>{formatDate(d.date)}</Td>
                      <Td align="right" numeric className={cn(d.stale && 'font-semibold text-danger')}>
                        {d.days}
                      </Td>
                      <Td className="whitespace-nowrap">{t(`dealStatus.${d.status}`)}</Td>
                      <Td className="max-w-[14rem] truncate">
                        {d.productName || '—'}
                        <span className="block truncate text-xs text-fg-muted">{d.providerName}</span>
                      </Td>
                      <Td align="right" numeric>{formatMoney(d.withdrawnLimit)}</Td>
                      <Td align="right" numeric>{formatMoney(d.profit)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          )}
        </Card>
      ))}
    </div>
  );
};

// ─────────────── 6-blok ───────────────
const RegistratorErrors: React.FC = () => {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    setError('');
    axios.get('/api/control/registrator-errors', { params: { month } }).then((r) => setData(r.data)).catch((e) => setError(errText(e, t('common.error'))));
  }, [month, t]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-fg-secondary" htmlFor="reg-month">
          {t('control.month')}
        </label>
        <Input id="reg-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        <p className="text-xs text-fg-muted">{t('control.err_rule')}</p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <LoadingBlock />}
      {data && (
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('control.col_registrator')}</Th>
                <Th align="right">{t('control.col_total')}</Th>
                <Th align="right">{t('control.col_rejected')}</Th>
                <Th align="right">{t('control.col_fixed')}</Th>
                <Th align="right">{t('control.col_errors')}</Th>
                <Th align="right">%</Th>
                <Th>{t('control.col_error_deals')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.rows.length === 0 && <TableEmpty colSpan={7} title={t('control.err_none')} />}
              {data.rows.map((r: any) => (
                <Tr key={r.id}>
                  <Td>{r.fullName}</Td>
                  <Td align="right" numeric>{r.total}</Td>
                  <Td align="right" numeric>{r.rejected}</Td>
                  <Td align="right" numeric>{r.fixedAfterApproval}</Td>
                  <Td align="right" numeric className={cn(r.errors > 0 && 'font-semibold text-danger')}>{r.errors}</Td>
                  <Td align="right" numeric className={cn(r.errorPct >= 10 && 'font-semibold text-danger')}>{r.errorPct}%</Td>
                  <Td className="max-w-[16rem] truncate text-xs text-fg-muted">{r.errorDeals.map((n: number) => '#' + n).join(', ') || '—'}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
};

// ─────────────── 2-blok ───────────────
const StoreProviderPairs: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    axios.get('/api/control/pairs').then((r) => setData(r.data)).catch((e) => setError(errText(e, t('common.error'))));
  }, [t]);
  useEffect(load, [load]);

  const missing = useMemo(() => (data?.fromDeals || []).filter((p: any) => !p.allowed), [data]);
  const key = (p: any) => `${p.storeId}|${p.providerId}`;

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setPicked({});
      load();
    } catch (e) {
      setError(errText(e, t('common.error')));
    } finally {
      setBusy(false);
    }
  };
  const addPicked = (list: any[]) =>
    run(() => axios.post('/api/control/pairs', { pairs: list.map((p) => ({ storeId: p.storeId, providerId: p.providerId })) }));

  if (!data) return error ? <p className="text-sm text-danger">{error}</p> : <LoadingBlock />;
  const pickedList = missing.filter((p: any) => picked[key(p)]);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-fg">
            {t('control.pairs_check')}:{' '}
            <Badge tone={data.enabled ? 'success' : 'warning'}>{data.enabled ? t('control.on') : t('control.off')}</Badge>
          </p>
          <p className="mt-1 text-xs text-fg-muted">{t('control.pairs_check_hint')}</p>
        </div>
        {admin && (
          <Button variant={data.enabled ? 'secondary' : 'primary'} loading={busy} onClick={() => run(() => axios.post('/api/control/pairs/check', { enabled: !data.enabled }))}>
            {data.enabled ? t('control.turn_off') : t('control.turn_on')}
          </Button>
        )}
      </Card>
      {error && <p className="text-sm text-danger">{error}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-fg">{t('control.pairs_from_deals', { count: missing.length })}</h3>
        <p className="text-xs text-fg-muted">{t('control.pairs_from_deals_hint')}</p>
        {admin && missing.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !pickedList.length} onClick={() => addPicked(pickedList)}>
              {t('control.add_picked', { count: pickedList.length })}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => addPicked(missing)}>
              {t('control.add_all')}
            </Button>
          </div>
        )}
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                {admin && <Th />}
                <Th>{t('common.store')}</Th>
                <Th>{t('common.provider')}</Th>
                <Th align="right">{t('control.col_deals')}</Th>
                <Th>{t('control.col_period')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {missing.length === 0 && <TableEmpty colSpan={admin ? 5 : 4} title={t('control.pairs_all_added')} />}
              {missing.map((p: any) => (
                <Tr key={key(p)}>
                  {admin && (
                    <Td>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={!!picked[key(p)]}
                        onChange={(e) => setPicked((x) => ({ ...x, [key(p)]: e.target.checked }))}
                        aria-label={`${p.storeName} — ${p.providerName}`}
                      />
                    </Td>
                  )}
                  <Td>{p.storeName}</Td>
                  <Td>{p.providerName}</Td>
                  <Td align="right" numeric>{p.count}</Td>
                  <Td numeric className="text-xs text-fg-muted">
                    {formatDate(p.firstDate)} — {formatDate(p.lastDate)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-fg">{t('control.pairs_allowed', { count: data.pairs.length })}</h3>
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('common.store')}</Th>
                <Th>{t('common.provider')}</Th>
                {admin && <Th />}
              </Tr>
            </Thead>
            <Tbody>
              {data.pairs.length === 0 && <TableEmpty colSpan={admin ? 3 : 2} title={t('control.pairs_empty')} />}
              {data.pairs.map((p: any) => (
                <Tr key={p.id}>
                  <Td>{p.storeName}</Td>
                  <Td>{p.providerName}</Td>
                  {admin && (
                    <Td align="right">
                      <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => run(() => axios.delete(`/api/control/pairs/${p.id}`))}>
                        {t('common.delete')}
                      </Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </section>
    </div>
  );
};
