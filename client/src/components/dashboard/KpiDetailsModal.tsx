import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Search, SearchX, Inbox } from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  type DateRangeValue,
} from '../ui';
import { useTranslation } from '../../context/LanguageContext';
import { formatMoney, formatNumber } from '../../utils/format';
import { apiErrorMessage, periodLabel, rangeParams } from './period';

export const KPI_METRICS = [
  'totalDeals',
  'totalLimitVolume',
  'totalAgentCommission',
  'totalBuyoutExpense',
  'totalPayout',
  'grossMargin',
  'totalQodirChekExpense',
] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

interface KpiDeal {
  id: string;
  dealNumber: number | string;
  dateTimeLabel: string;
  customerName: string | null;
  customerPhone1: string | null;
  storeName: string | null;
  providerName: string | null;
  agencyName: string | null;
  withdrawnLimit: number;
  value: number;
}

interface KpiDetails {
  metric: KpiMetric;
  total: number;
  count: number;
  deals: KpiDeal[];
}

interface KpiDetailsModalProps {
  /** null — modal yopiq */
  metric: KpiMetric | null;
  range: DateRangeValue;
  onClose: () => void;
}

/**
 * KPI kartochkasi bosilganda ochiladi: shu ko'rsatkichni tashkil etuvchi bitimlar ro'yxati.
 * Modal darhol ochiladi, ma'lumot ichida yuklanadi. `total` — kartochkadagi qiymatga aynan teng (server kafolati).
 */
export const KpiDetailsModal: React.FC<KpiDetailsModalProps> = ({ metric, range, onClose }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<KpiDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const requestId = useRef(0);

  const load = async (m: KpiMetric) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/deals/kpi-details', { params: { metric: m, ...rangeParams(range) } });
      if (id !== requestId.current) return; // eskirgan javob
      setData(res.data);
    } catch (err) {
      if (id !== requestId.current) return;
      setData(null);
      setError(apiErrorMessage(err, t('dashboardPage.details_error')));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!metric) {
      requestId.current++; // ochiq so'rov javobini bekor qilish
      return;
    }
    setData(null);
    setSearch('');
    load(metric);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, range.startDate, range.endDate]);

  const isCount = metric === 'totalDeals';
  const formatValue = (v: number) => (isCount ? formatNumber(v) : formatMoney(v));

  const deals = data?.deals ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter((d) =>
      [d.dealNumber, d.customerName, d.customerPhone1, d.storeName, d.providerName, d.agencyName, d.dateTimeLabel]
        .filter((v) => v !== null && v !== undefined)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [deals, search]);

  const filteredSum = useMemo(() => filtered.reduce((s, d) => s + (Number(d.value) || 0), 0), [filtered]);
  const isFiltered = search.trim() !== '' && data !== null;

  const title = metric ? t('dashboardPage.details_title', { metric: t(`dashboardPage.kpi_${metric}`) }) : '';

  return (
    <Modal
      open={metric !== null}
      onClose={onClose}
      size="full"
      flush
      title={title}
      description={t('dashboardPage.period_shown', { period: periodLabel(range, t) })}
      footer={
        data ? (
          <div className="flex w-full flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-fg-muted">
              {isFiltered
                ? t('dashboardPage.details_shown', { shown: filtered.length, count: data.count })
                : t('dashboardPage.details_count', { count: data.count })}
              {isFiltered && !isCount && (
                <span className="ml-2 tabular-nums">
                  {t('dashboardPage.details_found_sum', { sum: formatMoney(filteredSum) })}
                </span>
              )}
            </p>
            <p className="text-sm font-semibold text-fg">
              {t('common.total')}: <span className="tabular-nums">{formatValue(data.total)}</span>
            </p>
          </div>
        ) : undefined
      }
    >
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <Input
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('dashboardPage.details_search')}
          aria-label={t('dashboardPage.details_search')}
          leftIcon={<Search />}
        />
      </div>

      {loading && !data && <LoadingBlock label={t('common.loading')} />}

      {error && !loading && (
        <EmptyState
          icon={<AlertCircle />}
          title={t('common.load_error')}
          description={error}
          action={
            <Button variant="secondary" onClick={() => metric && load(metric)}>
              {t('common.retry')}
            </Button>
          }
        />
      )}

      {data && deals.length === 0 && (
        <EmptyState icon={<Inbox />} title={t('dashboardPage.details_empty')} description={t('dashboardPage.details_empty_hint')} />
      )}

      {data && deals.length > 0 && filtered.length === 0 && (
        <EmptyState icon={<SearchX />} title={t('dashboardPage.details_no_match')} />
      )}

      {data && filtered.length > 0 && (
        <TableContainer bare>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('dashboardPage.col_deal')}</Th>
                <Th>{t('dashboardPage.col_datetime')}</Th>
                <Th>{t('common.customer')}</Th>
                <Th>{t('dashboardPage.col_store_provider')}</Th>
                <Th>{t('common.agency')}</Th>
                <Th align="right">{t('dashboardPage.col_withdrawn')}</Th>
                <Th align="right">{t('dashboardPage.col_share')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtered.map((d) => (
                <Tr key={d.id}>
                  <Td numeric className="font-medium">
                    №{d.dealNumber}
                  </Td>
                  <Td numeric className="text-fg-secondary">
                    {d.dateTimeLabel || '-'}
                  </Td>
                  <Td>
                    <span className="block max-w-[14rem] truncate font-medium" title={d.customerName || ''}>
                      {d.customerName || '-'}
                    </span>
                    {d.customerPhone1 && <span className="block text-xs tabular-nums text-fg-muted">{d.customerPhone1}</span>}
                  </Td>
                  <Td>
                    <span className="block whitespace-nowrap">{d.storeName || '-'}</span>
                    {d.providerName && <span className="block whitespace-nowrap text-xs text-fg-muted">{d.providerName}</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-fg-secondary">{d.agencyName || '-'}</Td>
                  <Td align="right" numeric>
                    {formatMoney(d.withdrawnLimit)}
                  </Td>
                  <Td align="right" numeric className="font-semibold">
                    {formatValue(d.value)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
    </Modal>
  );
};
