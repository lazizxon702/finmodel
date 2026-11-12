import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, Save, ShieldAlert, Sparkles, Target, Zap, Wallet, Building2, HandCoins } from 'lucide-react';
import { formatMoney, formatPercent } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import {
  PageHeader, Card, CardHeader, StatCard, Button, Badge, Textarea,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, LoadingBlock, cn,
} from '../components/ui';

export const AgentSwotPage: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Boshlang'ich agentlik nomi — ma'lumot kaliti (API'dagi nom), tarjima qilinmaydi
  const [selectedAgency, setSelectedAgency] = useState<string>('Асадбек');
  const [swotForm, setSwotForm] = useState({
    strengths: '',
    weaknesses: '',
    opportunities: '',
    threats: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSwotData();
  }, []);

  const fetchSwotData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/agents/swot');
      setData(res.data);
      if (res.data.agencies?.length > 0) {
        const first = res.data.agencies[0];
        setSelectedAgency(first.agencyName);
        setSwotForm({
          strengths: first.swot?.strengths || t('agentSwot.default_strengths'),
          weaknesses: first.swot?.weaknesses || t('agentSwot.default_weaknesses'),
          opportunities: first.swot?.opportunities || t('agentSwot.default_opportunities'),
          threats: first.swot?.threats || t('agentSwot.default_threats'),
        });
      }
    } catch (err) {
      console.error('Fetch SWOT error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAgency = (agencyName: string) => {
    setSelectedAgency(agencyName);
    const agc = data?.agencies?.find((a: any) => a.agencyName === agencyName);
    if (agc) {
      setSwotForm({
        strengths: agc.swot?.strengths || '',
        weaknesses: agc.swot?.weaknesses || '',
        opportunities: agc.swot?.opportunities || '',
        threats: agc.swot?.threats || '',
      });
    }
  };

  const handleSaveSwot = async () => {
    try {
      setSaving(true);
      await axios.post(`/api/agents/swot/${selectedAgency}`, swotForm);
      alert(t('agentSwot.saved'));
      fetchSwotData();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingBlock label={t('agentSwot.loading')} />;
  }

  // SWOT kvadrantlari: maydon nomi, ikonka va ma'no rangi
  const quadrants = [
    { key: 'strengths' as const, icon: <Zap className="h-4 w-4" />, tone: 'bg-success-soft text-success' },
    { key: 'weaknesses' as const, icon: <ShieldAlert className="h-4 w-4" />, tone: 'bg-danger-soft text-danger' },
    { key: 'opportunities' as const, icon: <Sparkles className="h-4 w-4" />, tone: 'bg-info-soft text-info' },
    { key: 'threats' as const, icon: <Target className="h-4 w-4" />, tone: 'bg-warning-soft text-warning' },
  ];

  const agencies: any[] = data?.agencies || [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader className="mb-0 sm:mb-0" title={t('agentSwot.title')} description={t('agentSwot.subtitle')} />

      {/* Asosiy ko'rsatkichlar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard title={t('agentSwot.kpi_total_limit')} value={formatMoney(data?.totals?.totalLimit)} icon={<Wallet />} tone="brand" />
        <StatCard title={t('agentSwot.kpi_company_revenue')} value={formatMoney(data?.totals?.companyRevenue)} icon={<Building2 />} tone="info" />
        <StatCard title={t('agentSwot.kpi_agency_payout')} value={formatMoney(data?.totals?.agencyPayout)} icon={<HandCoins />} tone="violet" />
        <StatCard title={t('agentSwot.kpi_net_profit')} value={formatMoney(data?.totals?.netProfit)} icon={<TrendingUp />} tone="success" />
      </div>

      {/* Agentliklar solishtirma jadvali */}
      <Card padding="none" className="overflow-hidden">
        <CardHeader
          bordered
          title={t('agentSwot.ranking_title')}
          actions={<Badge tone="brand" className="tabular-nums">{t('agentSwot.agencies_count', { count: agencies.length })}</Badge>}
        />
        <TableContainer bare>
          <Table>
            <Thead>
              <Tr>
                <Th>{t('agentSwot.col_agency')}</Th>
                <Th align="right">{t('agentSwot.col_deal_count')}</Th>
                <Th align="right">{t('agentSwot.col_total_limit')}</Th>
                <Th align="right">{t('agentSwot.col_calculated_sum')}</Th>
                <Th align="right">{t('agentSwot.col_company_revenue')}</Th>
                <Th align="right">{t('agentSwot.col_agency_payout')}</Th>
                <Th align="right">{t('agentSwot.col_net_profit')}</Th>
                <Th align="right">{t('agentSwot.col_commission_share')}</Th>
                <Th align="right">{t('agentSwot.col_turnover_share')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {agencies.length === 0 && <TableEmpty colSpan={9} title={t('common.noData')} />}
              {agencies.map((a: any) => {
                const selected = selectedAgency === a.agencyName;
                return (
                  <Tr
                    key={a.id}
                    clickable
                    onClick={() => handleSelectAgency(a.agencyName)}
                    aria-selected={selected}
                    className={cn(selected && 'bg-brand-soft hover:bg-brand-soft')}
                  >
                    <Td className="whitespace-nowrap font-medium text-fg">
                      <span className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', selected ? 'bg-brand' : 'bg-line-strong')} aria-hidden="true" />
                        {a.agencyName}
                      </span>
                    </Td>
                    <Td align="right" numeric>{a.dealCount}</Td>
                    <Td align="right" numeric className="font-medium">{formatMoney(a.totalLimit)}</Td>
                    <Td align="right" numeric className="text-fg-secondary">{formatMoney(a.calculatedSum)}</Td>
                    <Td align="right" numeric>{formatMoney(a.companyRevenue)}</Td>
                    <Td align="right" numeric className="text-fg-secondary">{formatMoney(a.agencyPayout)}</Td>
                    <Td align="right" numeric className="font-semibold text-success">{formatMoney(a.netProfit)}</Td>
                    <Td align="right" numeric className="text-fg-secondary">{formatPercent(a.commissionSharePct)}</Td>
                    <Td align="right" numeric className="font-medium">{formatPercent(a.turnoverSharePct)}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </TableContainer>
      </Card>

      {/* SWOT matritsasi (tahrirlanadi) */}
      <Card padding="none">
        <CardHeader
          bordered
          title={t('agentSwot.matrix_title', { agency: selectedAgency })}
          description={t('agentSwot.matrix_hint')}
          actions={
            <Button onClick={handleSaveSwot} loading={saving} leftIcon={<Save className="h-4 w-4" />}>
              {saving ? t('common.saving') : t('agentSwot.save')}
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-3 p-4 sm:gap-4 sm:p-5 md:grid-cols-2">
          {quadrants.map((q) => (
            <div key={q.key} className="space-y-2 rounded-card border border-line bg-surface-2 p-4">
              <label htmlFor={`swot-${q.key}`} className="flex items-center gap-2 text-sm font-semibold text-fg">
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-control', q.tone)}>{q.icon}</span>
                {t(`agentSwot.${q.key}`)}
              </label>
              <Textarea
                id={`swot-${q.key}`}
                rows={3}
                value={swotForm[q.key]}
                onChange={(e) => setSwotForm({ ...swotForm, [q.key]: e.target.value })}
                placeholder={t(`agentSwot.${q.key}_placeholder`)}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
