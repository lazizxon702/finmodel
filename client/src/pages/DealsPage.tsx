import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  BadgePercent,
  Coins,
  Hash,
  Info,
  Layers,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { Agency, Deal, Provider, Store } from '../types';
import { addDaysYmd, formatMoney, formatPercent, todayYmd } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/SocketContext';
import {
  Button,
  Card,
  DateRangeFilter,
  Input,
  PageHeader,
  Select,
  StatCard,
  Tabs,
  cn,
  defaultDateRange,
  type DateRangeValue,
} from '../components/ui';
import { DealsTable } from '../components/deals/DealsTable';
import { DealsSummary } from '../components/deals/DealsSummary';
import { DealFormModal, type DealPrefill } from '../components/deals/DealFormModal';
import { DealDetailModal } from '../components/deals/DealDetailModal';
import { ApproveDealModal, DeleteDealModal, ExpenseDealModal, RejectDealModal } from '../components/deals/DealActionModals';
import { SheetsSyncModal } from '../components/deals/SheetsSyncModal';
import { DEAL_STATUSES, apiError, isRegistratura, isScopedRole, type ApprovalFilter, type Notice } from '../components/deals/dealUtils';

const PAGE_SIZE = 50;

const NOTICE_TONE: Record<Notice['tone'], string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export const DealsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role;
  const scoped = isScopedRole(role);
  // Registratura: chek qo'shadi, lekin hech qaysi bitimni tahrirlay/o'chira olmaydi
  const registratura = isRegistratura(role);
  const canSync = role === 'ADMIN' || role === 'MANAGER';
  // Kuzatuvchi (VIEWER) bitimlarni faqat ko'radi — yangi bitim tugmasi ko'rsatilmaydi
  const canCreate = role !== 'VIEWER';

  // --- Ma'lumotlar ---
  const [deals, setDeals] = useState<Deal[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [listTotal, setListTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pending, setPending] = useState({ count: 0, rejectedCount: 0 });
  const [loading, setLoading] = useState(true);

  // --- Spravochniklar ---
  const [stores, setStores] = useState<Store[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [refsLoaded, setRefsLoaded] = useState(false);

  // --- Filtrlar ---
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [daftarFilter, setDaftarFilter] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');
  const [range, setRange] = useState<DateRangeValue>(() => defaultDateRange('all'));
  const [page, setPage] = useState(1);

  // --- Oynalar ---
  const [form, setForm] = useState<{ deal: Deal | null; prefill?: DealPrefill | null } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Deal | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Deal | null>(null);
  const [expenseTarget, setExpenseTarget] = useState<Deal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);
  const [syncSettingsOpen, setSyncSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [notice, setNotice] = useState<Notice | null>(null);

  // Muvaffaqiyat xabari o'zi yopiladi; xato va ogohlantirish foydalanuvchi yopguncha turadi
  useEffect(() => {
    if (!notice || notice.tone !== 'success') return;
    const id = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Qidiruv: har harfda emas, yozish to'xtagach so'rov yuboriladi
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  // ---------------------------------------------------------------------------
  // Yuklash
  // ---------------------------------------------------------------------------
  const requestSeq = useRef(0);

  /** Ro'yxat + yig'ma raqamlar + kutayotganlar soni. silent — spinnersiz (fon yangilanishi). */
  const loadAll = async (silent = false) => {
    const seq = ++requestSeq.current;
    if (!silent) setLoading(true);

    const filters = {
      search: search || undefined,
      status: statusFilter || undefined,
      providerId: providerFilter || undefined,
      storeId: storeFilter || undefined,
      daftar: daftarFilter || undefined,
      startDate: range.startDate || undefined,
      endDate: range.endDate || undefined,
    };

    const [dealsRes, totalsRes, pendingRes] = await Promise.allSettled([
      axios.get('/api/deals', { params: { ...filters, approvalStatus: approvalFilter, page, limit: PAGE_SIZE } }),
      axios.get('/api/deals/totals', { params: filters }),
      axios.get('/api/deals/pending-count'),
    ]);
    if (seq !== requestSeq.current) return; // eskirgan javob — yangiroq so'rov ketgan

    if (dealsRes.status === 'fulfilled') {
      setDeals(dealsRes.value.data?.deals || []);
      setListTotal(dealsRes.value.data?.pagination?.total || 0);
      setTotalPages(Math.max(1, dealsRes.value.data?.pagination?.totalPages || 1));
    } else if (!silent) {
      setNotice({ tone: 'danger', text: apiError(dealsRes.reason, t) });
    }
    if (totalsRes.status === 'fulfilled') setTotals(totalsRes.value.data);
    if (pendingRes.status === 'fulfilled') {
      setPending({
        count: Number(pendingRes.value.data?.count) || 0,
        rejectedCount: Number(pendingRes.value.data?.rejectedCount) || 0,
      });
    }
    setLoading(false);
  };

  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, providerFilter, storeFilter, daftarFilter, approvalFilter, range.startDate, range.endDate, page]);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, pRes, aRes] = await Promise.all([
          axios.get('/api/references/stores'),
          axios.get('/api/references/providers'),
          axios.get('/api/references/agencies'),
        ]);
        setStores(sRes.data || []);
        setProviders(pRes.data || []);
        setAgencies(aRes.data || []);
      } catch (err) {
        setNotice({ tone: 'danger', text: apiError(err, t) });
      } finally {
        setRefsLoaded(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lead sahifasidan "bitim ochish" bilan kelinganda forma tayyor qiymatlar bilan ochiladi
  const leadPrefill: DealPrefill | undefined = (location.state as any)?.newDealFromLead;
  useEffect(() => {
    if (leadPrefill && refsLoaded) setForm({ deal: null, prefill: leadPrefill });
  }, [leadPrefill, refsLoaded]);

  // ---------------------------------------------------------------------------
  // Real vaqt: boshqalar o'zgartirsa ro'yxat va raqamlar o'zi yangilanadi (debounce bilan).
  // O'z amalimizdan keyin sahifa darhol qayta yuklanadi, shuning uchun o'sha amalning
  // serverdan qaytgan hodisasi ikkinchi marta yuklamaydi.
  // ---------------------------------------------------------------------------
  const mutationOpen = Boolean(form || approveTarget || rejectTarget || expenseTarget || deleteTarget || syncing);
  const mutationOpenRef = useRef(mutationOpen);
  mutationOpenRef.current = mutationOpen;
  const deferredRef = useRef(false);
  const ownUntilRef = useRef(0);
  const debounceRef = useRef<number | undefined>(undefined);

  const scheduleReload = () => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => loadAllRef.current(true), 500);
  };

  useRealtime('deals:updated', () => {
    if (mutationOpenRef.current) {
      // Amal oynasi ochiq: hodisa (ko'pincha o'zimizniki) oyna yopilgach hisobga olinadi
      deferredRef.current = true;
      return;
    }
    if (Date.now() < ownUntilRef.current) return;
    scheduleReload();
  });

  useEffect(() => {
    if (mutationOpen || !deferredRef.current) return;
    deferredRef.current = false;
    if (Date.now() >= ownUntilRef.current) scheduleReload();
  }, [mutationOpen]);

  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  /** O'z amalimizdan keyingi yagona qayta yuklash */
  const refreshAfterOwn = () => {
    deferredRef.current = false;
    ownUntilRef.current = Date.now() + 1500;
    window.clearTimeout(debounceRef.current);
    loadAll(true);
  };

  // ---------------------------------------------------------------------------
  // Amallar
  // ---------------------------------------------------------------------------
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await axios.post('/api/sync/google-sheets');
      setNotice({
        tone: 'success',
        text: t('dealsPage.sync_done', { count: res.data?.count ?? 0, range: res.data?.dateRange || '—' }),
      });
      refreshAfterOwn();
    } catch (err) {
      setNotice({ tone: 'danger', text: apiError(err, t) });
    } finally {
      setSyncing(false);
    }
  };

  const handleSaved = (saved: any, isEdit: boolean) => {
    setForm(null);
    const number = saved?.dealNumber ?? '';
    const parts: string[] = [];
    let tone: Notice['tone'] = 'success';
    if (saved?.approvalStatus === 'PENDING_APPROVAL') {
      tone = 'info';
      parts.push(t('dealsPage.saved_pending', { number }));
    } else {
      parts.push(t(isEdit ? 'dealsPage.saved_edit' : 'dealsPage.saved_new', { number }));
    }
    const check = saved?.checkExpenseResult;
    if (check?.created) parts.push(t('dealsPage.saved_expense_written'));
    else if (check?.skippedReason) {
      tone = 'warning';
      parts.push(String(check.skippedReason));
    }
    setNotice({ tone, text: parts.join(' ') });
    refreshAfterOwn();
  };

  const openCreate = () => setForm({ deal: null });
  const openEdit = (deal: Deal) => {
    if (registratura) return; // tugma ko'rinmaydi; bu — ikkinchi himoya
    setDetailId(null);
    setForm({ deal });
  };
  const openDelete = (deal: Deal) => {
    if (registratura) return;
    setDeleteTarget(deal);
  };

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setProviderFilter('');
    setStoreFilter('');
    setDaftarFilter('');
    setApprovalFilter('all');
    setRange(defaultDateRange('all'));
    setPage(1);
  };

  /** Filtr o'zgarganda birinchi sahifaga qaytamiz */
  const withPageReset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  const filtered = Boolean(
    search || statusFilter || providerFilter || storeFilter || daftarFilter || approvalFilter !== 'all' || range.startDate || range.endDate
  );

  const yesterday = addDaysYmd(todayYmd(), -1);
  const isYesterday = range.mode === 'custom' && range.startDate === yesterday && range.endDate === yesterday;

  const detailDeal = detailId ? deals.find((d) => d.id === detailId) || null : null;

  // --- Yig'ma ko'rsatkichlar (server faqat tasdiqlangan bitimlarni hisoblaydi) ---
  const approvedOnPage = deals.filter((d) => (d.approvalStatus || 'APPROVED') === 'APPROVED');
  const kpiAvgDiscount =
    totals?.avgDiscountPct ??
    (approvedOnPage.length > 0
      ? approvedOnPage.reduce((s, d) => s + (Number(d.purchaseDiscountPct) || 0), 0) / approvedOnPage.length
      : 0);

  const approvalTabs: { value: ApprovalFilter; label: string; count?: number }[] = [
    { value: 'all', label: t('common.all') },
    { value: 'PENDING_APPROVAL', label: t('approval.PENDING_APPROVAL'), count: pending.count },
    { value: 'APPROVED', label: t('approval.APPROVED') },
    { value: 'REJECTED', label: t('approval.REJECTED'), count: pending.rejectedCount },
  ];

  return (
    <div className="w-full space-y-5 sm:space-y-6">
      <PageHeader
        className="mb-0 sm:mb-0"
        icon={<Layers />}
        title={t('deals.title')}
        description={t('deals.subtitle')}
        actions={
          <>
            {canSync && (
              <Button
                variant="secondary"
                loading={syncing}
                leftIcon={<RefreshCw className="h-4 w-4" />}
                title={t('dealsPage.sync_button_title')}
                onClick={handleSync}
              >
                {syncing ? t('dealsPage.sync_running') : t('dealsPage.sync_button')}
              </Button>
            )}
            {role === 'ADMIN' && (
              <Button
                variant="secondary"
                size="icon"
                aria-label={t('dealsPage.sync_settings_title')}
                title={t('dealsPage.sync_settings_title')}
                onClick={() => setSyncSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
            {canCreate && (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate} disabled={!refsLoaded}>
              {t('deals.add_deal')}
            </Button>
            )}
          </>
        }
      />

      {scoped && (
        <div className="flex items-start gap-2 rounded-card bg-info-soft px-4 py-3 text-sm text-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t(registratura ? 'dealsPage.registratura_notice' : 'dealsPage.scoped_notice')}</p>
        </div>
      )}

      {notice && (
        <div
          role={notice.tone === 'danger' ? 'alert' : 'status'}
          className={cn('flex items-start justify-between gap-3 rounded-card px-4 py-3 text-sm', NOTICE_TONE[notice.tone])}
        >
          <p className="min-w-0 break-words">{notice.text}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('common.close')}
            className="-my-1 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-control hover:bg-surface/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Yig'ma ko'rsatkichlar: bitta panel */}
      <DealsSummary totals={totals} avgDiscount={kpiAvgDiscount} scoped={scoped} hideAgent={registratura} />

      {/* Filtrlar */}
      <Card className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            type="search"
            leftIcon={<Search />}
            placeholder={t('dealsPage.search_placeholder')}
            aria-label={t('dealsPage.search_placeholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Select aria-label={t('common.status')} value={statusFilter} onChange={(e) => withPageReset(setStatusFilter)(e.target.value)}>
            <option value="">{t('common.all_statuses')}</option>
            {DEAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`dealStatus.${s}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t('common.provider')} value={providerFilter} onChange={(e) => withPageReset(setProviderFilter)(e.target.value)}>
            <option value="">{t('common.all_providers')}</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select aria-label={t('common.store')} value={storeFilter} onChange={(e) => withPageReset(setStoreFilter)(e.target.value)}>
            <option value="">{t('common.all_stores')}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select aria-label={t('dealsPage.daftar')} value={daftarFilter} onChange={(e) => withPageReset(setDaftarFilter)(e.target.value)}>
            <option value="">{t('dealsPage.daftar_all')}</option>
            <option value="true">{t('dealsPage.daftar_only')}</option>
            <option value="false">{t('dealsPage.daftar_none')}</option>
          </Select>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <DateRangeFilter value={range} onChange={withPageReset(setRange)} />
            <Button
              variant={isYesterday ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={isYesterday}
              onClick={() => withPageReset(setRange)({ mode: 'custom', startDate: yesterday, endDate: yesterday })}
            >
              {t('period.yesterday')}
            </Button>
          </div>
          {filtered && (
            <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={resetFilters}>
              {t('common.clear_filter')}
            </Button>
          )}
        </div>
      </Card>

      {/* Ro'yxat */}
      <Card padding="none" className="overflow-hidden">
        <Tabs
          ariaLabel={t('approval.label')}
          items={approvalTabs}
          value={approvalFilter}
          onChange={withPageReset(setApprovalFilter)}
          className="px-2 sm:px-3"
        />

        <DealsTable
          deals={deals}
          loading={loading}
          totals={totals}
          role={role}
          filtered={filtered}
          onCreate={openCreate}
          onView={(d) => setDetailId(d.id)}
          onEdit={openEdit}
          onDelete={openDelete}
          onApprove={setApproveTarget}
          onReject={setRejectTarget}
          onExpense={setExpenseTarget}
        />

        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span className="tabular-nums">{t('dealsPage.list_total', { count: listTotal })}</span>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t('dealsPage.page_prev')}
            </Button>
            <span className="tabular-nums">{t('dealsPage.page_of', { page, total: totalPages })}</span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              {t('dealsPage.page_next')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Oynalar */}
      {detailDeal && (
        <DealDetailModal
          deal={detailDeal}
          role={role}
          onClose={() => setDetailId(null)}
          onEdit={openEdit}
          onApprove={setApproveTarget}
          onReject={setRejectTarget}
          onExpense={setExpenseTarget}
          onDelete={openDelete}
        />
      )}

      {form && !(registratura && form.deal) && (
        <DealFormModal
          key={form.deal?.id || 'new'}
          deal={form.deal}
          prefill={form.prefill}
          stores={stores}
          providers={providers}
          agencies={agencies}
          role={role}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
        />
      )}

      {approveTarget && (
        <ApproveDealModal key={approveTarget.id} deal={approveTarget} onClose={() => setApproveTarget(null)} onApproved={refreshAfterOwn} />
      )}

      {rejectTarget && (
        <RejectDealModal
          key={rejectTarget.id}
          deal={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={() => {
            setNotice({ tone: 'success', text: t('dealsPage.reject_done', { number: rejectTarget.dealNumber }) });
            setRejectTarget(null);
            refreshAfterOwn();
          }}
        />
      )}

      {expenseTarget && (
        <ExpenseDealModal key={expenseTarget.id} deal={expenseTarget} onClose={() => setExpenseTarget(null)} onDone={refreshAfterOwn} />
      )}

      {deleteTarget && (
        <DeleteDealModal
          key={deleteTarget.id}
          deal={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setNotice({ tone: 'success', text: t('dealsPage.delete_done', { number: deleteTarget.dealNumber }) });
            setDeleteTarget(null);
            setDetailId(null);
            refreshAfterOwn();
          }}
        />
      )}

      {syncSettingsOpen && <SheetsSyncModal onClose={() => setSyncSettingsOpen(false)} onSyncNow={handleSync} syncing={syncing} />}
    </div>
  );
};
export default DealsPage;
