import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { formatMoney, formatPercent, formatDate, todayYmd, toYmdTashkent, addDaysYmd } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { Store } from '../types';
import { AmountInput } from '../components/AmountInput';
import {
  Button, Card, Modal, PageHeader, StatCard, Badge, Field, Input, Select,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, LoadingBlock, controlClass, cn,
} from '../components/ui';

export const SalesPage: React.FC = () => {
  const { t } = useTranslation();

  const [salesItems, setSalesItems] = useState<any[]>([]);
  const [availableStock, setAvailableStock] = useState<any[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Yangi sotuv oynasi
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [saleForm, setSaleForm] = useState({
    saleDate: todayYmd(),
    salePrice: 0,
    buyerName: '',
    paidAmount: 0,
    paymentType: 'CASH',
    dueDate: '',
    note: '',
    adminOverrideCode: '',
  });
  const [selling, setSelling] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [requiresOverride, setRequiresOverride] = useState(false);
  const [existingDebtNotice, setExistingDebtNotice] = useState(0);

  // Sotuvni tahrirlash oynasi
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
    fetchSales();
    fetchStores();
    fetchAvailableStock();
  }, [search, startDate, endDate]);

  const fetchStores = async () => {
    try {
      const res = await axios.get('/api/references/stores');
      setStores(res.data || []);
    } catch (err) {
      console.error('Error fetching stores:', err);
    }
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('status', 'SOLD');
      const res = await axios.get(`/api/inventory?${params.toString()}`);
      setSalesItems(res.data.items || []);
    } catch (err: any) {
      console.error('Fetch sales error:', err);
      setLoadError(err.response?.data?.error || t('common.load_error'));
    } finally {
      setLoading(false);
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

  // Do'kon bo'yicha filtr
  const filteredSales = salesItems.filter((it) => {
    if (storeFilter && it.storeId !== storeFilter && it.storeName !== storeFilter) return false;
    return true;
  });

  // KPI hisob-kitoblari
  const totalSalesCount = filteredSales.length;
  const totalSalesVolume = filteredSales.reduce((sum, it) => sum + (Number(it.salePrice) || 0), 0);
  const totalProfit = filteredSales.reduce((sum, it) => sum + (Number(it.profit) || 0), 0);
  const avgCheck = totalSalesCount > 0 ? Math.round(totalSalesVolume / totalSalesCount) : 0;
  const totalMarginSum = filteredSales.reduce((sum, it) => sum + (Number(it.marginPercent) || 0), 0);
  const avgMargin = totalSalesCount > 0 ? totalMarginSum / totalSalesCount : 0;

  // Haridor ismi: server buyerName (xaridor yoki mijoz) qaytaradi; "-" bo'lsa mijoz ismi
  const buyerOf = (item: any): string => {
    const b = item.buyerName && item.buyerName !== '-' ? item.buyerName : '';
    return b || item.customerName || '';
  };

  const handleOpenNewSale = () => {
    setIsSellModalOpen(true);
    setSelectedStockId(availableStock.length > 0 ? availableStock[0].id : '');
    const firstItem = availableStock[0];
    const initialPrice = firstItem ? (firstItem.salePrice > 0 ? firstItem.salePrice : Math.round(firstItem.purchaseCost * 1.12)) : 0;
    setSaleForm({
      saleDate: todayYmd(),
      salePrice: initialPrice,
      buyerName: '',
      paidAmount: initialPrice,
      paymentType: 'CASH',
      dueDate: '',
      note: '',
      adminOverrideCode: '',
    });
    setSaleError('');
    setRequiresOverride(false);
    setExistingDebtNotice(0);
  };

  const handleStockSelectChange = (id: string) => {
    setSelectedStockId(id);
    const item = availableStock.find((it) => it.id === id);
    if (item) {
      const initialPrice = item.salePrice > 0 ? item.salePrice : Math.round(item.purchaseCost * 1.12);
      setSaleForm((prev) => ({
        ...prev,
        salePrice: initialPrice,
        paidAmount: initialPrice,
      }));
    }
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStockId) {
      alert(t('sales.form.pickDevice'));
      return;
    }
    if (!saleForm.buyerName.trim()) {
      alert(t('sales.form.buyerRequired'));
      return;
    }

    try {
      setSelling(true);
      setSaleError('');
      await axios.put(`/api/inventory/${selectedStockId}/sell`, saleForm);
      setIsSellModalOpen(false);
      fetchSales();
      fetchAvailableStock();
      alert(t('sales.form.done'));
    } catch (err: any) {
      if (err.response?.data?.requiresOverride) {
        setRequiresOverride(true);
        setExistingDebtNotice(err.response.data.totalExistingDebt || 0);
      }
      setSaleError(err.response?.data?.error || err.message);
    } finally {
      setSelling(false);
    }
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
    <div className="space-y-4 sm:space-y-5">
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatCard
          title={t('sales.kpi.total')}
          value={<span className="text-base sm:text-lg">{formatMoney(totalSalesVolume)}</span>}
          hint={t('sales.kpi.totalHint')}
          tone="success"
        />
        <StatCard
          title={t('sales.kpi.count')}
          value={t('sales.kpi.countValue', { count: totalSalesCount })}
          hint={t('sales.kpi.countHint')}
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
          tone="brand"
          className="col-span-2 sm:col-span-1"
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
                <option key={s.id} value={s.name}>
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
              <span className="text-[11px] text-fg-muted">{t('common.from')}:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-auto min-w-0 tabular-nums"
              />
            </label>

            <label className="flex items-center gap-1.5">
              <span className="text-[11px] text-fg-muted">{t('common.to')}:</span>
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

      {/* Sotuvlar jadvali */}
      <Card padding="none">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-fg-muted lg:hidden">
          <span>{t('sales.swipeHint')}</span>
          <span className="font-semibold tabular-nums text-success">{t('sales.listCount', { count: filteredSales.length })}</span>
        </div>
        <TableContainer bare>
          <Table>
            <Thead>
              <Tr>
                <Th>№</Th>
                <Th>{t('common.date')}</Th>
                <Th>{t('sales.col.store')}</Th>
                <Th>{t('common.product_name')}</Th>
                <Th>{t('sales.col.imei')}</Th>
                <Th align="right">{t('sales.col.purchase')}</Th>
                <Th align="right">{t('sales.col.salePrice')}</Th>
                <Th align="right">{t('sales.col.profit')}</Th>
                <Th align="center">{t('common.margin')}</Th>
                <Th>{t('sales.col.buyer')}</Th>
                <Th align="center">{t('common.status')}</Th>
                <Th align="center" className="sticky right-0 z-20">{t('common.actions')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <tr>
                  <td colSpan={12}>
                    <LoadingBlock label={t('sales.loading')} />
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <TableEmpty colSpan={12} title={t('sales.empty')} icon={<ShoppingBag />} />
              ) : (
                filteredSales.map((item, idx) => (
                  <Tr key={item.id}>
                    <Td numeric className="font-semibold text-fg-muted">{idx + 1}</Td>
                    <Td numeric className="text-fg-secondary">{formatDate(item.dealDate)}</Td>
                    <Td className="font-medium text-fg-secondary">{item.storeName || '—'}</Td>
                    <Td>
                      <div className="font-semibold text-fg">{item.productName}</div>
                      {item.isDaftar && (
                        <Badge tone="warning" size="sm" className="mt-0.5">Daftar</Badge>
                      )}
                    </Td>
                    <Td className="font-mono text-[11px] tabular-nums text-fg-muted">{item.imei || '-'}</Td>
                    <Td align="right" numeric className="text-fg-secondary">{formatMoney(item.purchaseCost)}</Td>
                    <Td align="right" numeric>
                      <div className="font-semibold text-fg">{formatMoney(item.salePrice)}</div>
                      {Number(item.debtRemainder) > 0 ? (
                        <div className="mt-0.5 text-[11px] font-semibold text-danger">
                          {t('sales.debt', { amount: formatMoney(item.debtRemainder) })}
                        </div>
                      ) : Number(item.salePrice) > 0 ? (
                        <div className="mt-0.5 text-[11px] font-medium text-success">{t('sales.fullyPaid')}</div>
                      ) : null}
                    </Td>
                    <Td align="right" numeric className="font-semibold">
                      <span className={Number(item.profit) >= 0 ? 'text-success' : 'text-danger'}>
                        {formatMoney(item.profit)}
                      </span>
                    </Td>
                    <Td align="center" numeric>
                      <Badge tone="brand" size="sm">{formatPercent(item.marginPercent)}</Badge>
                    </Td>
                    <Td>
                      <div className="font-medium text-fg">{buyerOf(item) || '—'}</div>
                      {item.debtDueDate && Number(item.debtRemainder) > 0 && (
                        <div className="whitespace-nowrap text-[11px] font-medium tabular-nums text-warning">
                          {t('sales.dueDate', { date: formatDate(item.debtDueDate) })}
                        </div>
                      )}
                    </Td>
                    <Td align="center">
                      <Badge tone="success" size="sm">{t('dealStatus.SOLD')}</Badge>
                    </Td>
                    <Td align="center" className="sticky right-0 z-10 whitespace-nowrap bg-surface">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={<Edit3 className="h-3.5 w-3.5" />}
                          onClick={() => handleOpenEditSale(item)}
                          title={t('sales.editTooltip')}
                        >
                          {t('sales.change')}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-danger"
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => setDeletingSale(item)}
                          title={t('sales.deleteTooltip')}
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </TableContainer>
      </Card>

      {/* Yangi sotuv oynasi */}
      <Modal
        open={isSellModalOpen}
        onClose={() => setIsSellModalOpen(false)}
        size="md"
        title={
          <span className="flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5 text-accent" />
            {t('sales.newSale')}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsSellModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="sale-new-form" loading={selling}>
              {selling ? t('sales.form.submitting') : t('sales.form.submit')}
            </Button>
          </>
        }
      >
        <form id="sale-new-form" onSubmit={handleSaleSubmit} className="space-y-4">
          <Field label={t('sales.form.stock')} required>
            <Select value={selectedStockId} onChange={(e) => handleStockSelectChange(e.target.value)} required>
              {availableStock.length === 0 ? (
                <option value="">{t('sales.form.noStock')}</option>
              ) : (
                availableStock.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.productName} — IMEI: {st.imei || t('sales.form.noImei')} ({st.storeName})
                  </option>
                ))
              )}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('sales.form.saleDate')} required>
              <Input
                type="date"
                value={saleForm.saleDate}
                onChange={(e) => setSaleForm({ ...saleForm, saleDate: e.target.value })}
                required
              />
            </Field>
            <Field label={t('sales.form.buyer')} required>
              <Input
                type="text"
                value={saleForm.buyerName}
                onChange={(e) => setSaleForm({ ...saleForm, buyerName: e.target.value })}
                placeholder={t('sales.form.buyerPlaceholder')}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('sales.form.salePrice')} required>
              <AmountInput
                value={saleForm.salePrice}
                onChange={(val) => {
                  if (saleForm.paymentType === 'INSTALLMENT') {
                    setSaleForm({ ...saleForm, salePrice: val });
                  } else {
                    setSaleForm({ ...saleForm, salePrice: val, paidAmount: val });
                  }
                }}
                placeholder={t('sales.form.salePricePlaceholder')}
                className={amountClass}
                required
              />
            </Field>
            <Field label={t('sales.form.paid')}>
              <AmountInput
                value={saleForm.paidAmount}
                onChange={(val) => setSaleForm({ ...saleForm, paidAmount: val })}
                placeholder="0"
                className={amountClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('sales.form.payType')}>
              <Select
                value={saleForm.paymentType}
                onChange={(e) => {
                  const pType = e.target.value;
                  if (pType === 'INSTALLMENT') {
                    setSaleForm({ ...saleForm, paymentType: pType, paidAmount: 0 });
                  } else {
                    setSaleForm({ ...saleForm, paymentType: pType, paidAmount: saleForm.salePrice });
                  }
                }}
              >
                {paymentOptions}
              </Select>
            </Field>
            <Field label={t('sales.form.dueDate')}>
              <Input
                type="date"
                value={saleForm.dueDate}
                onChange={(e) => setSaleForm({ ...saleForm, dueDate: e.target.value })}
              />
            </Field>
          </div>

          {/* Qarz ko'rsatkichi */}
          {saleForm.salePrice > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface-2 p-3 text-xs">
              <div>
                <span className="block text-[11px] text-fg-muted">{t('sales.form.debtAmount')}:</span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    saleForm.salePrice - saleForm.paidAmount > 0 ? 'text-danger' : 'text-success'
                  )}
                >
                  {formatMoney(Math.max(0, saleForm.salePrice - saleForm.paidAmount))}
                </span>
              </div>
              {saleForm.salePrice - saleForm.paidAmount > 0 ? (
                <Badge tone="danger" size="sm">{t('sales.form.goesToDebtors')}</Badge>
              ) : (
                <Badge tone="success" size="sm">{t('sales.fullyPaid')}</Badge>
              )}
            </div>
          )}

          {/* Qarz haqida ogohlantirish va admin kodi */}
          {requiresOverride && (
            <div className="space-y-2 rounded-card border border-danger/30 bg-danger-soft p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{t('sales.form.overdueDebt', { amount: formatMoney(existingDebtNotice) })}</span>
              </div>
              <p className="text-[11px] text-fg-secondary">{t('sales.form.overrideHint')}</p>
              <Input
                type="password"
                placeholder={t('sales.form.adminCode')}
                value={saleForm.adminOverrideCode}
                onChange={(e) => setSaleForm({ ...saleForm, adminOverrideCode: e.target.value })}
              />
            </div>
          )}

          {saleError && (
            <p role="alert" className="text-xs font-semibold text-danger">{saleError}</p>
          )}
        </form>
      </Modal>

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
                  <div className="flex items-center gap-1.5 rounded-control bg-warning-soft p-2 text-[11px] font-medium text-warning">
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
              <span className="mt-0.5 pl-5 text-[11px] text-fg-muted">{t('sales.delete.option1Hint')}</span>
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
              <span className="mt-0.5 pl-5 text-[11px] text-fg-muted">{t('sales.delete.option2Hint')}</span>
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};
export default SalesPage;
