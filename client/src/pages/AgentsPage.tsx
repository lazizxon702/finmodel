import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { AlertTriangle, Briefcase, CalendarDays, CalendarRange, RefreshCw, Search, Sigma, UsersRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatDate, formatMoney, formatNumber, formatPercent } from '../utils/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangeFilter,
  defaultDateRange,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
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
  approvalTone,
  cn,
} from '../components/ui';

// --- API javoblari (server/src/routes/agents.routes.ts) ---
interface SummaryRow {
  agencyId: string | null;
  agencyName: string;
  today: number;
  month: number;
  total: number;
  dealsToday: number;
  dealsMonth: number;
  dealsTotal: number;
  /** Agent foydasi hisoblanmaydigan agentlik (Anvar) */
  noCommission?: boolean;
}

interface Summary {
  agencies: SummaryRow[];
  totals: Omit<SummaryRow, 'agencyId' | 'agencyName'>;
}

interface AgentDeal {
  id: string;
  dealNumber: number;
  date: string;
  dateTimeLabel?: string;
  approvalStatus?: string;
  agencyName: string;
  agentName: string;
  customerName: string;
  customerPhone1: string;
  productName: string;
  status: string;
  withdrawnLimit: number;
  purchaseDiscountPct: number;
  agentAmount: number;
  agentPct: number;
  profit: number;
}

interface DealTotals {
  dealCount: number;
  totalWithdrawn: number;
  totalCalculated: number;
  totalAgentCommission: number;
  totalProfit: number;
}

interface AgentOption {
  id: string;
  name: string;
  agencyId: string;
  agencyName: string;
  dealCount: number;
}

type ApprovalFilter = 'all' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

const DEAL_STATUSES = ['PENDING', 'IN_WAREHOUSE', 'SOLD', 'NEED_TO_BUY'];
const PAGE_SIZE = 50;

const linkButton =
  'inline-flex min-h-touch items-center justify-center gap-2 whitespace-nowrap rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 sm:min-h-[2.5rem]';

