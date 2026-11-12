import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Bot, CheckCircle, Clock, ExternalLink, Search, RefreshCw,
  ArrowRight, ShieldCheck, AlertCircle, Phone, Smartphone, FileText, Trash2, X,
  Wallet, ListChecks,
} from 'lucide-react';
import { formatMoney, formatDateTime } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import {
  PageHeader, Card, CardHeader, StatCard, Button, Badge, Modal, Input, Select,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, LoadingBlock, cn,
} from '../components/ui';

interface BotDeal {
  id: string;
  checkNumber?: number;
  dateTime: string;
  telegramUserId: string | null;
  telegramUsername: string | null;
  sellerName: string | null;
  providerName: string | null;
  isDaftar: boolean;
  customerName: string;
  customerPhone1: string;
  customerPhone2: string | null;
  contractUrl: string | null;
  passportPhotoUrl: string | null;
  storeName: string | null;
  customerLimit: number;
  withdrawnLimit: number;
  productName: string | null;
  quantity: number;
  imeiBarcode: string | null;
  status: string;
  agencyName: string | null;
  agentName: string | null;
  isApproved: boolean;
  createdAt: string;
  payments: any[];
}

export const BotDealsPage: React.FC = () => {
  const { t } = useTranslation();
  const [deals, setDeals] = useState<BotDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchDeals = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/bot/deals');
      setDeals(res.data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(t('botDeals.load_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeals();
  }, []);

  const handleApprove = async (id: string) => {
    if (!window.confirm(t('botDeals.approve_confirm'))) return;
    try {
      setApprovingId(id);
      setErrorMsg('');
      const res = await axios.post(`/api/bot/deals/${id}/approve`);
      setSuccessMsg(t('botDeals.approve_success', { number: res.data.mainDeal.dealNumber }));
      fetchDeals();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || t('botDeals.approve_error'));
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async (id: string, checkNumber?: number) => {
    const confirmText = checkNumber
      ? t('botDeals.delete_confirm_check', { number: checkNumber })
      : t('botDeals.delete_confirm');
    if (!window.confirm(confirmText)) {
      return;
    }
    try {
      setDeletingId(id);
      setErrorMsg('');
      const res = await axios.delete(`/api/bot/deals/${id}`);
      setSuccessMsg(res.data.message || t('botDeals.delete_success'));
      fetchDeals();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || t('botDeals.delete_error'));
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDeals = deals.filter(d => {
    const s = search.toLowerCase();
    const matchSearch =
      d.customerName.toLowerCase().includes(s) ||
      d.customerPhone1.includes(s) ||
      (d.productName && d.productName.toLowerCase().includes(s)) ||
      (d.telegramUsername && d.telegramUsername.toLowerCase().includes(s)) ||
      (d.providerName && d.providerName.toLowerCase().includes(s)) ||
      (d.storeName && d.storeName.toLowerCase().includes(s));

    if (statusFilter === 'APPROVED') return matchSearch && d.isApproved;
    if (statusFilter === 'PENDING') return matchSearch && !d.isApproved;
    return matchSearch;
  });

  const totalWithdrawn = filteredDeals.reduce((sum, d) => sum + Number(d.withdrawnLimit || 0), 0);
  const pendingCount = deals.filter(d => !d.isApproved).length;
  const approvedCount = deals.filter(d => d.isApproved).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Sahifa sarlavhasi */}
      <PageHeader
        className="mb-0 sm:mb-0"
        icon={<Bot />}
        title={t('menu.bot_deals')}
        description={t('botDeals.subtitle')}
        actions={
          <Button
            variant="secondary"
            onClick={fetchDeals}
            leftIcon={<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />}
          >
            {t('common.refresh')}
          </Button>
        }
      />

      {/* Xabarlar */}
      {successMsg && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-card bg-success-soft px-4 py-2 text-sm text-success">
          <div className="flex min-w-0 items-center gap-2">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words">{successMsg}</span>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-success hover:text-success" aria-label={t('common.close')} onClick={() => setSuccessMsg('')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-card bg-danger-soft px-4 py-2 text-sm text-danger">
          <div className="flex min-w-0 items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="min-w-0 break-words">{errorMsg}</span>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-danger hover:text-danger" aria-label={t('common.close')} onClick={() => setErrorMsg('')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Ko'rsatkichlar */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard title={t('common.all')} value={deals.length} hint={t('botDeals.stat_all_hint')} icon={<ListChecks />} tone="brand" />
        <StatCard title={t('dealStatus.PENDING')} value={pendingCount} hint={t('botDeals.stat_pending_hint')} icon={<Clock />} tone="warning" />
        <StatCard title={t('approval.APPROVED')} value={approvedCount} hint={t('botDeals.stat_approved_hint')} icon={<CheckCircle />} tone="success" />
        <StatCard title={t('common.withdrawn_limit')} value={formatMoney(totalWithdrawn)} hint={t('botDeals.stat_withdrawn_hint')} icon={<Wallet />} />
      </div>

      {/* Filtrlar */}
      <Card className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="w-full min-w-0 flex-1">
          <Input
            type="text"
            leftIcon={<Search />}
            placeholder={t('botDeals.search_placeholder')}
            aria-label={t('botDeals.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <span className="whitespace-nowrap text-xs font-medium text-fg-secondary">{t('common.status')}:</span>
          <div className="min-w-0 flex-1 md:w-56 md:flex-none">
            <Select
              aria-label={t('common.status')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">{t('common.all')} ({deals.length})</option>
              <option value="PENDING">{t('dealStatus.PENDING')} ({pendingCount})</option>
              <option value="APPROVED">{t('approval.APPROVED')} ({approvedCount})</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Jadval */}
      <Card padding="none" className="overflow-hidden">
        <CardHeader
          bordered
          title={t('botDeals.list_title')}
          description={<span className="lg:hidden">{t('botDeals.scroll_hint')}</span>}
          actions={<Badge tone="brand" className="tabular-nums">{t('botDeals.count', { count: filteredDeals.length })}</Badge>}
        />
        <TableContainer bare>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('common.date_time')}</Th>
                <Th>{t('common.customer_contact')}</Th>
                <Th>{t('common.provider')}</Th>
                <Th>{t('common.store')}</Th>
                <Th align="right">{t('common.limit')}</Th>
                <Th align="right">{t('common.withdrawn_limit')}</Th>
                <Th>{t('common.product_qty')}</Th>
                <Th>{t('common.operator_tg')}</Th>
                <Th align="center">{t('common.documents')}</Th>
                <Th align="center">{t('common.status')}</Th>
                {/* Amallar ustuni katta ekranda o'ngga yopishib turadi */}
                <Th align="center" className="border-l lg:sticky lg:right-0">{t('common.actions')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <tr>
                  <td colSpan={11}>
                    <LoadingBlock label={t('botDeals.loading')} />
                  </td>
                </tr>
              ) : filteredDeals.length === 0 ? (
                <TableEmpty colSpan={11} title={t('botDeals.empty')} icon={<Bot />} />
              ) : (
                filteredDeals.map((deal) => (
                  <Tr key={deal.id}>
                    <Td numeric className="text-fg-secondary">
                      {formatDateTime(deal.dateTime)}
                    </Td>
                    <Td>
                      <div className="font-medium text-fg">{deal.customerName}</div>
                      <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs tabular-nums text-fg-muted">
                        <Phone className="h-3 w-3 shrink-0" />
                        {deal.customerPhone1}
                        {deal.customerPhone2 && <span>/ {deal.customerPhone2}</span>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Badge tone="info" size="sm">{deal.providerName || t('botDeals.unknown_provider')}</Badge>
                        {deal.isDaftar && <Badge tone="danger" size="sm">{t('botDeals.daftar')}</Badge>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-fg-secondary">
                      {deal.storeName || '-'}
                    </Td>
                    <Td align="right" numeric className="text-fg-secondary">
                      {formatMoney(deal.customerLimit)}
                    </Td>
                    <Td align="right" numeric className="font-semibold text-fg">
                      {formatMoney(deal.withdrawnLimit)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1 font-medium text-fg">
                        <Smartphone className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
                        {deal.productName || t('botDeals.unknown_product')}
                      </div>
                      <div className="text-xs tabular-nums text-fg-muted">
                        {deal.quantity} {t('common.pieces')} {deal.imeiBarcode ? `• IMEI: ${deal.imeiBarcode}` : ''}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="font-medium text-fg">
                        {deal.telegramUsername ? `@${deal.telegramUsername}` : deal.sellerName || t('botDeals.telegram_bot')}
                      </div>
                      <div className="text-xs tabular-nums text-fg-muted">ID: {deal.telegramUserId || '-'}</div>
                    </Td>
                    <Td align="center" className="whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {deal.contractUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedImage(deal.contractUrl)}
                            title={t('botDeals.view_contract')}
                            aria-label={t('botDeals.view_contract')}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                        {deal.passportPhotoUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedImage(deal.passportPhotoUrl)}
                            title={t('botDeals.view_passport')}
                            aria-label={t('botDeals.view_passport')}
                          >
                            <ShieldCheck className="h-4 w-4 text-success" />
                          </Button>
                        )}
                        {!deal.contractUrl && !deal.passportPhotoUrl && (
                          <span className="text-xs text-fg-muted">-</span>
                        )}
                      </div>
                    </Td>
                    <Td align="center" className="whitespace-nowrap">
                      {deal.isApproved ? (
                        <Badge tone="success" icon={<CheckCircle className="h-3.5 w-3.5" />}>
                          {t('approval.APPROVED')}
                        </Badge>
                      ) : (
                        <Badge tone="warning" icon={<Clock className="h-3.5 w-3.5" />}>
                          {t('dealStatus.PENDING')}
                        </Badge>
                      )}
                    </Td>
                    <Td align="center" className="whitespace-nowrap border-l bg-surface lg:sticky lg:right-0">
                      <div className="inline-flex items-center gap-2">
                        {!deal.isApproved ? (
                          <Button
                            size="sm"
                            onClick={() => handleApprove(deal.id)}
                            disabled={approvingId === deal.id || deletingId === deal.id}
                            loading={approvingId === deal.id}
                            leftIcon={<ArrowRight className="h-3.5 w-3.5" />}
                            title={t('botDeals.approve_title')}
                          >
                            {t('common.approve')}
                          </Button>
                        ) : (
                          <span className="px-2 text-xs font-medium text-fg-muted">{t('botDeals.moved')}</span>
                        )}

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(deal.id, deal.checkNumber)}
                          disabled={deletingId === deal.id || approvingId === deal.id}
                          loading={deletingId === deal.id}
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                          title={t('botDeals.delete_title')}
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

      {/* Hujjat / rasm ko'rish oynasi */}
      <Modal
        open={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        title={t('botDeals.preview_title')}
        size="lg"
        footer={
          selectedImage && (
            <a
              href={selectedImage}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-touch items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 sm:min-h-[2.5rem]"
            >
              <ExternalLink className="h-4 w-4" />
              {t('botDeals.open_new_tab')}
            </a>
          )
        }
      >
        {selectedImage && (
          <div className="flex justify-center">
            <img
              src={selectedImage}
              alt={t('botDeals.preview_alt')}
              className="max-h-[70vh] rounded-control object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
                alert(t('botDeals.image_error'));
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};
export default BotDealsPage;
