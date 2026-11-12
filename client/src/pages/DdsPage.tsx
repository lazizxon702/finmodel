import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownUp,
  ArrowUpRight,
  Building,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Layers,
  PieChart,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
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
  type Tone,
} from '../components/ui';
import { apiErrorMessage } from '../components/dashboard/period';
import { DdsFormModal } from '../components/dds/DdsFormModal';
import {
  DDS_ACCOUNTS,
  DDS_DELETE_ROLES,
  DDS_SOURCES,
  DDS_SYNC_ROLES,
  DDS_WRITE_ROLES,
  DEFAULT_CATEGORIES,
  type DdsBalances,
  type DdsSource,
} from '../components/dds/constants';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { DdsTransaction } from '../types';
import { formatDateTime, formatMoney, formatNumber, formatPercent } from '../utils/format';

const SOURCE_TONE: Record<DdsSource, Tone> = {
  MANUAL: 'neutral',
  DEAL_CHECK: 'info',
  TRUST_PAYMENT: 'brand',
  SYNC: 'warning',
};

interface Notice {
  tone: 'success' | 'danger';
  text: string;
}

export const DdsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const role = user?.role || '';
  const isAdmin = role === 'ADMIN';
  const canWrite = DDS_WRITE_ROLES.includes(role);
  const canDelete = DDS_DELETE_ROLES.includes(role);
  const canSync = DDS_SYNC_ROLES.includes(role);

  const [transactions, setTransactions] = useState<DdsTransaction[]>([]);
  const [totalOnServer, setTotalOnServer] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const [balances, setBalances] = useState<DdsBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Filtrlar
  const [typeFilter, setTypeFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false);

  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  // Modallar
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [syncingDds, setSyncingDds] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DdsTransaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearCode, setClearCode] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const requestId = useRef(0);

  // Qidiruv matni yozib bo'lingach so'rov yuboriladi (har harfda emas)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get('/api/dds/categories');
      if (Array.isArray(res.data) && res.data.length > 0) {
        // Server ro'yxati oldinda (tizim kategoriyalari boshida), so'ng boshlang'ich ro'yxatdan yetishmaganlari
        setCategories((prev) => Array.from(new Set<string>([...res.data, ...prev])));
      }
    } catch {
      // Kategoriyalar yuklanmasa boshlang'ich ro'yxat bilan ishlayveradi
    }
  }, []);

  // silent = true — real vaqt hodisasi yoki saqlashdan keyingi jim yangilash (jadval o'chib-yonmaydi)
  const fetchDdsData = useCallback(
    async (silent = false) => {
      const id = ++requestId.current;
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const [txRes, sumRes] = await Promise.all([
          axios.get('/api/dds', {
            params: {
              type: typeFilter || undefined,
              account: accountFilter || undefined,
              source: sourceFilter || undefined,
              search: search || undefined,
              limit: 500,
              sortOrder: 'desc',
            },
          }),
          axios.get('/api/dds/summary'),
        ]);
        if (id !== requestId.current) return; // eskirgan javob

        const rows: DdsTransaction[] = (txRes.data.transactions || []).filter(
          (tx: DdsTransaction) => Number(tx.amount) > 0 || (tx.description && tx.description.trim() !== '')
        );
        setTransactions(rows);
        setTotalOnServer(Number(txRes.data.pagination?.total) || rows.length);
        setSummary(sumRes.data);
        if (sumRes.data?.balances) setBalances(sumRes.data.balances);
        setLoadError(null);
      } catch (err) {
        if (id !== requestId.current || silent) return;
        setLoadError(apiErrorMessage(err, t('common.load_error')));
      } finally {
        if (id === requestId.current && !silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeFilter, accountFilter, sourceFilter, search]
  );

  useEffect(() => {
    fetchDdsData();
  }, [fetchDdsData]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useRealtime('dds:updated', () => {
    fetchDdsData(true);
    fetchCategories();
  });

  const handleSyncDdsFromSheets = async () => {
    if (syncingDds) return;
    setSyncingDds(true);
    setNotice(null);
    try {
      const res = await axios.post('/api/sync/dds');
      setNotice({
        tone: 'success',
        text: t('ddsPage.sync_done', {
          count: formatNumber(res.data?.importedCount),
          income: formatMoney(res.data?.totalIncome),
          expense: formatMoney(res.data?.totalExpense),
          net: formatMoney(res.data?.netCashflow),
        }),
      });
      fetchDdsData(true);
      fetchCategories();
    } catch (err) {
      setNotice({ tone: 'danger', text: `${t('ddsPage.sync_error')}: ${apiErrorMessage(err, t('errors.server'))}` });
    } finally {
      setSyncingDds(false);
    }
  };

  const handleCreated = (created: any) => {
    setIsFormOpen(false);
    // Javobdagi yangi qoldiqlar darhol ko'rsatiladi; ro'yxat fon rejimida yangilanadi
    if (created?.balances) setBalances(created.balances);
    setNotice({
      tone: 'success',
      text: created?.trust
        ? t('ddsPage.saved_trust', { tx: created.txNumber, balance: formatMoney(created.trust.balance) })
        : t('ddsPage.saved', { tx: created?.txNumber || '' }),
    });
    if (created?.categoryName) setCategories((prev) => Array.from(new Set([...prev, created.categoryName])));
    fetchDdsData(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await axios.delete(`/api/dds/${deleteTarget.id}`);
      if (res.data?.balances) setBalances(res.data.balances);
      setTransactions((prev) => prev.filter((tx) => tx.id !== deleteTarget.id));
      setNotice({ tone: 'success', text: t('ddsPage.deleted', { tx: deleteTarget.txNumber }) });
      setDeleteTarget(null);
      fetchDdsData(true);
    } catch (err) {
      setDeleteError(apiErrorMessage(err, t('common.delete_error')));
    } finally {
      setDeleting(false);
    }
  };

  const handleClearAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clearing || !clearCode) return;
    setClearing(true);
    setClearError(null);
    try {
      // Kod serverda tekshiriladi; faqat ADMIN roli bajara oladi
      const res = await axios.delete('/api/dds/all', { data: { confirmCode: clearCode } });
      if (res.data?.balances) setBalances(res.data.balances);
      setClearOpen(false);
      setClearCode('');
      setNotice({ tone: 'success', text: t('ddsPage.cleared') });
      fetchDdsData(true);
    } catch (err) {
      setClearError(apiErrorMessage(err, t('ddsPage.clear_error')));
    } finally {
      setClearing(false);
    }
  };

  const resetFilters = () => {
    setTypeFilter('');
    setAccountFilter('');
    setSourceFilter('');
    setSearchInput('');
    setSearch('');
  };

  // Joriy filtr bo'yicha ko'rsatilgan yozuvlar aylanmasi
  const totalCount = transactions.length;
  const filteredIncome = transactions.filter((tx) => tx.type === 'INCOME').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const filteredExpense = transactions.filter((tx) => tx.type === 'EXPENSE').reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const filteredNetFlow = filteredIncome - filteredExpense;
  const avgCheck = totalCount > 0 ? Math.round((filteredIncome + filteredExpense) / totalCount) : 0;

  const hasFilters = !!(typeFilter || accountFilter || sourceFilter || searchInput);
  const colCount = canDelete ? 10 : 9;
  const breakdown: any[] = summary?.categoriesBreakdown || [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={<ArrowDownUp />}
        title={t('ddsPage.title')}
        description={t('ddsPage.subtitle')}
        actions={
          <>
            {canSync && (
              <Button
                variant="secondary"
                onClick={handleSyncDdsFromSheets}
                loading={syncingDds}
                leftIcon={<RefreshCw className="h-4 w-4" />}
                title={t('ddsPage.sync_hint')}
              >
                {t('ddsPage.sync')}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => setShowCategoryBreakdown((v) => !v)}
              aria-expanded={showCategoryBreakdown}
              leftIcon={<PieChart className="h-4 w-4" />}
              rightIcon={showCategoryBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            >
              {t('ddsPage.breakdown')}
            </Button>
            {isAdmin && (
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => {
                  setClearCode('');
                  setClearError(null);
                  setClearOpen(true);
                }}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                {t('ddsPage.clear_all')}
              </Button>
            )}
            {canWrite && (
              <Button onClick={() => setIsFormOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
                {t('ddsPage.add')}
              </Button>
            )}
          </>
        }
      />

      {notice && (
        <div
          role={notice.tone === 'danger' ? 'alert' : 'status'}
          className={cn(
            'flex items-start gap-2.5 rounded-card border border-line px-4 py-3 text-sm',
            notice.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
          )}
        >
          {notice.tone === 'danger' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p className="min-w-0 flex-1">{notice.text}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('common.close')}
            className="-my-1.5 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-control hover:bg-surface/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hisob qoldiqlari — AccountBalance (haqiqiy joriy qoldiq, filtrga bog'liq emas) */}
      <section aria-label={t('ddsPage.balances_title')} className="space-y-2">
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <StatCard title={t('ddsPage.balance_cash')} value={formatMoney(balances?.CASH)} icon={<Wallet />} tone="info" />
          <StatCard title={t('ddsPage.balance_card')} value={formatMoney(balances?.BANK_CARD)} icon={<CreditCard />} tone="violet" />
          <StatCard title={t('ddsPage.balance_settlement')} value={formatMoney(balances?.SETTLEMENT_ACCOUNT)} icon={<Building />} tone="brand" />
          <StatCard
            title={t('ddsPage.balance_total')}
            value={formatMoney(balances?.total)}
            icon={<Scale />}
            tone="success"
            className="border-line-strong"
          />
        </div>
        {summary && summary.balancesInSync === false && (
          <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('ddsPage.balances_drift', { diff: formatMoney(summary.balanceDrift?.total) })}</span>
          </p>
        )}
      </section>

      {/* Ko'rsatilgan yozuvlar aylanmasi */}
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard title={t('ddsPage.flow_income')} value={formatMoney(filteredIncome)} tone="success" icon={<ArrowDownLeft />} />
        <StatCard title={t('ddsPage.flow_expense')} value={formatMoney(filteredExpense)} tone="danger" icon={<ArrowUpRight />} />
        <StatCard
          title={t('ddsPage.flow_net')}
          value={formatMoney(filteredNetFlow)}
          tone={filteredNetFlow < 0 ? 'danger' : 'brand'}
          hint={t('ddsPage.flow_net_hint')}
          icon={<ArrowDownUp />}
        />
        <StatCard
          title={t('ddsPage.flow_count')}
          value={formatNumber(totalCount)}
          hint={t('ddsPage.flow_avg', { value: formatMoney(avgCheck) })}
          icon={<Layers />}
          tone="violet"
        />
      </div>

      {showCategoryBreakdown && (
        <Card>
          <CardHeader title={t('ddsPage.breakdown_title')} description={t('ddsPage.breakdown_count', { count: breakdown.length })} />
          {breakdown.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('ddsPage.breakdown_empty')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {breakdown.map((cat) => (
                <div key={cat.categoryName} className="rounded-control border border-line bg-surface-2 p-3">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium text-fg" title={cat.categoryName}>
                      {cat.categoryName}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-fg">{formatMoney(cat.amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-fg-muted">
                    <span>{cat.expenseType ? t(`ddsPage.class_${cat.expenseType}`) : cat.classification}</span>
                    <span className="tabular-nums">{formatPercent(cat.sharePct)}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface" aria-hidden="true">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (cat.sharePct || 0) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card padding="none">
        {/* Qidiruv va filtrlar */}
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('ddsPage.search_placeholder')}
              aria-label={t('ddsPage.search_placeholder')}
              leftIcon={<Search />}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3 lg:flex lg:w-auto">
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label={t('common.type')} className="lg:w-40">
              <option value="">{t('ddsPage.filter_all_types')}</option>
              <option value="INCOME">{t('common.income')}</option>
              <option value="EXPENSE">{t('common.expense')}</option>
            </Select>
            <Select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              aria-label={t('accounts.label')}
              className="lg:w-44"
            >
              <option value="">{t('ddsPage.filter_all_accounts')}</option>
              {DDS_ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {t(`accounts.${a}`)}
                </option>
              ))}
            </Select>
            <Select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              aria-label={t('ddsPage.col_source')}
              className="lg:w-40"
            >
              <option value="">{t('ddsPage.filter_all_sources')}</option>
              {DDS_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`ddsPage.source_${s}`)}
                </option>
              ))}
            </Select>
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={resetFilters} leftIcon={<X className="h-4 w-4" />}>
              {t('common.clear_filter')}
            </Button>
          )}
        </div>

        {loading && transactions.length === 0 && !loadError ? (
          <LoadingBlock label={t('common.loading')} />
        ) : loadError ? (
          <EmptyState
            icon={<AlertCircle />}
            title={t('common.load_error')}
            description={loadError}
            action={
              <Button variant="secondary" onClick={() => fetchDdsData()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : (
          <TableContainer bare maxHeightClass="max-h-[70vh]">
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('ddsPage.col_tx')}</Th>
                  <Th>{t('ddsPage.col_datetime')}</Th>
                  <Th>{t('common.type')}</Th>
                  <Th>{t('accounts.label')}</Th>
                  <Th>{t('common.category')}</Th>
                  <Th>{t('ddsPage.col_source')}</Th>
                  <Th>{t('ddsPage.col_person')}</Th>
                  <Th align="right">{t('common.amount')}</Th>
                  <Th>{t('common.comment')}</Th>
                  {canDelete && <Th align="center">{t('common.actions')}</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {transactions.length === 0 && (
                  <TableEmpty
                    colSpan={colCount}
                    icon={<ArrowDownUp />}
                    title={hasFilters ? t('ddsPage.empty_filtered') : t('ddsPage.empty')}
                    description={!hasFilters && canWrite ? t('ddsPage.empty_hint') : undefined}
                  />
                )}
                {transactions.map((tx) => {
                  const isIncome = tx.type === 'INCOME';
                  const source = (tx.source || 'MANUAL') as DdsSource;
                  return (
                    <Tr key={tx.id}>
                      <Td numeric className="font-medium text-fg-secondary">
                        {tx.txNumber}
                      </Td>
                      <Td numeric className="text-fg-secondary">
                        {tx.dateTimeLabel || formatDateTime(tx.dateTime)}
                      </Td>
                      <Td>
                        <Badge tone={isIncome ? 'success' : 'danger'} size="sm">
                          {isIncome ? t('common.income') : t('common.expense')}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap">{t(`accounts.${tx.account}`)}</Td>
                      <Td className="whitespace-nowrap font-medium">{tx.categoryName}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <Badge tone={SOURCE_TONE[source] || 'neutral'} size="sm">
                            {t(`ddsPage.source_${source}`)}
                          </Badge>
                          {tx.deal && (
                            <span className="text-xs tabular-nums text-fg-muted">{t('ddsPage.deal_no', { number: tx.deal.dealNumber })}</span>
                          )}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-fg-secondary">{tx.sourcePerson || '-'}</Td>
                      <Td align="right" numeric className={cn('font-semibold', isIncome ? 'text-success' : 'text-fg')}>
                        {isIncome ? '+' : '−'}
                        {formatMoney(tx.amount)}
                      </Td>
                      <Td className="max-w-[18rem] text-fg-muted">
                        <span className="block truncate" title={tx.description || ''}>
                          {tx.description || '-'}
                        </span>
                      </Td>
                      {canDelete && (
                        <Td align="center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-danger hover:bg-danger-soft hover:text-danger"
                            aria-label={t('ddsPage.delete_aria', { tx: tx.txNumber })}
                            title={t('common.delete')}
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteTarget(tx);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>
        )}

        {!loadError && totalCount > 0 && (
          <p className="border-t border-line px-4 py-2.5 text-xs tabular-nums text-fg-muted sm:px-5">
            {totalOnServer > totalCount
              ? t('ddsPage.rows_partial', { shown: formatNumber(totalCount), total: formatNumber(totalOnServer) })
              : t('ddsPage.rows', { count: formatNumber(totalCount) })}
          </p>
        )}
      </Card>

      <DdsFormModal
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        categories={categories}
        defaultPerson={user?.fullName || ''}
        onSaved={handleCreated}
      />

      {/* O'chirishni tasdiqlash */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        closeOnBackdrop={!deleting}
        size="sm"
        title={t('ddsPage.delete_title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-3 text-sm">
            <p className="text-fg-secondary">{t('ddsPage.delete_text')}</p>
            <dl className="rounded-control border border-line bg-surface-2 px-3 py-2.5">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-muted">{deleteTarget.txNumber}</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {deleteTarget.type === 'INCOME' ? '+' : '−'}
                  {formatMoney(deleteTarget.amount)}
                </dd>
              </div>
              <div className="mt-1 text-xs text-fg-muted">
                {deleteTarget.categoryName}, {t(`accounts.${deleteTarget.account}`)}
              </div>
            </dl>
            {deleteTarget.source === 'TRUST_PAYMENT' && (
              <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t('ddsPage.delete_trust_note')}</span>
              </p>
            )}
            {deleteError && (
              <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                {deleteError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Hammasini tozalash (faqat ADMIN + tasdiqlash kodi) */}
      <Modal
        open={clearOpen}
        onClose={() => !clearing && setClearOpen(false)}
        closeOnBackdrop={!clearing}
        size="sm"
        title={t('ddsPage.clear_title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setClearOpen(false)} disabled={clearing}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" type="submit" form="dds-clear-form" loading={clearing} disabled={!clearCode}>
              {t('ddsPage.clear_confirm')}
            </Button>
          </>
        }
      >
        <form id="dds-clear-form" onSubmit={handleClearAll} className="space-y-3">
          <p className="text-sm text-fg-secondary">{t('ddsPage.clear_text')}</p>
          <Field label={t('ddsPage.clear_code')} htmlFor="dds-clear-code" error={clearError} required>
            <Input
              id="dds-clear-code"
              type="password"
              autoComplete="off"
              autoFocus
              value={clearCode}
              onChange={(e) => setClearCode(e.target.value)}
              invalid={!!clearError}
              disabled={clearing}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
};
export default DdsPage;
