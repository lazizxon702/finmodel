import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  BadgeDollarSign,
  Search,
  AlertTriangle,
  Plus,
  ShoppingBag,
  Calendar,
  X,
  Edit3,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  DollarSign,
} from 'lucide-react';
import { formatMoney, formatPercent, formatDate, todayYmd, toYmdTashkent, addDaysYmd } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { Store } from '../types';
import { AmountInput } from '../components/AmountInput';
import {
  Button, Card, Modal, PageHeader, StatCard, Badge, Field, Input, Select,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, LoadingBlock, controlClass, cn,
} from '../components/ui';
import { NewSaleModal } from '../components/sales/NewSaleModal';
import { EditSaleModal, SalePaymentModal, SaleReturnModal, SaleReturnTarget } from '../components/sales/SaleModals';
import { SaleDetails } from '../components/sales/SaleDetails';
import {
  EMPTY_TOTALS, SaleRow, SalesTotals, StockRow, legacyInventoryShape, num,
  paymentStatusTone, paymentTypeTone, saleDisplayNumber,
} from '../components/sales/saleTypes';

const SALES_COLS = 11;

export const SalesPage: React.FC = () => {
  const { t } = useTranslation();

  const [sales, setSales] = useState<SaleRow[]>([]);
  const [totals, setTotals] = useState<SalesTotals>(EMPTY_TOTALS);
  const [availableStock, setAvailableStock] = useState<StockRow[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Ochilgan (tovarlari ko'rsatilayotgan) sotuvlar
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Eskirgan javob yangisining ustiga yozilmasligi uchun so'rov tartib raqami
  const fetchSeq = useRef(0);

  // Yangi sotuv oynasi (ko'p tovarli) va yangi sotuvlar amallari
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [editingMulti, setEditingMulti] = useState<SaleRow | null>(null);
  const [payingSale, setPayingSale] = useState<SaleRow | null>(null);
  const [returnTarget, setReturnTarget] = useState<SaleReturnTarget | null>(null);

  // Eski (legacy) sotuvni tahrirlash oynasi
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    saleDate: todayYmd(),
    salePrice: 0,
    buyerName: '',
    paidAmount: 0,
    paymentType: 'CASH',
    dueDate: '',
    note: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // O'chirish / bekor qilish oynasi
  const [deletingSale, setDeletingSale] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchStores();
    fetchAvailableStock();
  }, []);

  // Qidiruv, sana va do'kon filtrlari serverda bajariladi (qidiruv yozilayotganda biroz kutiladi)
  useEffect(() => {
    const timer = setTimeout(() => fetchSales(), 250);
    return () => clearTimeout(timer);
  }, [search, startDate, endDate, storeFilter]);

  // Ro'yxat qayta yuklanganda ochiq oynalardagi sotuv ham yangilanadi (eskirgan jami/qarz ko'rinib qolmasin)
  useEffect(() => {
    const fresh = (row: SaleRow) => sales.find((s) => !s.legacy && s.id === row.id);
    setEditingMulti((prev) => (prev && fresh(prev)) || prev);
    setPayingSale((prev) => (prev && fresh(prev)) || prev);
    setReturnTarget((prev) => {
      if (!prev) return prev;
      const sale = fresh(prev.sale);
      if (!sale) return prev;
      if (!prev.item) return { sale };
      const item = sale.items.find((it) => it.dealId === prev.item!.dealId);
      return item ? { sale, item } : prev;
    });
  }, [sales]);

  // Real vaqt: bitim yoki kassa o'zgarsa ro'yxat jim (spinnersiz) yangilanadi
  const reloadAll = () => {
    fetchSales(true);
    fetchAvailableStock();
  };
  useRealtime('deals:updated', reloadAll);
  useRealtime('dds:updated', reloadAll);

  const fetchStores = async () => {
    try {
      const res = await axios.get('/api/references/stores');
      setStores(res.data || []);
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const fetchSales = async (silent: boolean = false) => {
    const seq = ++fetchSeq.current;
    try {
      if (!silent) setLoading(true);
      setLoadError('');
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (storeFilter) params.append('storeId', storeFilter);
      const res = await axios.get(`/api/sales?${params.toString()}`);
      if (seq !== fetchSeq.current) return;
      setSales(Array.isArray(res.data?.sales) ? res.data.sales : []);
      setTotals({ ...EMPTY_TOTALS, ...(res.data?.totals || {}) });
    } catch (err: any) {
      if (seq !== fetchSeq.current) return;
      console.error('Fetch sales error:', err);
      setLoadError(err.response?.data?.error || t('common.load_error'));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  };

  const fetchAvailableStock = async () => {
    try {
      const res = await axios.get('/api/inventory?status=IN_WAREHOUSE');
      setAvailableStock(res.data.items || []);
    } catch (err) {
      console.error('Fetch available stock error:', err);
    }
  };

  // KPI — server qaytargan `totals` dan (filtrlar serverda qo'llangan)
  const totalSalesCount = num(totals.count);
  const totalSalesVolume = num(totals.totalPrice);
  const totalProfit = num(totals.profit);
  const avgCheck = totalSalesCount > 0 ? Math.round(totalSalesVolume / totalSalesCount) : 0;
  // O'rtacha marja = jami foyda / jami sotuv (sotuv hajmiga ko'ra tortilgan)
  const avgMargin = totalSalesVolume > 0 ? (totalProfit / totalSalesVolume) * 100 : 0;

  // Haridor ismi: server buyerName (xaridor yoki mijoz) qaytaradi; "-" bo'lsa mijoz ismi
  const buyerOf = (item: any): string => {
    const b = item.buyerName && item.buyerName !== '-' ? item.buyerName : '';
    return b || item.customerName || '';
  };

  const toggleExpanded = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleOpenNewSale = () => {
    // Oyna ochilganda ombor ro'yxati yangilanadi (boshqa foydalanuvchi sotgan bo'lishi mumkin)
    fetchAvailableStock();
    setIsSellModalOpen(true);
  };

  const handleOpenEditSale = (item: any) => {
    setEditingSale(item);
    const sPrice = Number(item.salePrice) || 0;
    const debt = Number(item.debtRemainder) || 0;
    const paid = Number(item.receivedFromBuyer) || (sPrice - debt);
    setEditForm({
      saleDate: item.saleDate ? toYmdTashkent(item.saleDate) : (item.dealDate ? toYmdTashkent(item.dealDate) : todayYmd()),
      salePrice: sPrice,
      buyerName: buyerOf(item),
      paidAmount: Math.max(0, paid),
      paymentType: debt > 0 ? 'INSTALLMENT' : 'CASH',
      dueDate: item.debtDueDate ? toYmdTashkent(item.debtDueDate) : '',
      note: item.note || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;
    if (!editForm.buyerName.trim()) {
      alert(t('sales.edit.buyerRequired'));
      return;
    }
    if (editForm.salePrice <= 0) {
      alert(t('sales.edit.priceRequired'));
      return;
    }

    try {
      setSavingEdit(true);
      await axios.put(`/api/inventory/${editingSale.id}/sale`, editForm);
      setEditingSale(null);
      fetchSales();
      fetchAvailableStock();
      alert(t('sales.edit.done'));
    } catch (err: any) {
      alert(`${t('common.error')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRevertSaleToWarehouse = async (dealId: string) => {
    if (!confirm(t('sales.revert.confirm'))) return;
    try {
      setDeleting(true);
      await axios.put(`/api/inventory/${dealId}/sale`, { returnToWarehouse: true });
      setEditingSale(null);
      setDeletingSale(null);
      fetchSales();
      fetchAvailableStock();
      alert(t('sales.revert.done'));
    } catch (err: any) {
      alert(`${t('common.error')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSalePermanently = async (dealId: string) => {
    if (!confirm(t('sales.delete.confirm'))) return;
    try {
      setDeleting(true);
      await axios.delete(`/api/inventory/${dealId}/sale?deletePermanently=true`);
      setDeletingSale(null);
      fetchSales();
      fetchAvailableStock();
      alert(t('sales.delete.done'));
    } catch (err: any) {
      alert(`${t('common.error')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Tez sana tugmalari (Toshkent kuni bo'yicha)
  const presets: { key: string; label: string; apply: () => void }[] = [
    {
      key: 'today',
      label: t('common.today'),
      apply: () => {
        const today = todayYmd();
        setStartDate(today);
        setEndDate(today);
      },
    },
    {
      key: 'yesterday',
      label: t('sales.yesterday'),
      apply: () => {
        const yest = addDaysYmd(todayYmd(), -1);
        setStartDate(yest);
        setEndDate(yest);
      },
    },
    {
      key: 'last7',
      label: t('sales.last7'),
      apply: () => {
        const today = todayYmd();
        setStartDate(addDaysYmd(today, -7));
        setEndDate(today);
      },
    },
    {
      key: 'month',
      label: t('sales.thisMonth'),
      apply: () => {
        const today = todayYmd();
        const [y, m] = today.split('-').map(Number);
        const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
        setStartDate(`${today.slice(0, 8)}01`);
        setEndDate(`${today.slice(0, 8)}${String(lastDay).padStart(2, '0')}`);
      },
    },
  ];

  const paymentOptions = (
    <>
      <option value="CASH">{t('sales.pay.CASH')}</option>
      <option value="CARD">{t('sales.pay.CARD')}</option>
      <option value="INSTALLMENT">{t('sales.pay.INSTALLMENT')}</option>
    </>
  );

  const amountClass = cn(controlClass, 'font-semibold tabular-nums');

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={<BadgeDollarSign className="h-5 w-5" />}
        title={t('sales.title')}
        description={t('sales.subtitle')}
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleOpenNewSale}>
            {t('sales.newSale')}
          </Button>
        }
      />

      {loadError && (
        <div role="alert" className="rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
        <StatCard
          title={t('sales.kpi.total')}
          value={<span className="text-base sm:text-lg">{formatMoney(totalSalesVolume)}</span>}
          hint={
            num(totals.debt) > 0 ? (
              <span className="whitespace-nowrap">{t('sales.debt', { amount: formatMoney(totals.debt) })}</span>
            ) : (
              t('sales.kpi.totalHint')
            )
          }
          tone="success"
        />
        <StatCard
          title={t('sales.kpi.count')}
          value={t('sales.kpi.countValue', { count: totalSalesCount })}
          hint={t('sales.itemsCount', { count: num(totals.itemsCount) })}
          tone="brand"
        />
        <StatCard
          title={t('sales.kpi.avgCheck')}
          value={<span className="text-base sm:text-lg">{formatMoney(avgCheck)}</span>}
          hint={t('sales.kpi.avgCheckHint')}
          tone="info"
        />
        <StatCard
          title={t('sales.kpi.profit')}
          value={<span className="text-base sm:text-lg">{formatMoney(totalProfit)}</span>}
          hint={t('sales.kpi.profitHint')}
          tone="success"
        />
        <StatCard
          title={t('sales.kpi.margin')}
          value={formatPercent(avgMargin)}
          hint={t('sales.kpi.marginHint')}
          tone="violet"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Qidiruv va filtrlar */}
      <Card padding="sm" className="space-y-3">
        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <Input
              type="text"
              leftIcon={<Search />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('sales.searchPlaceholder')}
            />
          </div>

          <div className="flex items-center gap-2">
            <Select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="md:w-56">
              <option value="">{t('sales.allStores')}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>

            <Button
              variant="secondary"
              size="icon"
              onClick={() => {
                setSearch('');
                setStoreFilter('');
                setStartDate('');
                setEndDate('');
              }}
              title={t('common.reset')}
              aria-label={t('common.reset')}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sana oralig'i */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex shrink-0 items-center gap-1.5 font-medium text-fg-secondary">
              <Calendar className="h-3.5 w-3.5 text-accent" />
              <span>{t('sales.byDate')}:</span>
            </span>

            <label className="flex items-center gap-1.5">
              <span className="text-xs text-fg-muted">{t('common.from')}:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-auto min-w-0 tabular-nums"
              />
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-xs text-fg-muted">{t('common.to')}:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-auto min-w-0 tabular-nums"
              />
            </label>

            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                leftIcon={<X className="h-3.5 w-3.5" />}
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                title={t('sales.clearDates')}
              >
                {t('common.cancel')}
              </Button>
            )}
          </div>

          {/* Tez tugmalar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {presets.map((p) => (
              <Button key={p.key} size="sm" variant="secondary" onClick={p.apply}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Sotuvlar jadvali: har bir sotuv — bitta qator, bosilganda tovarlari ochiladi */}
      <Card padding="none">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-fg-muted lg:hidden">
          <span>{t('sales.swipeHint')}</span>
          <span className="font-semibold tabular-nums text-success">{t('sales.listCount', { count: sales.length })}</span>
        </div>
        <TableContainer bare>
          <Table>
            <Thead>
              <Tr>
                <Th>№</Th>
                <Th>{t('common.date')}</Th>
                <Th>{t('sales.col.buyer')}</Th>
                <Th>{t('sales.col.items')}</Th>
                <Th align="right">{t('sales.col.purchase')}</Th>
                <Th align="right">{t('sales.col.salePrice')}</Th>
                <Th align="right">{t('sales.col.profit')}</Th>
                <Th align="center">{t('common.margin')}</Th>
                <Th align="center">{t('sales.col.payType')}</Th>
                <Th align="center">{t('common.status')}</Th>
                <Th align="center" className="sticky right-0 z-20">{t('common.actions')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <tr>
                  <td colSpan={SALES_COLS}>
                    <LoadingBlock label={t('sales.loading')} />
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <TableEmpty colSpan={SALES_COLS} title={t('sales.empty')} icon={<ShoppingBag />} />
              ) : (
                sales.map((sale) => {
                  const rowKey = `${sale.legacy ? 'L' : 'S'}-${sale.id}`;
                  const isOpen = !!expanded[rowKey];
                  const debt = num(sale.debtRemainder);
                  const firstItem = sale.items?.[0];
                  return (
                    <React.Fragment key={rowKey}>
                      <Tr clickable onClick={() => toggleExpanded(rowKey)} aria-expanded={isOpen}>
                        <Td numeric className="font-mono font-semibold text-accent">
                          <span className="inline-flex items-center gap-1">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
                            )}
                            №{saleDisplayNumber(sale)}
                          </span>
                        </Td>
                        <Td numeric className="text-fg-secondary">
                          {sale.dateLabel || (sale.saleDate ? formatDate(sale.saleDate) : '—')}
                        </Td>
                        <Td>
                          <div className="font-medium text-fg">{buyerOf(sale) || '—'}</div>
                          {sale.debtDueDate && debt > 0 && (
                            <div className="whitespace-nowrap text-xs font-medium tabular-nums text-warning">
                              {t('sales.dueDate', { date: formatDate(sale.debtDueDate) })}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <div className="whitespace-nowrap font-semibold text-fg">
                            {t('sales.itemsCount', { count: num(sale.itemsCount) || sale.items?.length || 0 })}
                          </div>
                          <div className="max-w-[14rem] truncate text-xs text-fg-muted" title={firstItem?.productName || undefined}>
                            {firstItem?.productName || '—'}
                          </div>
                        </Td>
                        <Td align="right" numeric className="text-fg-secondary">{formatMoney(sale.totalCost)}</Td>
                        <Td align="right" numeric>
                          <div className="font-semibold text-fg">{formatMoney(sale.totalPrice)}</div>
                          {debt > 0 ? (
                            <div className="mt-0.5 text-xs font-semibold text-danger">
                              {t('sales.debt', { amount: formatMoney(debt) })}
                            </div>
                          ) : num(sale.totalPrice) > 0 ? (
                            <div className="mt-0.5 text-xs font-medium text-success">{t('sales.fullyPaid')}</div>
                          ) : null}
                        </Td>
                        <Td align="right" numeric className="font-semibold">
                          <span className={num(sale.profit) >= 0 ? 'text-success' : 'text-danger'}>
                            {formatMoney(sale.profit)}
                          </span>
                        </Td>
                        <Td align="center" numeric>
                          <Badge tone="brand" size="sm">{formatPercent(sale.marginPct)}</Badge>
                        </Td>
                        <Td align="center">
                          {sale.paymentType ? (
                            <Badge tone={paymentTypeTone(sale.paymentType)} size="sm">
                              {t(`sales.ptype.${sale.paymentType}`, sale.paymentType)}
                            </Badge>
                          ) : (
                            <span className="text-fg-muted">—</span>
                          )}
                        </Td>
                        <Td align="center">
                          <Badge tone={paymentStatusTone(sale.paymentStatus)} size="sm">
                            {t(`paymentStatus.${sale.paymentStatus}`, sale.paymentStatus || '—')}
                          </Badge>
                        </Td>
                        <Td
                          align="center"
                          className="sticky right-0 z-10 whitespace-nowrap bg-surface"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            {sale.legacy ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  onClick={() => handleOpenEditSale(legacyInventoryShape(sale))}
                                  title={t('sales.editTooltip')}
                                  aria-label={t('sales.editTooltip')}
                                >
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="text-danger"
                                  onClick={() => setDeletingSale(legacyInventoryShape(sale))}
                                  title={t('sales.deleteTooltip')}
                                  aria-label={t('sales.deleteTooltip')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  onClick={() => setEditingMulti(sale)}
                                  title={t('sales.editTooltip')}
                                  aria-label={t('sales.editTooltip')}
                                >
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                                {debt > 0 && (
                                  <Button
                                    size="icon"
                                    variant="success"
                                    onClick={() => setPayingSale(sale)}
                                    title={t('sales.payment.title')}
                                    aria-label={t('sales.payment.title')}
                                  >
                                    <DollarSign className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="text-danger"
                                  onClick={() => setReturnTarget({ sale })}
                                  title={t('sales.return.titleSale')}
                                  aria-label={t('sales.return.titleSale')}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </Td>
                      </Tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={SALES_COLS} className="border-b border-line p-0">
                            <SaleDetails sale={sale} onReturnItem={(item) => setReturnTarget({ sale, item })} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </Tbody>
          </Table>
        </TableContainer>
      </Card>

      {/* Yangi sotuv oynasi (bir nechta tovar, bitta narx, bitta to'lov) */}
      <NewSaleModal
        open={isSellModalOpen}
        onClose={() => setIsSellModalOpen(false)}
        stock={availableStock}
        onSaved={() => {
          fetchSales(true);
          fetchAvailableStock();
        }}
        onStockStale={fetchAvailableStock}
      />

      {/* Yangi sotuvlar: tahrirlash, to'lov qo'shish, omborga qaytarish */}
      <EditSaleModal sale={editingMulti} onClose={() => setEditingMulti(null)} onSaved={() => fetchSales(true)} />
      <SalePaymentModal sale={payingSale} onClose={() => setPayingSale(null)} onSaved={() => fetchSales(true)} />
      <SaleReturnModal
        target={returnTarget}
        onClose={() => setReturnTarget(null)}
        onDone={() => {
          fetchSales(true);
          fetchAvailableStock();
        }}
      />

      {/* Sotuvni tahrirlash oynasi */}
      <Modal
        open={!!editingSale}
        onClose={() => setEditingSale(null)}
        size="md"
        title={
          <span className="flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-accent" />
            {t('sales.edit.title', { number: editingSale?.dealNumber ?? '' })}
          </span>
        }
        footer={
          editingSale ? (
            <>
              <Button
                variant="secondary"
                className="sm:mr-auto"
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => handleRevertSaleToWarehouse(editingSale.id)}
                title={t('sales.revert.tooltip')}
              >
                {t('sales.revert.button')}
              </Button>
              <Button variant="secondary" onClick={() => setEditingSale(null)}>
                {t('common.close')}
              </Button>
              <Button type="submit" form="sale-edit-form" loading={savingEdit}>
                {savingEdit ? t('common.saving') : t('sales.edit.save')}
              </Button>
            </>
          ) : undefined
        }
      >
        {editingSale && (
          <div className="space-y-4">
            {/* Mahsulot xulosasi */}
            <div className="space-y-1 rounded-card border border-line bg-surface-2 p-3 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-fg-muted">{t('sales.edit.product')}:</span>
                <span className="font-semibold text-fg">{editingSale.productName}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-fg-muted">{t('sales.edit.store')}:</span>
                <span className="font-medium text-fg-secondary">{editingSale.storeName}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-fg-muted">{t('sales.edit.cost')}:</span>
                <span className="font-semibold tabular-nums text-fg">{formatMoney(editingSale.purchaseCost)}</span>
              </div>
            </div>

            <form id="sale-edit-form" onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('sales.form.saleDate')} required>
                  <Input
                    type="date"
                    value={editForm.saleDate}
                    onChange={(e) => setEditForm({ ...editForm, saleDate: e.target.value })}
                    required
                  />
                </Field>
                <Field label={t('sales.form.buyer')} required>
                  <Input
                    type="text"
                    value={editForm.buyerName}
                    onChange={(e) => setEditForm({ ...editForm, buyerName: e.target.value })}
                    placeholder={t('sales.form.buyerPlaceholder')}
                    required
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('sales.form.salePrice')} required>
                  <AmountInput
                    value={editForm.salePrice}
                    onChange={(val) => {
                      if (editForm.paymentType === 'INSTALLMENT') {
                        setEditForm({ ...editForm, salePrice: val });
                      } else {
                        setEditForm({ ...editForm, salePrice: val, paidAmount: val });
                      }
                    }}
                    placeholder={t('sales.form.salePricePlaceholder')}
                    className={amountClass}
                    required
                  />
                </Field>
                <Field label={t('sales.form.paid')}>
                  <AmountInput
                    value={editForm.paidAmount}
                    onChange={(val) => setEditForm({ ...editForm, paidAmount: val })}
                    placeholder="0"
                    className={amountClass}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('sales.form.payType')}>
                  <Select
                    value={editForm.paymentType}
                    onChange={(e) => {
                      const pType = e.target.value;
                      if (pType === 'INSTALLMENT') {
                        setEditForm({ ...editForm, paymentType: pType, paidAmount: 0 });
                      } else {
                        setEditForm({ ...editForm, paymentType: pType, paidAmount: editForm.salePrice });
                      }
                    }}
                  >
                    {paymentOptions}
                  </Select>
                </Field>
                <Field label={t('sales.form.dueDate')}>
                  <Input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                  />
                </Field>
              </div>

              {/* Jonli foyda va qarz hisobi */}
              <div className="space-y-2 rounded-card border border-line bg-surface-2 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-fg-muted">{t('sales.edit.expectedProfit')}:</span>
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      editForm.salePrice - editingSale.purchaseCost >= 0 ? 'text-success' : 'text-danger'
                    )}
                  >
                    {formatMoney(editForm.salePrice - editingSale.purchaseCost)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-line pt-1.5">
                  <span className="text-fg-muted">{t('sales.edit.debtBalance')}:</span>
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      editForm.salePrice - editForm.paidAmount > 0 ? 'text-danger' : 'text-success'
                    )}
                  >
                    {formatMoney(Math.max(0, editForm.salePrice - editForm.paidAmount))}
                  </span>
                </div>

                {editForm.salePrice - editForm.paidAmount > 0 && (
                  <div className="flex items-center gap-1.5 rounded-control bg-warning-soft p-2 text-xs font-medium text-warning">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{t('sales.edit.goesToDebtors')}</span>
                  </div>
                )}
              </div>

              <Field label={t('sales.edit.note')}>
                <Input
                  type="text"
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  placeholder={t('sales.edit.notePlaceholder')}
                />
              </Field>
            </form>
          </div>
        )}
      </Modal>

      {/* O'chirish / bekor qilish oynasi */}
      <Modal
        open={!!deletingSale}
        onClose={() => setDeletingSale(null)}
        size="sm"
        title={
          <span className="flex items-center gap-2 text-danger">
            <Trash2 className="h-5 w-5" />
            {t('sales.delete.title')}
          </span>
        }
        description={deletingSale ? `№${deletingSale.dealNumber} — ${deletingSale.productName}` : undefined}
        footer={
          <Button variant="secondary" onClick={() => setDeletingSale(null)}>
            {t('common.cancel')}
          </Button>
        }
      >
        {deletingSale && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-fg-secondary">{t('sales.delete.question')}</p>

            <button
              type="button"
              disabled={deleting}
              onClick={() => handleRevertSaleToWarehouse(deletingSale.id)}
              className="flex min-h-touch w-full flex-col rounded-card border border-success/30 bg-success-soft p-3 text-left transition-colors hover:bg-success-soft/70 disabled:opacity-60"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <RotateCcw className="h-4 w-4" />
                {t('sales.delete.option1')}
              </span>
              <span className="mt-0.5 pl-5 text-xs text-fg-muted">{t('sales.delete.option1Hint')}</span>
            </button>

            <button
              type="button"
              disabled={deleting}
              onClick={() => handleDeleteSalePermanently(deletingSale.id)}
              className="flex min-h-touch w-full flex-col rounded-card border border-danger/30 bg-danger-soft p-3 text-left transition-colors hover:bg-danger-soft/70 disabled:opacity-60"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                <Trash2 className="h-4 w-4" />
                {t('sales.delete.option2')}
              </span>
              <span className="mt-0.5 pl-5 text-xs text-fg-muted">{t('sales.delete.option2Hint')}</span>
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};
export default SalesPage;
