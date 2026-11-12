import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard, FileSpreadsheet, Plus, CheckCircle, Search, RefreshCw,
  TrendingUp, DollarSign, ShieldCheck, ShoppingCart, Trash2, Wallet
} from 'lucide-react';
import { formatMoney, formatDateTime, formatDate, formatPercent } from '../utils/format';
import { AmountInput } from '../components/AmountInput';
import { useTranslation } from '../context/LanguageContext';
import {
  Badge, Button, Card, Field, Input, LoadingBlock, Modal, PageHeader, Select, StatCard,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, Tabs, cn, controlClass
} from '../components/ui';

// Modal ichidagi forma identifikatori — pastki paneldagi "Saqlash" tugmasi shu formani yuboradi
const REPORT_FORM_ID = 'bot-operator-report-form';

interface BotPayment {
  id: string;
  botDealId: string | null;
  receiptNumber: string | null;
  dateTime: string;
  operatorId: string;
  stage: string | null;
  paymentType: string;
  currencyAmount: number;
  exchangeRate: number;
  amountUzs: number;
  isVerified: boolean;
  botDeal?: any;
}

interface OperatorReport {
  id: string;
  agentName: string;
  date: string;
  operatorName: string;
  appName: string;
  calculatedPct: number;
  productName: string;
  actualPrice: number;
  purchasePrice: number;
  paidAmount: number;
  profit: number;
  storeName: string | null;
  checkNumber: string | null;
  responsible: string | null;
}

