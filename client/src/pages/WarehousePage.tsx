import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Search,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRightLeft,
  FileCheck2,
  Warehouse,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import { formatMoney, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { Store } from '../types';
import {
  Button, Card, Modal, PageHeader, StatCard, Badge, Field, Input, Select, Textarea,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, LoadingBlock, SegmentedControl, cn,
} from '../components/ui';
import type { Tone } from '../components/ui/StatCard';

// Belgilash katagi (checkbox) uchun umumiy klass
const checkboxClass = 'h-4 w-4 shrink-0 rounded border-line-strong accent-brand';

// Ombor holati -> Badge rangi
const STATUS_TONE: Record<string, Tone> = {
  IN_WAREHOUSE: 'success',
  IN_TRANSIT: 'info',
  PENDING: 'warning',
  NEED_TO_BUY: 'danger',
  PARTIAL_AMOUNT: 'info',
  MONEY_RECEIVED: 'success',
  SOLD: 'neutral',
};

export const WarehousePage: React.FC = () => {
  const { t } = useTranslation();

  const [items, setItems] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [daftarFilter, setDaftarFilter] = useState<'ALL' | 'DAFTAR' | 'STANDARD'>('ALL');

  // Skaner / prixod oynasi
  const [scanModalItem, setScanModalItem] = useState<any | null>(null);

  // Holatni o'zgartirish oynasi (sabab majburiy)
  const [statusEditItem, setStatusEditItem] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState('IN_WAREHOUSE');
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Filiallararo ko'chirish
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedForTransfer, setSelectedForTransfer] = useState<string[]>([]);
  const [targetStoreId, setTargetStoreId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Tezkor inventarizatsiya (audit)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditScannedImeis, setAuditScannedImeis] = useState<string[]>([]);
  const [auditInputImei, setAuditInputImei] = useState('');

  useEffect(() => {
    fetchInventory();
    fetchStores();
  }, [search, statusFilter]);

  const fetchStores = async () => {
    try {
      const res = await axios.get('/api/references/stores');
      setStores(res.data || []);
      if (res.data?.length > 0 && !targetStoreId) {
        setTargetStoreId(res.data[0].id);
      }
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const fetchInventory = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      // Ombor ko'rinishi: holat filtri bo'lmasa sotilmaganlar ko'rsatiladi
      if (statusFilter) {
        params.append('status', statusFilter);
      }
      params.append('limit', '1000');
      const res = await axios.get(`/api/inventory?${params.toString()}`);
      // Aniq filtr bo'lmasa SOLD ombor ko'rinishidan chiqariladi
      const allItems = res.data.items || [];
      if (!statusFilter) {
        setItems(allItems.filter((it: any) => it.status !== 'SOLD'));
      } else {
        setItems(allItems);
      }
    } catch (err: any) {
      console.error('Fetch inventory error:', err);
      setLoadError(err.response?.data?.error || t('common.load_error'));
    } finally {
      setLoading(false);
    }
  };

  // Do'kon va daftar rejimi bo'yicha filtr
  const filteredItems = items.filter((it) => {
    if (storeFilter && it.storeId !== storeFilter && it.storeName !== storeFilter) return false;
    if (daftarFilter === 'DAFTAR' && !it.isDaftar) return false;
    if (daftarFilter === 'STANDARD' && it.isDaftar) return false;
    return true;
  });

  // Faol filtrlangan tovarlar bo'yicha KPI
  const totalItemsCount = filteredItems.length;
  const totalWarehouseCost = filteredItems.reduce((sum, it) => sum + (Number(it.purchaseCost) || 0), 0);
  const inWarehouseCount = filteredItems.filter((it) => it.status === 'IN_WAREHOUSE').length;
  const inTransitCount = filteredItems.filter((it) => it.status === 'IN_TRANSIT').length;
  const pendingCount = filteredItems.filter((it) => it.status === 'PENDING').length;
  const needToBuyCount = filteredItems.filter((it) => it.status === 'NEED_TO_BUY' || it.status === 'PARTIAL_AMOUNT').length;

  // Daftar bo'yicha tahlil
  const daftarItems = items.filter((it) => it.isDaftar);
  const totalDaftarCount = daftarItems.length;
  const daftarInWarehouseCount = daftarItems.filter((it) => it.status === 'IN_WAREHOUSE').length;
  const daftarNeedToBuyCount = daftarItems.filter((it) => it.status === 'NEED_TO_BUY' || it.status === 'PARTIAL_AMOUNT').length;
  const daftarTotalCost = daftarItems.reduce((sum, it) => sum + (Number(it.purchaseCost) || 0), 0);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusEditItem) return;
    if (!statusReason.trim()) {
      alert(t('warehouse.statusModal.reasonRequired'));
      return;
    }

    try {
      setStatusSubmitting(true);
      await axios.put(`/api/inventory/${statusEditItem.id}/status`, {
        status: newStatus,
        reason: statusReason.trim(),
      });
      setStatusEditItem(null);
      setStatusReason('');
      fetchInventory();
    } catch (err: any) {
      alert(`${t('common.error')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedForTransfer.length === 0) {
      alert(t('warehouse.transferModal.pickItem'));
      return;
    }
    if (!targetStoreId) {
      alert(t('warehouse.transferModal.pickStore'));
      return;
    }

    try {
      setTransferring(true);
      await axios.post('/api/inventory/transfer', {
        dealIds: selectedForTransfer,
        targetStoreId,
        reason: transferReason.trim() || t('warehouse.transferModal.defaultReason'),
      });
      setIsTransferModalOpen(false);
      setSelectedForTransfer([]);
      setTransferReason('');
      fetchInventory();
      alert(t('warehouse.transferModal.done'));
    } catch (err: any) {
      alert(`${t('common.error')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setTransferring(false);
    }
  };

  const handleAcceptTransfer = async (dealId: string, currentStoreId?: string) => {
    if (!window.confirm(t('warehouse.acceptConfirm'))) return;
    try {
      await axios.post('/api/inventory/transfer/accept', {
        dealId,
        receivedStoreId: currentStoreId,
      });
      fetchInventory();
      alert(t('warehouse.acceptDone'));
    } catch (err: any) {
      alert(`${t('common.error')}: ${err.response?.data?.error || err.message}`);
    }
  };

  const renderStatusPill = (status: string) => (
    <Badge tone={STATUS_TONE[status] || 'neutral'} size="sm">
      {STATUS_TONE[status] ? t(`dealStatus.${status}`) : status}
    </Badge>
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        icon={<Warehouse className="h-5 w-5" />}
        title={t('warehouse.title')}
        description={t('warehouse.subtitle')}
        actions={
          <>
            <Button variant="secondary" leftIcon={<ArrowRightLeft className="h-4 w-4" />} onClick={() => setIsTransferModalOpen(true)}>
              {t('warehouse.transfer')}
            </Button>
            <Button leftIcon={<FileCheck2 className="h-4 w-4" />} onClick={() => setIsAuditModalOpen(true)}>
              {t('warehouse.audit')}
            </Button>
          </>
        }
      />

      {loadError && (
        <div role="alert" className="rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      {/* Real vaqt KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        <StatCard
          title={t('warehouse.kpi.balance')}
          value={<span className="text-base sm:text-lg">{formatMoney(totalWarehouseCost)}</span>}
          hint={t('warehouse.kpi.balanceHint')}
        />
        <StatCard
          title={t('warehouse.kpi.count')}
          value={t('common.items_count', { count: totalItemsCount })}
          hint={t('warehouse.kpi.countHint')}
        />
        <StatCard
          title={t('warehouse.kpi.ready')}
          value={t('common.items_count', { count: inWarehouseCount })}
          hint={t('warehouse.kpi.readyHint')}
          tone="success"
        />
        <StatCard
          title={t('warehouse.kpi.transit')}
          value={t('common.items_count', { count: inTransitCount })}
          hint={t('warehouse.kpi.transitHint')}
          tone="info"
        />
        <StatCard
          title={t('warehouse.kpi.pending')}
          value={t('common.items_count', { count: pendingCount + needToBuyCount })}
          hint={t('warehouse.kpi.pendingHint')}
          tone="warning"
        />
        <StatCard
          title={t('warehouse.kpi.daftar')}
          value={t('common.items_count', { count: totalDaftarCount })}
          hint={formatMoney(daftarTotalCost)}
          tone="warning"
          icon={<BookOpen className="h-4 w-4" />}
          active={daftarFilter === 'DAFTAR'}
          onClick={() => setDaftarFilter(daftarFilter === 'DAFTAR' ? 'ALL' : 'DAFTAR')}
         
        />
      </div>

      {/* Daftar tezkor filtrlari */}
      <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            value={daftarFilter}
            onChange={(v) => setDaftarFilter(v as 'ALL' | 'DAFTAR' | 'STANDARD')}
            items={[
              { value: 'ALL', label: t('warehouse.tab.all'), count: items.length },
              { value: 'DAFTAR', label: t('warehouse.tab.daftar'), icon: <BookOpen className="h-3.5 w-3.5" />, count: totalDaftarCount },
              { value: 'STANDARD', label: t('warehouse.tab.standard'), count: items.length - totalDaftarCount },
            ]}
          />
        </div>

        {daftarFilter === 'DAFTAR' && (
          <Badge tone="warning" className="tabular-nums">
            {t('warehouse.daftarStats', { ready: daftarInWarehouseCount, buy: daftarNeedToBuyCount })}
          </Badge>
        )}
      </Card>

      {/* Qidiruv va filtrlar */}
      <Card padding="sm" className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            type="text"
            leftIcon={<Search />}
            placeholder={t('warehouse.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="sm:w-48">
            <option value="">{t('warehouse.allStores')}</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>

          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-52">
            <option value="">{t('warehouse.allStatuses')}</option>
            <option value="IN_WAREHOUSE">{t('dealStatus.IN_WAREHOUSE')}</option>
            <option value="IN_TRANSIT">{t('dealStatus.IN_TRANSIT')}</option>
            <option value="PENDING">{t('dealStatus.PENDING')}</option>
            <option value="NEED_TO_BUY">{t('dealStatus.NEED_TO_BUY')}</option>
            <option value="PARTIAL_AMOUNT">{t('dealStatus.PARTIAL_AMOUNT')}</option>
            <option value="MONEY_RECEIVED">{t('dealStatus.MONEY_RECEIVED')}</option>
          </Select>

          <Button
            variant="secondary"
            size="icon"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setStoreFilter('');
            }}
            title={t('common.clear_filter')}
            aria-label={t('common.clear_filter')}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* Ombor jadvali */}
      <Card padding="none">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-fg-muted lg:hidden">
          <span>{t('warehouse.swipeHint')}</span>
          <span className="font-semibold tabular-nums text-accent">{t('warehouse.itemsCount', { count: filteredItems.length })}</span>
        </div>
        <TableContainer bare>
          <Table>
            <Thead>
              <Tr>
                <Th align="center">
                  <input
                    type="checkbox"
                    aria-label={t('common.all')}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedForTransfer(filteredItems.map((it) => it.id));
                      else setSelectedForTransfer([]);
                    }}
                    checked={selectedForTransfer.length === filteredItems.length && filteredItems.length > 0}
                    className={checkboxClass}
                  />
                </Th>
                <Th>№</Th>
                <Th>{t('warehouse.col.arrival')}</Th>
                <Th>{t('warehouse.col.store')}</Th>
                <Th>{t('common.product_name')}</Th>
                <Th>{t('warehouse.col.imei1')}</Th>
                <Th>{t('warehouse.col.imei2')}</Th>
                <Th align="center">{t('common.status')}</Th>
                <Th align="right">{t('warehouse.col.cost')}</Th>
                <Th align="center" className="sticky right-0 z-20">{t('warehouse.col.actions')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <tr>
                  <td colSpan={10}>
                    <LoadingBlock label={t('warehouse.loading')} />
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <TableEmpty colSpan={10} title={t('warehouse.empty')} />
              ) : (
                filteredItems.map((it) => {
                  const isChecked = selectedForTransfer.includes(it.id);
                  return (
                    <Tr key={it.id} className={cn(it.isDaftar && 'bg-warning-soft/40')}>
                      <Td align="center" className={cn(it.isDaftar && 'border-l-4 border-l-warning')}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedForTransfer((prev) => [...prev, it.id]);
                            else setSelectedForTransfer((prev) => prev.filter((id) => id !== it.id));
                          }}
                          className={checkboxClass}
                        />
                      </Td>
                      <Td numeric className="font-mono font-semibold text-accent">
                        №{it.dealNumber}
                      </Td>
                      <Td numeric className="text-fg-muted">
                        {formatDate(it.date)}
                      </Td>
                      <Td className="whitespace-nowrap font-medium text-fg-secondary">{it.storeName}</Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-fg">{it.productName}</span>
                          {it.isDaftar && (
                            <Badge tone="warning" size="sm" icon={<BookOpen className="h-3 w-3" />}>
                              DAFTAR
                              {it.extraDaftar > 0 && (
                                <span className="font-mono tabular-nums">(+{formatMoney(it.extraDaftar)})</span>
                              )}
                            </Badge>
                          )}
                        </div>
                        {(it.color !== '-' || it.storageGb !== '-' || (it.providerName && it.providerName !== '-')) && (
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
                            {it.providerName && it.providerName !== '-' && (
                              <Badge tone="brand" size="sm">{it.providerName}</Badge>
                            )}
                            {it.color !== '-' && <span className="font-medium text-fg-secondary">{it.color}</span>}
                            {it.storageGb !== '-' && <span className="font-medium text-fg-secondary">{it.storageGb}</span>}
                          </div>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-[11px] tabular-nums text-fg-secondary">
                        {it.imeiBarcode || '-'}
                      </Td>
                      <Td className="whitespace-nowrap font-mono text-[11px] tabular-nums text-fg-muted">
                        {it.imei2 && it.imei2 !== '-' ? it.imei2 : '-'}
                      </Td>
                      <Td align="center" className="whitespace-nowrap">
                        <div className="inline-flex flex-col items-center gap-1">
                          {renderStatusPill(it.status)}
                          <button
                            type="button"
                            onClick={() => {
                              setStatusEditItem(it);
                              setNewStatus(it.status);
                              setStatusReason('');
                            }}
                            className="text-[11px] font-medium text-accent hover:underline"
                          >
                            {t('warehouse.change')}
                          </button>
                        </div>
                      </Td>
                      <Td align="right" numeric className="font-semibold text-fg">
                        {formatMoney(it.purchaseCost)}
                      </Td>
                      <Td align="center" className="sticky right-0 z-10 whitespace-nowrap bg-surface">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Skaner / Prixod tugmasi */}
                          {it.status === 'PENDING' && (
                            <Button
                              size="sm"
                              leftIcon={<Camera className="h-3.5 w-3.5" />}
                              onClick={() => setScanModalItem(it)}
                              title={t('warehouse.scanTooltip')}
                            >
                              {t('warehouse.scan')}
                            </Button>
                          )}

                          {/* Yo'lda holatidagi tovar uchun qabul qilish */}
                          {it.status === 'IN_TRANSIT' && (
                            <Button
                              size="sm"
                              leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                              onClick={() => handleAcceptTransfer(it.id, it.storeId)}
                              title={t('warehouse.acceptTooltip')}
                            >
                              {t('warehouse.accept')}
                            </Button>
                          )}

                          {it.status === 'IN_WAREHOUSE' && (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {it.isDaftar ? t('warehouse.inStockDaftar') : t('warehouse.inStock')}
                            </span>
                          )}

                          {it.status === 'NEED_TO_BUY' && (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-danger">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {it.isDaftar ? t('warehouse.mustBuyDaftar') : t('warehouse.mustBuy')}
                            </span>
                          )}

                          {it.status === 'PARTIAL_AMOUNT' && (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-info">
                              <Clock className="h-3.5 w-3.5" />
                              {t('dealStatus.PARTIAL_AMOUNT')}
                            </span>
                          )}

                          {it.status === 'MONEY_RECEIVED' && (
                            <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t('dealStatus.MONEY_RECEIVED')}
                            </span>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
          </Table>
        </TableContainer>
      </Card>

      {/* Skaner / Prixod oynasi */}
      {scanModalItem && (
        <BarcodeScannerModal
          item={scanModalItem}
          onClose={() => setScanModalItem(null)}
          onSuccess={() => {
            setScanModalItem(null);
            fetchInventory();
          }}
        />
      )}

      {/* Holatni o'zgartirish (sabab majburiy) */}
      <Modal
        open={!!statusEditItem}
        onClose={() => setStatusEditItem(null)}
        size="md"
        title={t('warehouse.statusModal.title', { number: statusEditItem?.dealNumber ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusEditItem(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="warehouse-status-form" loading={statusSubmitting}>
              {statusSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <form id="warehouse-status-form" onSubmit={handleUpdateStatus} className="space-y-4">
          <Field label={t('warehouse.statusModal.newStatus')}>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option value="IN_WAREHOUSE">{t('dealStatus.IN_WAREHOUSE')}</option>
              <option value="PENDING">{t('dealStatus.PENDING')}</option>
              <option value="IN_TRANSIT">{t('dealStatus.IN_TRANSIT')}</option>
              <option value="NEED_TO_BUY">{t('dealStatus.NEED_TO_BUY')}</option>
            </Select>
          </Field>

          <Field label={t('warehouse.statusModal.reason')} required hint={t('common.required')}>
            <Textarea
              required
              rows={3}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder={t('warehouse.statusModal.reasonPlaceholder')}
            />
          </Field>
        </form>
      </Modal>

      {/* Filiallararo tovar o'tkazish */}
      <Modal
        open={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        size="md"
        title={
          <span className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-accent" />
            {t('warehouse.transferModal.title')}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsTransferModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="warehouse-transfer-form"
              loading={transferring}
              disabled={selectedForTransfer.length === 0}
            >
              {transferring ? t('warehouse.transferModal.sending') : t('warehouse.transferModal.send')}
            </Button>
          </>
        }
      >
        <form id="warehouse-transfer-form" onSubmit={handleTransferSubmit} className="space-y-4">
          <div className="rounded-control border border-line bg-surface-2 p-3 text-xs text-fg-secondary">
            <span className="font-semibold tabular-nums text-fg">
              {t('warehouse.transferModal.selected', { count: selectedForTransfer.length })}
            </span>
            {selectedForTransfer.length === 0 && (
              <span className="mt-1 block text-[11px] text-danger">{t('warehouse.transferModal.selectFirst')}</span>
            )}
          </div>

          <Field label={t('warehouse.transferModal.target')} required>
            <Select required value={targetStoreId} onChange={(e) => setTargetStoreId(e.target.value)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('warehouse.transferModal.reason')}>
            <Input
              type="text"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder={t('warehouse.transferModal.reasonPlaceholder')}
            />
          </Field>
        </form>
      </Modal>

      {/* Tezkor inventarizatsiya (audit) */}
      <Modal
        open={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-accent" />
            {t('warehouse.auditModal.title')}
          </span>
        }
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setAuditScannedImeis([]);
              setIsAuditModalOpen(false);
            }}
          >
            {t('common.close')}
          </Button>
        }
      >
        <div className="space-y-4 text-xs">
          <p className="text-fg-secondary">{t('warehouse.auditModal.intro')}</p>

          {/* Apparat skaneri Enter yuboradi: faqat mahalliy ro'yxatga qo'shiladi, serverga hech narsa saqlanmaydi */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="text"
              className="flex-1"
              placeholder={t('warehouse.auditModal.placeholder')}
              value={auditInputImei}
              onChange={(e) => setAuditInputImei(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (auditInputImei.trim()) {
                    if (!auditScannedImeis.includes(auditInputImei.trim())) {
                      setAuditScannedImeis([...auditScannedImeis, auditInputImei.trim()]);
                    }
                    setAuditInputImei('');
                  }
                }
              }}
            />
            <Button
              onClick={() => {
                if (auditInputImei.trim() && !auditScannedImeis.includes(auditInputImei.trim())) {
                  setAuditScannedImeis([...auditScannedImeis, auditInputImei.trim()]);
                  setAuditInputImei('');
                }
              }}
            >
              {t('common.add')}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-control bg-surface-2 p-3">
              <span className="block text-fg-muted">{t('warehouse.auditModal.dbItems')}</span>
              <span className="text-base font-semibold tabular-nums text-fg">
                {t('common.items_count', { count: filteredItems.length })}
              </span>
            </div>
            <div className="rounded-control bg-success-soft p-3">
              <span className="block text-success">{t('warehouse.auditModal.scanned')}</span>
              <span className="text-base font-semibold tabular-nums text-success">
                {t('common.items_count', { count: auditScannedImeis.length })}
              </span>
            </div>
            <div className="rounded-control bg-danger-soft p-3">
              <span className="block text-danger">{t('warehouse.auditModal.missing')}</span>
              <span className="text-base font-semibold tabular-nums text-danger">
                {t('common.items_count', { count: Math.max(0, filteredItems.length - auditScannedImeis.length) })}
              </span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default WarehousePage;