export const AgentsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAgent = user?.role === 'AGENT';

  // --- Yig'ma: bugun / shu oy / jami ---
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  // --- Bitimlar ---
  const [items, setItems] = useState<AgentDeal[]>([]);
  const [totals, setTotals] = useState<DealTotals | null>(null);
  const [agentsList, setAgentsList] = useState<AgentOption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState('');

  // --- Filtrlar ---
  const [agencyId, setAgencyId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [status, setStatus] = useState('');
  // Agent o'z kabinetida tasdiq kutayotgan va rad etilgan bitimlarini ham ko'rishi kerak
  const [approval, setApproval] = useState<ApprovalFilter>(isAgent ? 'all' : 'APPROVED');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState(() => defaultDateRange('all'));
  const [page, setPage] = useState(1);

  // AGENT: tab yonidagi sonlar (o'z doirasi bo'yicha)
  const [pending, setPending] = useState<{ count: number; rejectedCount: number } | null>(null);

  // Qidiruv: yozish tugagach so'rov yuboriladi
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  const loadSummary = useCallback(
    async (silent = false) => {
      if (!silent) setSummaryLoading(true);
      try {
        const res = await axios.get<Summary>('/api/agents/commission-summary');
        setSummary(res.data);
        setSummaryError('');
      } catch (e: any) {
        if (!silent) setSummaryError(e?.response?.data?.error || t('agentsPage.summary_error'));
      } finally {
        if (!silent) setSummaryLoading(false);
      }
    },
    [t]
  );

  const loadPending = useCallback(() => {
    if (!isAgent) return;
    axios
      .get('/api/deals/pending-count')
      .then((res) => setPending({ count: Number(res.data?.count) || 0, rejectedCount: Number(res.data?.rejectedCount) || 0 }))
      .catch(() => undefined);
  }, [isAgent]);

  // Eskirgan javob yangisining ustidan yozilmasligi uchun
  const requestSeq = useRef(0);
  const loadDeals = useCallback(
    async (silent = false) => {
      const seq = ++requestSeq.current;
      if (!silent) setDealsLoading(true);
      try {
        const res = await axios.get('/api/agents/deals', {
          params: {
            page,
            limit: PAGE_SIZE,
            approvalStatus: approval,
            agencyId: agencyId || undefined,
            agentId: agentId || undefined,
            status: status || undefined,
            search: search || undefined,
            startDate: range.startDate || undefined,
            endDate: range.endDate || undefined,
          },
        });
        if (seq !== requestSeq.current) return;
        setItems(res.data?.items || []);
        setTotals(res.data?.totals || null);
        setAgentsList(res.data?.agentsList || []);
        setTotalCount(res.data?.pagination?.total || 0);
        setTotalPages(Math.max(1, res.data?.pagination?.totalPages || 1));
        setDealsError('');
      } catch (e: any) {
        if (seq !== requestSeq.current || silent) return;
        setItems([]);
        setTotals(null);
        setDealsError(e?.response?.data?.error || t('agentsPage.deals_error'));
      } finally {
        if (seq === requestSeq.current && !silent) setDealsLoading(false);
      }
    },
    [page, approval, agencyId, agentId, status, search, range.startDate, range.endDate, t]
  );

  useEffect(() => {
    void loadSummary();
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, approval, agencyId, agentId, status, search, range.startDate, range.endDate]);

  // Bitim yaratilsa / tasdiqlansa / rad etilsa — raqamlar jimgina yangilanadi
  useRealtime('deals:updated', () => {
    void loadSummary(true);
    void loadDeals(true);
    loadPending();
  });

  const refreshAll = () => {
    void loadSummary();
    void loadDeals();
    loadPending();
  };

  const selectAgency = (id: string) => {
    setAgencyId((prev) => (prev === id ? '' : id));
    setAgentId('');
    setPage(1);
  };

  const rows = summary?.agencies || [];
  const selectedRow = useMemo(() => rows.find((r) => r.agencyId && r.agencyId === agencyId) || null, [rows, agencyId]);
  // Kartochkalar: agentlik tanlangan bo'lsa — uniki, aks holda umumiy (AGENT uchun yagona qator = o'zi)
  const cards = selectedRow || summary?.totals || null;
  const agentOptions = agencyId ? agentsList.filter((a) => a.agencyId === agencyId) : agentsList;
  const hasFilters = !!(agencyId || agentId || status || searchInput || range.mode !== 'all');

  const resetFilters = () => {
    setAgencyId('');
    setAgentId('');
    setStatus('');
    setSearchInput('');
    setRange(defaultDateRange('all'));
    setPage(1);
  };

  const approvalTabs = [
    { value: 'all' as ApprovalFilter, label: t('agentsPage.filter_all') },
    { value: 'PENDING_APPROVAL' as ApprovalFilter, label: t('approval.PENDING_APPROVAL'), count: pending?.count },
    { value: 'APPROVED' as ApprovalFilter, label: t('approval.APPROVED') },
    { value: 'REJECTED' as ApprovalFilter, label: t('approval.REJECTED'), count: pending?.rejectedCount },
  ];

  const dealsTitle = isAgent
    ? t('agentsPage.deals_title_mine')
    : selectedRow
      ? t('agentsPage.deals_title_agency', { name: selectedRow.agencyName })
      : t('agentsPage.deals_title_all');

  const columnCount = isAgent ? 9 : 10;
  const cardValue = (value?: number) => (summaryLoading && !summary ? '…' : formatMoney(value ?? 0));
  const cardHint = (count?: number) => t('agentsPage.deals_count', { count: formatNumber(count ?? 0) });

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={<Briefcase />}
        title={t(isAgent ? 'agentsPage.cabinet_title' : 'agentsPage.title')}
        description={
          isAgent
            ? user?.agencyName
              ? t('agentsPage.cabinet_agency', { name: user.agencyName })
              : t('agentsPage.cabinet_subtitle')
            : t('agentsPage.subtitle')
        }
        actions={
          <>
            {isAgent && (
              <Link to="/team" className={linkButton}>
                <UsersRound className="h-4 w-4" aria-hidden="true" />
                {t('agentsPage.go_team')}
              </Link>
            )}
            <Button
              variant="secondary"
              size="icon"
              onClick={refreshAll}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              disabled={summaryLoading || dealsLoading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {summaryError && (
        <div role="alert" className="flex flex-col gap-2 rounded-card bg-danger-soft px-4 py-3 text-sm text-danger sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{summaryError}</span>
          </span>
          <Button variant="secondary" size="sm" onClick={() => void loadSummary()} className="shrink-0">
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Agent foydasi: bugun / shu oy / jami */}
      <section aria-label={t('agentsPage.title')} className="space-y-2">
        {!isAgent && (
          <p className="text-xs font-medium text-fg-secondary">{selectedRow ? selectedRow.agencyName : t('agentsPage.scope_all')}</p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatCard
            title={t('agentsPage.card_today')}
            value={cardValue(cards?.today)}
            hint={cardHint(cards?.dealsToday)}
            icon={<CalendarDays />}
            tone="brand"
          />
          <StatCard
            title={t('agentsPage.card_month')}
            value={cardValue(cards?.month)}
            hint={cardHint(cards?.dealsMonth)}
            icon={<CalendarRange />}
            tone="violet"
          />
          <StatCard
            title={t('agentsPage.card_total')}
            value={cardValue(cards?.total)}
            hint={cardHint(cards?.dealsTotal)}
            icon={<Sigma />}
            tone="success"
          />
        </div>
        <p className="text-xs leading-relaxed text-fg-muted">{t('agentsPage.formula')}</p>
      </section>

      {/* Agentliklar kesimi — AGENT uchun ko'rsatilmaydi (u faqat o'z raqamlarini ko'radi) */}
      {!isAgent && (
        <Card padding="none">
          <CardHeader
            bordered
            title={t('agentsPage.agencies_title')}
            description={t('agentsPage.agencies_hint')}
            actions={
              agencyId ? (
                <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={() => selectAgency(agencyId)}>
                  {t('agentsPage.show_all')}
                </Button>
              ) : undefined
            }
          />
          {summaryLoading && !summary ? (
            <LoadingBlock label={t('common.loading')} />
          ) : (
            <TableContainer bare maxHeightClass="max-h-[24rem]">
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('agentsPage.col_agency')}</Th>
                    <Th align="right">{t('agentsPage.card_today')}</Th>
                    <Th align="right">{t('agentsPage.card_month')}</Th>
                    <Th align="right">{t('agentsPage.card_total')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.length === 0 && <TableEmpty colSpan={4} title={t('agentsPage.agencies_empty')} />}
                  {rows.map((row) => {
                    const active = !!row.agencyId && row.agencyId === agencyId;
                    const cell = (amount: number, count: number) => (
                      <>
                        <span className={cn('block font-medium', amount === 0 && 'font-normal text-fg-muted')}>{formatMoney(amount)}</span>
                        <span className="block text-xs text-fg-muted">{cardHint(count)}</span>
                      </>
                    );
                    return (
                      <Tr
                        key={row.agencyId || row.agencyName}
                        clickable={!!row.agencyId}
                        onClick={row.agencyId ? () => selectAgency(row.agencyId!) : undefined}
                        className={active ? 'bg-brand-soft hover:bg-brand-soft' : undefined}
                      >
                        <Td className="min-w-[9rem] font-medium">
                          {row.agencyId ? (
                            <button
                              type="button"
                              aria-pressed={active}
                              className={cn('text-left underline-offset-2 hover:underline', active && 'text-accent')}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectAgency(row.agencyId!);
                              }}
                            >
                              {row.agencyName}
                            </button>
                          ) : (
                            row.agencyName
                          )}
                          {row.noCommission && <span className="block text-xs font-normal text-fg-muted">{t('agentsPage.no_commission')}</span>}
                        </Td>
                        <Td align="right" numeric>
                          {cell(row.today, row.dealsToday)}
                        </Td>
                        <Td align="right" numeric>
                          {cell(row.month, row.dealsMonth)}
                        </Td>
                        <Td align="right" numeric>
                          {cell(row.total, row.dealsTotal)}
                        </Td>
                      </Tr>
                    );
                  })}
                  {rows.length > 1 && summary && (
                    <Tr className="bg-surface-2 font-semibold hover:bg-surface-2">
                      <Td>{t('common.total')}</Td>
                      <Td align="right" numeric>
                        {formatMoney(summary.totals.today)}
                      </Td>
                      <Td align="right" numeric>
                        {formatMoney(summary.totals.month)}
                      </Td>
                      <Td align="right" numeric>
                        {formatMoney(summary.totals.total)}
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}

      {/* Bitimlar */}
      <Card padding="none">
        <CardHeader
          bordered
          title={dealsTitle}
          description={
            totals
              ? t('agentsPage.deals_totals', {
                  count: formatNumber(totals.dealCount),
                  limit: formatMoney(totals.totalWithdrawn),
                  profit: formatMoney(totals.totalAgentCommission),
                })
              : undefined
          }
          actions={
            hasFilters ? (
              <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={resetFilters}>
                {t('common.clear_filter')}
              </Button>
            ) : undefined
          }
        />

        <Tabs
          ariaLabel={t('agentsPage.filter_approval')}
          className="px-2 sm:px-3"
          items={approvalTabs}
          value={approval}
          onChange={(v) => {
            setApproval(v);
            setPage(1);
          }}
        />

        <div className="space-y-3 border-b border-line px-4 py-3 sm:px-5">
          <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', !isAgent && 'lg:grid-cols-3')}>
            <Input
              leftIcon={<Search />}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('agentsPage.filter_search')}
              aria-label={t('agentsPage.filter_search')}
            />
            {!isAgent && (
              <Select
                value={agentId}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  setPage(1);
                }}
                aria-label={t('agentsPage.col_agent')}
              >
                <option value="">{t('agentsPage.filter_agent_all')}</option>
                {agentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.agencyName || t('agentsPage.no_agency')}) — {a.dealCount}
                  </option>
                ))}
              </Select>
            )}
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              aria-label={t('common.status')}
            >
              <option value="">{t('agentsPage.filter_status_all')}</option>
              {DEAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`dealStatus.${s}`)}
                </option>
              ))}
            </Select>
          </div>
          <DateRangeFilter
            value={range}
            onChange={(v) => {
              setRange(v);
              setPage(1);
            }}
          />
        </div>

        {/* Kompaniya ko'rsatkichlari — agentga ko'rsatilmaydi */}
        {!isAgent && totals && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-line px-4 py-3 text-sm sm:grid-cols-3 sm:px-5">
            {[
              [t('agentsPage.kpi_limit'), totals.totalWithdrawn],
              [t('agentsPage.kpi_payout'), totals.totalCalculated],
              [t('agentsPage.kpi_company_profit'), totals.totalProfit],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-baseline justify-between gap-3 sm:block">
                <dt className="text-xs text-fg-muted">{label}</dt>
                <dd className="font-semibold tabular-nums text-fg sm:mt-0.5">{formatMoney(value as number)}</dd>
              </div>
            ))}
          </dl>
        )}

        {dealsLoading && items.length === 0 ? (
          <LoadingBlock label={t('common.loading')} />
        ) : dealsError ? (
          <EmptyState
            icon={<AlertTriangle />}
            title={t('agentsPage.deals_error')}
            description={dealsError}
            action={
              <Button variant="secondary" onClick={() => void loadDeals()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <TableContainer bare className={cn(dealsLoading && 'opacity-60')}>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('agentsPage.col_deal')}</Th>
                  <Th>{t('agentsPage.col_customer')}</Th>
                  <Th>{t('agentsPage.col_product')}</Th>
                  <Th>{t('agentsPage.col_agent')}</Th>
                  <Th>{t('agentsPage.col_approval')}</Th>
                  <Th align="right">{t('agentsPage.col_limit')}</Th>
                  <Th align="right">{t('agentsPage.col_discount')}</Th>
                  <Th align="right">{t('agentsPage.col_agent_pct')}</Th>
                  <Th align="right">{t('agentsPage.col_agent_profit')}</Th>
                  {!isAgent && <Th align="right">{t('agentsPage.col_company_profit')}</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {items.length === 0 && (
                  <TableEmpty
                    colSpan={columnCount}
                    title={t('agentsPage.deals_empty')}
                    description={hasFilters || approval !== 'all' ? t('agentsPage.deals_empty_hint') : undefined}
                  />
                )}
                {items.map((deal) => (
                  <Tr key={deal.id}>
                    <Td numeric>
                      <span className="block font-medium">№{deal.dealNumber}</span>
                      <span className="block text-xs text-fg-muted">{deal.dateTimeLabel || formatDate(deal.date)}</span>
                    </Td>
                    <Td className="min-w-[9rem]">
                      <span className="block">{deal.customerName || '—'}</span>
                      {deal.customerPhone1 && <span className="block text-xs tabular-nums text-fg-muted">{deal.customerPhone1}</span>}
                    </Td>
                    <Td className="max-w-[14rem]">
                      <span className="block truncate" title={deal.productName}>
                        {deal.productName}
                      </span>
                      <span className="block text-xs text-fg-muted">{t(`dealStatus.${deal.status}`, deal.status || '')}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="block">{deal.agentName}</span>
                      {!isAgent && <span className="block text-xs text-fg-muted">{deal.agencyName}</span>}
                    </Td>
                    <Td>
                      <Badge tone={approvalTone(deal.approvalStatus)}>
                        {t(`approval.${deal.approvalStatus}`, deal.approvalStatus || '—')}
                      </Badge>
                    </Td>
                    <Td align="right" numeric>
                      {formatMoney(deal.withdrawnLimit)}
                    </Td>
                    <Td align="right" numeric className="text-fg-secondary">
                      {formatPercent(deal.purchaseDiscountPct)}
                    </Td>
                    <Td align="right" numeric className="text-fg-secondary">
                      {formatPercent(deal.agentPct)}
                    </Td>
                    <Td align="right" numeric className="font-semibold">
                      {formatMoney(deal.agentAmount)}
                    </Td>
                    {!isAgent && (
                      <Td align="right" numeric className={deal.profit < 0 ? 'text-danger' : 'text-success'}>
                        {formatMoney(deal.profit)}
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        )}

        {!dealsError && (
          <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="tabular-nums">{t('agentsPage.total_found', { count: formatNumber(totalCount) })}</span>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Button variant="secondary" size="sm" disabled={page <= 1 || dealsLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t('agentsPage.prev')}
              </Button>
              <span className="tabular-nums">{t('agentsPage.page', { page, total: totalPages })}</span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages || dealsLoading} onClick={() => setPage((p) => p + 1)}>
                {t('agentsPage.next')}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AgentsPage;