export const BotPaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'OPERATOR_REPORTS'>('PAYMENTS');
  
  // 1-tab holati
  const [payments, setPayments] = useState<BotPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [searchPayments, setSearchPayments] = useState('');

  // 2-tab holati
  const [reports, setReports] = useState<OperatorReport[]>([]);
  const [reportTotals, setReportTotals] = useState({ totalActual: 0, totalPurchase: 0, totalPaid: 0, totalProfit: 0 });
  const [loadingReports, setLoadingReports] = useState(true);
  const [searchReports, setSearchReports] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Forma holati
  const [formData, setFormData] = useState({
    agentName: 'Asadbek',
    date: new Date().toISOString().split('T')[0],
    operatorName: '',
    appName: 'Imanum',
    calculatedPct: 0.22,
    productName: '',
    actualPrice: '',
    storeName: 'Denov',
    checkNumber: '',
    responsible: 'Laziz',
  });

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const fetchPayments = async () => {
    try {
      setLoadingPayments(true);
      const res = await axios.get('/api/bot/payments');
      setPayments(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPayments(false);
    }
  };

  const fetchReports = async () => {
    try {
      setLoadingReports(true);
      const res = await axios.get('/api/bot/operator-reports');
      setReports(res.data.reports || []);
      setReportTotals(res.data.totals || { totalActual: 0, totalPurchase: 0, totalPaid: 0, totalProfit: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchReports();
  }, []);

  const handleVerifyPayment = async (id: string, current: boolean) => {
    try {
      await axios.post(`/api/bot/payments/${id}/verify`, { isVerified: !current });
      setPayments(payments.map(p => p.id === id ? { ...p, isVerified: !current } : p));
    } catch (err) {
      console.error(err);
      alert(t('botPayments.verify_error'));
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await axios.post('/api/bot/operator-reports', formData);
      setShowAddModal(false);
      setStatusMsg(t('botPayments.saved'));
      fetchReports();
      setTimeout(() => setStatusMsg(''), 4000);
      setFormData({
        agentName: 'Asadbek',
        date: new Date().toISOString().split('T')[0],
        operatorName: '',
        appName: 'Imanum',
        calculatedPct: 0.22,
        productName: '',
        actualPrice: '',
        storeName: 'Denov',
        checkNumber: '',
        responsible: 'Laziz',
      });
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || t('common.save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!window.confirm(t('botPayments.confirm_delete'))) return;
    try {
      await axios.delete(`/api/bot/operator-reports/${id}`);
      fetchReports();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.delete_error'));
    }
  };

  const handleClearAllReports = async () => {
    const conf = window.prompt(t('botPayments.clear_prompt'));
    if (!conf) return;
    try {
      // Kod serverda tekshiriladi; faqat ADMIN roli bajara oladi
      await axios.delete('/api/bot/operator-reports/all', { data: { confirmCode: conf } });
      fetchReports();
      alert(t('botPayments.cleared'));
    } catch (err: any) {
      alert(err.response?.data?.error || t('botPayments.clear_error'));
    }
  };

  const filteredPayments = payments.filter(p => {
    const s = searchPayments.toLowerCase();
    return (
      (p.receiptNumber && p.receiptNumber.toLowerCase().includes(s)) ||
      (p.operatorId && p.operatorId.toLowerCase().includes(s)) ||
      (p.paymentType && p.paymentType.toLowerCase().includes(s)) ||
      (p.stage && p.stage.toLowerCase().includes(s))
    );
  });

  const filteredReports = reports.filter(r => {
    const s = searchReports.toLowerCase();
    return (
      r.operatorName.toLowerCase().includes(s) ||
      r.agentName.toLowerCase().includes(s) ||
      r.appName.toLowerCase().includes(s) ||
      r.productName.toLowerCase().includes(s) ||
      (r.checkNumber && r.checkNumber.toLowerCase().includes(s)) ||
      (r.storeName && r.storeName.toLowerCase().includes(s))
    );
  });

  const setField = (patch: Partial<typeof formData>) => setFormData({ ...formData, ...patch });

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        icon={<CreditCard />}
        title={t('botPayments.title')}
        description={t('botPayments.subtitle')}
        actions={
          <>
            {activeTab === 'OPERATOR_REPORTS' && isAdmin && (
              <Button
                variant="secondary"
                className="text-danger"
                onClick={handleClearAllReports}
                title={t('botPayments.clearAll_title')}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                {t('botPayments.clearAll')}
              </Button>
            )}
            {activeTab === 'OPERATOR_REPORTS' && (
              <Button onClick={() => setShowAddModal(true)} leftIcon={<Plus className="h-4 w-4" />}>
                {t('botPayments.addReceipt')}
              </Button>
            )}
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              onClick={() => { fetchPayments(); fetchReports(); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {statusMsg && (
        <div role="status" className="flex items-center gap-2 rounded-card bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle className="h-5 w-5 shrink-0" />
          {statusMsg}
        </div>
      )}

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'PAYMENTS', label: t('botPayments.tab_payments'), icon: <CreditCard />, count: payments.length },
          { value: 'OPERATOR_REPORTS', label: t('botPayments.tab_reports'), icon: <FileSpreadsheet />, count: reports.length },
        ]}
      />

      {/* 1-tab: bot to'lovlari */}
      {activeTab === 'PAYMENTS' && (
        <div className="space-y-4">
          <Input
            type="text"
            leftIcon={<Search />}
            placeholder={t('botPayments.search_payments')}
            aria-label={t('botPayments.search_payments')}
            value={searchPayments}
            onChange={(e) => setSearchPayments(e.target.value)}
          />

          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('common.date_time')}</Th>
                  <Th>{t('botPayments.col_receiptNo')}</Th>
                  <Th>{t('botPayments.col_operatorId')}</Th>
                  <Th>{t('botPayments.col_stage')}</Th>
                  <Th>{t('botPayments.col_paymentType')}</Th>
                  <Th align="right">{t('botPayments.col_currencyAmount')}</Th>
                  <Th align="right">{t('botPayments.col_rate')}</Th>
                  <Th align="right">{t('botPayments.col_amountUzs')}</Th>
                  <Th align="center">{t('botPayments.col_verification')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {loadingPayments ? (
                  <tr>
                    <td colSpan={9}>
                      <LoadingBlock label={t('botPayments.loading_payments')} />
                    </td>
                  </tr>
                ) : filteredPayments.length === 0 ? (
                  <TableEmpty colSpan={9} title={t('botPayments.empty_payments')} />
                ) : (
                  filteredPayments.map((p) => (
                    <Tr key={p.id}>
                      <Td numeric className="text-fg-secondary">{formatDateTime(p.dateTime)}</Td>
                      <Td numeric className="font-semibold">{p.receiptNumber || '-'}</Td>
                      <Td className="whitespace-nowrap text-fg-secondary">{p.operatorId}</Td>
                      <Td>
                        <Badge size="sm">{p.stage || t('botPayments.stageMain')}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap font-medium">{p.paymentType}</Td>
                      <Td align="right" numeric>{Number(p.currencyAmount).toLocaleString('ru-RU')}</Td>
                      <Td align="right" numeric className="text-fg-muted">{Number(p.exchangeRate).toLocaleString('ru-RU')}</Td>
                      <Td align="right" numeric className="font-semibold">{formatMoney(p.amountUzs)}</Td>
                      <Td align="center">
                        <button
                          type="button"
                          onClick={() => handleVerifyPayment(p.id, p.isVerified)}
                          aria-pressed={p.isVerified}
                          className={cn(
                            'inline-flex min-h-touch items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium transition-colors hover:brightness-95 sm:min-h-[1.75rem]',
                            p.isVerified ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                          )}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {p.isVerified ? t('botPayments.verified') : t('botPayments.unverified')}
                        </button>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* 2-tab: operatorlar hisoboti */}
      {activeTab === 'OPERATOR_REPORTS' && (
        <div className="space-y-4 sm:space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <StatCard title={t('botPayments.stat_actual')} value={formatMoney(reportTotals.totalActual)} hint={t('botPayments.stat_actual_hint')} icon={<ShoppingCart />} />
            <StatCard title={t('botPayments.stat_purchase')} value={formatMoney(reportTotals.totalPurchase)} hint={t('botPayments.stat_purchase_hint')} icon={<DollarSign />} tone="info" />
            <StatCard title={t('botPayments.stat_paid')} value={formatMoney(reportTotals.totalPaid)} hint={t('botPayments.stat_paid_hint')} icon={<Wallet />} tone="warning" />
            <StatCard title={t('botPayments.stat_profit')} value={formatMoney(reportTotals.totalProfit)} hint={t('botPayments.stat_profit_hint')} icon={<TrendingUp />} tone="success" />
          </div>

          <Input
            type="text"
            leftIcon={<Search />}
            placeholder={t('botPayments.search_reports')}
            aria-label={t('botPayments.search_reports')}
            value={searchReports}
            onChange={(e) => setSearchReports(e.target.value)}
          />

          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('botPayments.col_checkNo')}</Th>
                  <Th>{t('botPayments.col_operator')}</Th>
                  <Th>{t('botPayments.col_agent')}</Th>
                  <Th>{t('botPayments.col_app')}</Th>
                  <Th align="right">{t('botPayments.col_calcPct')}</Th>
                  <Th>{t('botPayments.col_product')}</Th>
                  <Th align="right">{t('botPayments.col_actualPrice')}</Th>
                  <Th align="right">{t('botPayments.col_purchasePrice')}</Th>
                  <Th align="right">{t('botPayments.col_paidAmount')}</Th>
                  <Th align="right">{t('botPayments.col_profit')}</Th>
                  <Th>{t('botPayments.col_store')}</Th>
                  <Th align="center">{t('common.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {loadingReports ? (
                  <tr>
                    <td colSpan={13}>
                      <LoadingBlock label={t('botPayments.loading_reports')} />
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <TableEmpty colSpan={13} title={t('botPayments.empty_reports')} description={t('botPayments.empty_reports_hint')} />
                ) : (
                  filteredReports.map((r) => (
                    <Tr key={r.id}>
                      <Td numeric className="text-fg-secondary">{formatDate(r.date)}</Td>
                      <Td numeric className="font-semibold">{r.checkNumber || '-'}</Td>
                      <Td className="whitespace-nowrap font-medium">{r.operatorName}</Td>
                      <Td className="whitespace-nowrap text-fg-secondary">{r.agentName}</Td>
                      <Td>
                        <Badge size="sm" tone="info">{r.appName}</Badge>
                      </Td>
                      <Td align="right" numeric>{formatPercent(r.calculatedPct)}</Td>
                      <Td className="min-w-[10rem] font-medium">{r.productName}</Td>
                      <Td align="right" numeric>{formatMoney(r.actualPrice)}</Td>
                      <Td align="right" numeric>{formatMoney(r.purchasePrice)}</Td>
                      <Td align="right" numeric className="text-warning">{formatMoney(r.paidAmount)}</Td>
                      <Td align="right" numeric className="font-semibold text-success">{formatMoney(r.profit)}</Td>
                      <Td className="whitespace-nowrap text-fg-secondary">{r.storeName || '-'}</Td>
                      <Td align="center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-danger hover:bg-danger-soft hover:text-danger"
                          onClick={() => handleDeleteReport(r.id)}
                          aria-label={t('botPayments.deleteReceipt')}
                          title={t('botPayments.deleteReceipt')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* Yangi operator chekini qo'shish */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t('botPayments.modal_title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form={REPORT_FORM_ID} loading={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <form id={REPORT_FORM_ID} onSubmit={handleCreateReport} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('common.date')} required>
              <Input type="date" required value={formData.date} onChange={(e) => setField({ date: e.target.value })} />
            </Field>
            <Field label={t('botPayments.f_checkNumber')}>
              <Input
                type="text"
                placeholder={t('botPayments.ph_checkNumber')}
                value={formData.checkNumber}
                onChange={(e) => setField({ checkNumber: e.target.value })}
              />
            </Field>
            <Field label={t('botPayments.f_operatorName')} required>
              <Input
                type="text"
                required
                placeholder={t('botPayments.ph_operatorName')}
                value={formData.operatorName}
                onChange={(e) => setField({ operatorName: e.target.value })}
              />
            </Field>
            <Field label={t('botPayments.f_agentName')} required>
              <Input type="text" required value={formData.agentName} onChange={(e) => setField({ agentName: e.target.value })} />
            </Field>
            <Field label={t('botPayments.f_app')}>
              <Select value={formData.appName} onChange={(e) => setField({ appName: e.target.value })}>
                <option value="Imanum">Imanum</option>
                <option value="Variant">Variant</option>
                <option value="Alif 6 oylik">Alif 6 oylik</option>
                <option value="Alif online">Alif online</option>
                <option value="Uzum Nasiya">Uzum Nasiya</option>
                <option value="Payme Nasiya">Payme Nasiya</option>
              </Select>
            </Field>
            <Field label={t('botPayments.f_calcPct')} hint={t('botPayments.f_calcPct_hint')} required>
              <Input
                type="number"
                step="0.01"
                required
                value={formData.calculatedPct}
                onChange={(e) => setField({ calculatedPct: parseFloat(e.target.value) || 0 })}
              />
            </Field>
          </div>

          <Field label={t('common.product_name')} required>
            <Input
              type="text"
              required
              placeholder={t('botPayments.ph_product')}
              value={formData.productName}
              onChange={(e) => setField({ productName: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('botPayments.f_actualPrice')} required>
              <AmountInput
                required
                placeholder="12 500 000"
                value={formData.actualPrice}
                onChange={(val) => setField({ actualPrice: String(val || '') })}
                className={cn(controlClass, 'font-semibold tabular-nums')}
              />
            </Field>
            <Field label={t('common.store')}>
              <Input type="text" value={formData.storeName} onChange={(e) => setField({ storeName: e.target.value })} />
            </Field>
          </div>

          {formData.actualPrice && (
            <Card padding="sm" className="space-y-1.5 bg-surface-2 text-sm shadow-none">
              <div className="flex justify-between gap-3">
                <span className="text-fg-secondary">{t('botPayments.preview_purchase')}</span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(Number(formData.actualPrice) * (1 - formData.calculatedPct))}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-fg-secondary">{t('botPayments.preview_paid')}</span>
                <span className="font-semibold tabular-nums text-warning">
                  {formatMoney(Number(formData.actualPrice) * 0.70)}
                </span>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-1.5">
                <span className="font-semibold">{t('botPayments.preview_profit')}</span>
                <span className="font-semibold tabular-nums text-success">
                  {formatMoney(
                    Number(formData.actualPrice) * (1 - formData.calculatedPct) - Number(formData.actualPrice) * 0.70
                  )}
                </span>
              </div>
            </Card>
          )}
        </form>
      </Modal>
    </div>
  );
};
export default BotPaymentsPage;
