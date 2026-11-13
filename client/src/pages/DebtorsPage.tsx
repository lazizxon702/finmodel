import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  CreditCard,
  Search,
  AlertTriangle,
  CheckCircle2,
  Phone,
  DollarSign,
  History,
  Lock,
} from 'lucide-react';
import { formatMoney, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import { AmountInput } from '../components/AmountInput';
import {
  Button, Card, Modal, PageHeader, StatCard, Badge, Field, Input, Select,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, LoadingBlock, SegmentedControl, controlClass, cn,
} from '../components/ui';

export const DebtorsPage: React.FC = () => {
  const { t } = useTranslation();

  const [debtors, setDebtors] = useState<any[]>([]);
  const [totalDebtSum, setTotalDebtSum] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [overdueFilter, setOverdueFilter] = useState<'ALL' | 'OVERDUE'>('ALL');

  // To'lov oynasi
  const [selectedDebtor, setSelectedDebtor] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [accountType, setAccountType] = useState<'CASH' | 'BANK_CARD' | 'SETTLEMENT_ACCOUNT'>('CASH');
  const [paidBy, setPaidBy] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccessMsg, setPaySuccessMsg] = useState('');

  // To'lovlar tarixi oynasi
  const [historyDebtor, setHistoryDebtor] = useState<any | null>(null);

  useEffect(() => {
    fetchDebtors();
  }, [search]);

  const fetchDebtors = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await axios.get(`/api/debtors?search=${encodeURIComponent(search)}`);
      setDebtors(res.data.items || []);
      setTotalDebtSum(res.data.totalDebtSum || 0);
    } catch (err: any) {
      console.error('Fetch debtors error:', err);
      setLoadError(err.response?.data?.error || t('common.load_error'));
    } finally {
      setLoading(false);
    }
  };

  // Qarzdor ismi: server `debtorName` qaytaradi (xaridor yoki bitim mijozi), bo'lsa `customerName`
  const nameOf = (d: any): string => d.debtorName || d.customerName || d.buyerName || '';

  // Ko'p tovarli sotuv qarzi (kind = 'SALE'); `kind` yo'q qator — oddiy bitim qarzi
  const isSale = (d: any): boolean => d?.kind === 'SALE' && !!(d.saleId || d.id);
  const numberOf = (d: any): string => String((isSale(d) ? d.saleNumber ?? d.dealNumber : d.dealNumber) ?? '—');
  const saleLine = (d: any): string =>
    t('debtors.saleLine', { number: d.saleNumber ?? '—', count: Number(d.itemsCount) || 0 });

  const handleOpenPay = (debtor: any) => {
    setSelectedDebtor(debtor);
    setPayAmount(debtor.debtRemainder);
    setPaidBy(nameOf(debtor));
    setAccountType('CASH');
    setPayNote('');
    setPayError('');
    setPaySuccessMsg('');
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebtor) return;
    if (payAmount <= 0) {
      setPayError(t('debtors.amountError'));
      return;
    }

    try {
      setPaying(true);
      setPayError('');
      // Sotuv qarzi sotuvning o'z to'lov manziliga, bitim qarzi eski manzilga yuboriladi
      const res = isSale(selectedDebtor)
        ? await axios.post(`/api/sales/${selectedDebtor.saleId || selectedDebtor.id}/payments`, {
            amount: payAmount,
            accountType,
            note: payNote || undefined,
          })
        : await axios.post(`/api/debtors/${selectedDebtor.id}/payment`, {
            amount: payAmount,
            accountType,
            paidBy,
            note: payNote,
          });

      setPaySuccessMsg(res.data?.message || t('debtors.paySuccess'));
      setTimeout(() => {
        setSelectedDebtor(null);
        fetchDebtors();
      }, 1200);
    } catch (err: any) {
      setPayError(err.response?.data?.error || err.message);
    } finally {
      setPaying(false);
    }
  };

  const filtered = debtors.filter((d) => {
    if (overdueFilter === 'OVERDUE') return d.isOverdue;
    return true;
  });

  const overdueCount = debtors.filter((d) => d.isOverdue).length;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={<CreditCard className="h-5 w-5" />}
        title={t('menu.debtors')}
        description={t('debtors.subtitle')}
      />

      {loadError && (
        <div role="alert" className="rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      {/* KPI kartalar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          title={t('debtors.totalDebt')}
          value={formatMoney(totalDebtSum)}
          hint={t('debtors.totalDebtHint')}
          tone="danger"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          title={t('debtors.active')}
          value={t('debtors.countValue', { count: debtors.length })}
          hint={t('debtors.activeHint')}
          tone="info"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <StatCard
          title={t('debtors.overdue')}
          value={t('debtors.countValue', { count: overdueCount })}
          hint={t('debtors.overdueHint')}
          tone="warning"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title={t('debtors.blockTitle')}
          value={<span className="text-sm font-semibold leading-snug">{t('debtors.blockText')}</span>}
          hint={t('debtors.blockHint')}
          tone="brand"
          icon={<Lock className="h-5 w-5" />}
        />
      </div>

      {/* Qidiruv va filtr */}
      <Card padding="sm" className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <Input
            type="text"
            leftIcon={<Search />}
            placeholder={t('debtors.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <SegmentedControl
          value={overdueFilter}
          onChange={(v) => setOverdueFilter(v as 'ALL' | 'OVERDUE')}
          items={[
            { value: 'ALL', label: t('debtors.filterAll', { count: debtors.length }) },
            {
              value: 'OVERDUE',
              label: t('debtors.filterOverdue', { count: overdueCount }),
              icon: <AlertTriangle className="h-3.5 w-3.5" />,
            },
          ]}
        />
      </Card>

      {/* Jadval */}
      <Card padding="none">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-fg-muted lg:hidden">
          <span>{t('debtors.swipeHint')}</span>
          <span className="font-semibold tabular-nums text-danger">{t('debtors.listCount', { count: filtered.length })}</span>
        </div>
        <TableContainer bare>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('debtors.col.receipt')}</Th>
                <Th>{t('common.date')}</Th>
                <Th>{t('debtors.col.customer')}</Th>
                <Th>{t('debtors.col.store')}</Th>
                <Th>{t('debtors.col.product')}</Th>
                <Th align="right">{t('debtors.col.salePrice')}</Th>
                <Th align="right">{t('debtors.col.paid')}</Th>
                <Th align="right">{t('debtors.col.remaining')}</Th>
                <Th align="center">{t('debtors.col.dueDate')}</Th>
                <Th align="center">{t('common.status')}</Th>
                <Th align="center" className="sticky right-0 z-20">{t('common.actions')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <tr>
                  <td colSpan={11}>
                    <LoadingBlock label={t('debtors.loading')} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <TableEmpty colSpan={11} title={t('debtors.empty')} />
              ) : (
                filtered.map((d) => (
                  <Tr key={`${d.kind || 'DEAL'}-${d.saleId || d.id}`}>
                    <Td numeric className="font-mono font-semibold text-accent">
                      №{numberOf(d)}
                    </Td>
                    <Td numeric className="text-fg-muted">
                      {formatDate(d.date)}
                    </Td>
                    <Td>
                      <div className="text-xs font-semibold text-fg">{nameOf(d) || '—'}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-fg-muted">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{d.customerPhone1 || d.customerPhone || '—'}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-fg-muted">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{d.customerPhone2 || '—'}</span>
                      </div>
                    </Td>
                    <Td className="font-medium text-fg-secondary">{d.storeName}</Td>
                    <Td>
                      {isSale(d) ? (
                        <>
                          <div className="whitespace-nowrap font-medium text-fg">{saleLine(d)}</div>
                          {d.productName && <div className="text-xs text-fg-muted">{d.productName}</div>}
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-fg">{d.productName}</div>
                          <div className="font-mono text-xs text-fg-muted">{d.imeiBarcode}</div>
                        </>
                      )}
                    </Td>
                    <Td align="right" numeric className="text-fg-secondary">
                      {formatMoney(d.salePrice)}
                    </Td>
                    <Td align="right" numeric className="font-semibold text-success">
                      {formatMoney(d.receivedFromBuyer)}
                    </Td>
                    <Td align="right" numeric className="font-semibold text-danger">
                      {formatMoney(d.debtRemainder)}
                    </Td>
                    <Td align="center" className="whitespace-nowrap">
                      {d.debtDueDate ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span
                            className={cn(
                              'text-xs font-medium tabular-nums',
                              d.isOverdue ? 'font-semibold text-danger' : 'text-fg-secondary'
                            )}
                          >
                            {formatDate(d.debtDueDate)}
                          </span>
                          {d.isOverdue && (
                            <Badge tone="danger" size="sm">
                              {t('debtors.overdueBadge')}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </Td>
                    <Td align="center">
                      <Badge tone={d.receivedFromBuyer > 0 ? 'warning' : 'danger'}>
                        {d.receivedFromBuyer > 0 ? t('paymentStatus.PARTIAL') : t('debtors.unpaid')}
                      </Badge>
                    </Td>
                    <Td align="center" className="sticky right-0 z-10 whitespace-nowrap bg-surface">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="success"
                          leftIcon={<DollarSign className="h-3.5 w-3.5" />}
                          onClick={() => handleOpenPay(d)}
                          title={t('debtors.payTooltip')}
                        >
                          {t('debtors.payButton')}
                        </Button>
                        {d.payments && d.payments.length > 0 && (
                          <Button
                            size="icon"
                            variant="secondary"
                            onClick={() => setHistoryDebtor(d)}
                            title={t('debtors.historyTooltip')}
                            aria-label={t('debtors.historyTooltip')}
                          >
                            <History className="h-4 w-4 text-accent" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </TableContainer>
      </Card>

      {/* To'lov oynasi */}
      <Modal
        open={!!selectedDebtor}
        onClose={() => setSelectedDebtor(null)}
        size="md"
        title={
          <span className="flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-success" />
            {t('debtors.payTitle')}
          </span>
        }
        description={
          selectedDebtor
            ? isSale(selectedDebtor)
              ? `${saleLine(selectedDebtor)} — ${nameOf(selectedDebtor) || '—'}`
              : t('debtors.receiptLine', { number: selectedDebtor.dealNumber, name: nameOf(selectedDebtor) || '—' })
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedDebtor(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              form="debtor-pay-form"
              variant="success"
              loading={paying}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              {t('debtors.submit')}
            </Button>
          </>
        }
      >
        {selectedDebtor && (
          <div className="space-y-4">
            {/* Hozirgi qarz */}
            <div className="flex items-center justify-between rounded-card border border-line bg-surface-2 p-3.5">
              <div>
                <span className="block text-xs text-fg-muted">{t('debtors.currentDebt')}</span>
                <span className="text-lg font-semibold tabular-nums text-danger">
                  {formatMoney(selectedDebtor.debtRemainder)}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-xs text-fg-muted">{t('debtors.afterPayment')}</span>
                <span className="text-lg font-semibold tabular-nums text-success">
                  {formatMoney(Math.max(0, selectedDebtor.debtRemainder - (Number(payAmount) || 0)))}
                </span>
              </div>
            </div>

            {payError && (
              <div role="alert" className="rounded-control border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
                {payError}
              </div>
            )}

            {paySuccessMsg && (
              <div className="flex items-center gap-1.5 rounded-control border border-success/30 bg-success-soft p-3 text-xs font-semibold text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{paySuccessMsg}</span>
              </div>
            )}

            <form id="debtor-pay-form" onSubmit={handlePaySubmit} className="space-y-3">
              <Field label={t('debtors.payAmount')} required>
                <AmountInput
                  required
                  placeholder={t('debtors.amountPlaceholder')}
                  value={payAmount}
                  onChange={(val) => setPayAmount(val)}
                  className={cn(controlClass, 'font-semibold tabular-nums')}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setPayAmount(selectedDebtor.debtRemainder)}>
                    {t('debtors.payFull')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPayAmount(Math.round(selectedDebtor.debtRemainder / 2))}
                  >
                    {t('debtors.payHalf')}
                  </Button>
                </div>
              </Field>

              <Field label={t('debtors.account')} required hint={t('debtors.ddsNote')}>
                <Select value={accountType} onChange={(e: any) => setAccountType(e.target.value)}>
                  <option value="CASH">{t('accounts.CASH')}</option>
                  <option value="BANK_CARD">{t('accounts.BANK_CARD')}</option>
                  <option value="SETTLEMENT_ACCOUNT">{t('accounts.SETTLEMENT_ACCOUNT')}</option>
                </Select>
              </Field>

              {/* Sotuv to'lovi manzili `paidBy` ni qabul qilmaydi — maydon faqat bitim qarzida */}
              {!isSale(selectedDebtor) && (
                <Field label={t('debtors.paidBy')}>
                  <Input
                    type="text"
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    placeholder={t('debtors.paidByPlaceholder')}
                  />
                </Field>
              )}

              <Field label={t('debtors.noteLabel')}>
                <Input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder={t('debtors.notePlaceholder')}
                />
              </Field>
            </form>
          </div>
        )}
      </Modal>

      {/* To'lovlar tarixi oynasi */}
      <Modal
        open={!!historyDebtor}
        onClose={() => setHistoryDebtor(null)}
        size="md"
        title={
          <span className="flex items-center gap-1.5">
            <History className="h-4 w-4 text-accent" />
            {t('debtors.historyTitle')}
          </span>
        }
        description={
          historyDebtor
            ? isSale(historyDebtor)
              ? `${saleLine(historyDebtor)} — ${nameOf(historyDebtor) || '—'}`
              : t('debtors.receiptLine', { number: historyDebtor.dealNumber, name: nameOf(historyDebtor) || '—' })
            : undefined
        }
        footer={
          <Button variant="secondary" onClick={() => setHistoryDebtor(null)}>
            {t('common.close')}
          </Button>
        }
      >
        {historyDebtor && (
          <div className="space-y-2">
            {historyDebtor.payments && historyDebtor.payments.length > 0 ? (
              historyDebtor.payments.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-control border border-line bg-surface-2 p-3 text-xs"
                >
                  <div>
                    <span className="block text-sm font-semibold tabular-nums text-success">
                      +{formatMoney(p.amount)}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {t(`accounts.${p.accountType}`, p.accountType)} • {p.paidBy || t('debtors.defaultPayer')}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs tabular-nums text-fg-secondary">{formatDate(p.date)}</span>
                    <span className="text-xs text-fg-muted">{p.note || '—'}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-fg-muted">{t('debtors.historyEmpty')}</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
export default DebtorsPage;
