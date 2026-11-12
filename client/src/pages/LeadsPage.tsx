import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users,
  UserPlus,
  Search,
  ArrowRight,
  AlertTriangle,
  Trophy,
} from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { formatNumber } from '../utils/format';
import {
  Button, Card, Modal, PageHeader, StatCard, Badge, Field, Input, Select, Textarea,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, LoadingBlock, Tabs,
} from '../components/ui';
import type { Tone } from '../components/ui/StatCard';

interface Lead {
  id: string;
  leadNumber: number;
  fullName: string;
  phone: string;
  additionalPhone?: string;
  passportMasked?: string;
  requestedAmount: number;
  approvedLimit: number;
  providerName: string;
  partnerName: string;
  source: string;
  status: string;
  visitDate?: string;
  agentName: string;
  teamName: string;
  notes?: string;
  createdAt: string;
}

interface TeamStat {
  id: string;
  leaderName: string;
  members: string[];
  totalLeads: number;
  convertedLeads: number;
  cancelledLeads: number;
  totalLimitVolume: number;
  conversionRate: string;
}

// Server kodlari (API qiymatlari) — tarjima qilinmaydi, faqat yorliqlar tarjima qilinadi
const LEAD_STATUSES = ['YANGI', 'BOGLANILDI', 'LIMIT_TEKSHIRILDI', 'OFISGA_BELGILANDI', 'BITIMGA_OTDI', 'BEKOR_QILINDI'];

const STATUS_TONE: Record<string, Tone> = {
  YANGI: 'info',
  BOGLANILDI: 'brand',
  LIMIT_TEKSHIRILDI: 'warning',
  OFISGA_BELGILANDI: 'info',
  BITIMGA_OTDI: 'success',
  BEKOR_QILINDI: 'danger',
};

// Bank / hamkor nomlari — ma'lumot qiymatlari (serverga shu holda yuboriladi)
const PROVIDERS = ['Imanium', 'Alif online', 'Alif offline', 'Infin Bank', 'Payme', 'Trust 1', 'Variant', 'Paylater online', 'Paylater offline'];
const PARTNERS = ['Qodir aka', 'Planet phone', 'Green bazar', 'Denov', 'Angren', 'Samarqand', 'Media park Angren', 'Trust', 'Jizzax'];
const TEAMS = ['Jahongir', 'Farida'];

// Murojaat manbasi: `value` serverga yuboriladigan qiymat, yorliq tarjima kaliti
const SOURCES = [
  { value: "Qo'ng'iroq", labelKey: 'leads.source.call' },
  { value: 'Instagram', labelKey: 'leads.source.instagram' },
  { value: 'Telegram', labelKey: 'leads.source.telegram' },
  { value: 'Tavsiya', labelKey: 'leads.source.referral' },
];

export const LeadsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'leads' | 'teams'>('leads');

  // Yangi lid oynasi
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    additionalPhone: '',
    passportMasked: '',
    requestedAmount: '',
    approvedLimit: '',
    providerName: 'Imanium',
    partnerName: 'Qodir aka',
    source: "Qo'ng'iroq",
    status: 'YANGI',
    visitDate: '',
    agentName: user?.fullName || 'Agent',
    teamName: 'Jahongir',
    notes: '',
  });

  // Takror telefon haqida ogohlantirish (matn render paytida tarjima qilinadi)
  const [duplicate, setDuplicate] = useState<{ name: string; agent: string } | null>(null);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await axios.get('/api/leads', {
        params: { status: statusFilter, team: teamFilter, search },
      });
      setLeads(res.data);
    } catch (err: any) {
      console.error('Error fetching leads:', err);
      setLoadError(err.response?.data?.error || t('common.load_error'));
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await axios.get('/api/leads/teams');
      setTeamStats(res.data.teamStats || []);
    } catch (err) {
      console.error('Error fetching teams:', err);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [statusFilter, teamFilter, search]);

  useEffect(() => {
    fetchTeams();
  }, []);

  const handlePhoneChange = async (val: string) => {
    setFormData({ ...formData, phone: val });
    if (val.length >= 7) {
      try {
        const res = await axios.get('/api/leads/check-duplicate', { params: { phone: val } });
        if (res.data.isDuplicate) {
          setDuplicate({
            name: res.data.existingLead?.fullName ?? '',
            agent: res.data.existingLead?.agentName ?? '',
          });
        } else {
          setDuplicate(null);
        }
      } catch (err) {}
    } else {
      setDuplicate(null);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/leads', formData);
      setIsModalOpen(false);
      setFormData({
        fullName: '',
        phone: '',
        additionalPhone: '',
        passportMasked: '',
        requestedAmount: '',
        approvedLimit: '',
        providerName: 'Imanium',
        partnerName: 'Qodir aka',
        source: "Qo'ng'iroq",
        status: 'YANGI',
        visitDate: '',
        agentName: user?.fullName || 'Agent',
        teamName: 'Jahongir',
        notes: '',
      });
      fetchLeads();
      fetchTeams();
    } catch (err: any) {
      alert(err.response?.data?.error || t('leads.createError'));
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await axios.put(`/api/leads/${id}`, { status: newStatus });
      fetchLeads();
      fetchTeams();
    } catch (err: any) {
      alert(err.response?.data?.error || t('leads.statusError'));
    }
  };

  // Lidni bitimga aylantirish (/deals sahifasiga state bilan o'tadi)
  const handleConvertToDeal = (lead: Lead) => {
    navigate('/deals', {
      state: {
        newDealFromLead: {
          customerName: lead.fullName,
          customerPhone1: lead.phone,
          customerPhone2: lead.additionalPhone,
          customerLimit: lead.approvedLimit || lead.requestedAmount,
          providerName: lead.providerName,
          storeName: lead.partnerName,
          agentName: lead.agentName,
        },
      },
    });
  };

  // KPI hisob-kitoblari
  const totalLeads = leads.length;
  const convertedLeads = leads.filter((l) => l.status === 'BITIMGA_OTDI').length;
  const visitScheduled = leads.filter((l) => l.status === 'OFISGA_BELGILANDI').length;
  const totalLimit = leads.reduce((acc, curr) => acc + Number(curr.approvedLimit || 0), 0);
  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0';

  const getStatusBadge = (st: string) =>
    STATUS_TONE[st] ? (
      <Badge tone={STATUS_TONE[st]} size="sm">{t(`leads.status.${st}`)}</Badge>
    ) : (
      <Badge size="sm">{st}</Badge>
    );

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title={t('leads.title')}
        description={t('leads.subtitle')}
        actions={
          <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setIsModalOpen(true)}>
            {t('leads.new')}
          </Button>
        }
      />

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'leads', label: t('leads.tab.leads'), icon: <Users /> },
          { value: 'teams', label: t('leads.tab.teams'), icon: <Trophy /> },
        ]}
      />

      {loadError && (
        <div role="alert" className="rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      {/* KPI kartalar */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard title={t('leads.kpi.total')} value={totalLeads} hint={t('leads.kpi.totalHint')} tone="violet" />
        <StatCard title={t('leads.kpi.visit')} value={visitScheduled} hint={t('leads.kpi.visitHint')} tone="info" />
        <StatCard title={t('leads.kpi.converted')} value={convertedLeads} hint={t('leads.kpi.convertedHint')} tone="success" />
        <StatCard title={t('leads.kpi.conversion')} value={`${conversionRate}%`} hint={t('leads.kpi.conversionHint')} tone="brand" />
        <StatCard
          title={t('leads.kpi.limit')}
          value={<span className="text-lg sm:text-xl">{formatNumber(totalLimit)} <span className="text-xs font-normal">UZS</span></span>}
          hint={t('leads.kpi.limitHint')}
          tone="brand"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {activeTab === 'teams' ? (
        /* Jamoalar reytingi */
        <div className="space-y-4">
          <Card className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-accent">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">{t('leads.teams.title')}</h3>
              <p className="text-xs text-fg-muted">{t('leads.teams.subtitle')}</p>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
            {teamStats.map((team, idx) => (
              <Card key={team.id} className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-control bg-brand-soft text-base font-semibold tabular-nums text-accent">
                      #{idx + 1}
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-fg">{t('leads.teams.name', { name: team.leaderName })}</h4>
                      <p className="text-xs text-fg-muted">{t('leads.teams.leader', { name: team.leaderName })}</p>
                    </div>
                  </div>
                  <Badge tone="success">{t('leads.teams.conversion', { value: team.conversionRate })}</Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-card bg-surface-2 p-3 text-center">
                  <div>
                    <span className="text-xs text-fg-muted">{t('leads.teams.leads')}</span>
                    <p className="text-base font-semibold tabular-nums text-fg">{team.totalLeads}</p>
                  </div>
                  <div className="border-x border-line">
                    <span className="text-xs text-fg-muted">{t('leads.teams.deals')}</span>
                    <p className="text-base font-semibold tabular-nums text-success">{team.convertedLeads}</p>
                  </div>
                  <div>
                    <span className="text-xs text-fg-muted">{t('leads.teams.cancelled')}</span>
                    <p className="text-base font-semibold tabular-nums text-danger">{team.cancelledLeads}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-fg-muted">{t('leads.teams.members')}:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {team.members.map((m, mIdx) => (
                      <Badge key={mIdx}>{m}</Badge>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        /* Lidlar ro'yxati */
        <div className="space-y-4">
          {/* Filtrlar */}
          <Card padding="sm" className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
            <div className="flex-1 md:max-w-sm">
              <Input
                type="text"
                leftIcon={<Search />}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('leads.searchPlaceholder')}
              />
            </div>

            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="md:w-52">
              <option value="ALL">{t('leads.allStatuses')}</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`leads.status.${s}`)}</option>
              ))}
            </Select>

            <Select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="md:w-52">
              <option value="ALL">{t('leads.allTeams')}</option>
              {TEAMS.map((tm) => (
                <option key={tm} value={tm}>{t('leads.teamOf', { name: tm })}</option>
              ))}
            </Select>
          </Card>

          {/* Lidlar jadvali */}
          <Card padding="none">
            <TableContainer bare>
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('leads.col.id')}</Th>
                    <Th>{t('leads.col.name')}</Th>
                    <Th>{t('common.phone')}</Th>
                    <Th>{t('leads.col.limit')}</Th>
                    <Th>{t('leads.col.bankStore')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th>{t('leads.col.agent')}</Th>
                    <Th align="right">{t('common.actions')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8}>
                        <LoadingBlock label={t('leads.loading')} />
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <TableEmpty colSpan={8} title={t('leads.empty')} />
                  ) : (
                    leads.map((l) => (
                      <Tr key={l.id}>
                        <Td numeric className="font-mono font-semibold text-accent">#{l.leadNumber}</Td>
                        <Td className="font-semibold text-fg">
                          {l.fullName}
                          {l.passportMasked && (
                            <span className="block text-xs font-normal text-fg-muted">
                              {t('leads.passport', { value: l.passportMasked })}
                            </span>
                          )}
                        </Td>
                        <Td numeric className="font-mono text-fg-secondary">{l.phone}</Td>
                        <Td numeric>
                          <span className="font-semibold text-success">
                            {formatNumber(l.approvedLimit || l.requestedAmount)} UZS
                          </span>
                          <span className="block text-xs text-fg-muted">
                            {t('leads.requested', { amount: formatNumber(l.requestedAmount) })}
                          </span>
                        </Td>
                        <Td>
                          <span className="font-medium text-fg">{l.providerName}</span>
                          <span className="block text-xs text-fg-muted">{l.partnerName}</span>
                        </Td>
                        <Td>{getStatusBadge(l.status)}</Td>
                        <Td>
                          <span className="font-medium text-fg">{l.agentName}</span>
                          <span className="block text-xs text-fg-muted">{t('leads.teamOf', { name: l.teamName })}</span>
                        </Td>
                        <Td align="right">
                          <div className="flex items-center justify-end gap-1.5">
                            {l.status !== 'BITIMGA_OTDI' && (
                              <Button
                                size="sm"
                                variant="success"
                                rightIcon={<ArrowRight className="h-3 w-3" />}
                                onClick={() => handleConvertToDeal(l)}
                                title={t('leads.toDealTooltip')}
                              >
                                {t('leads.toDeal')}
                              </Button>
                            )}

                            <Select
                              value={l.status}
                              onChange={(e) => handleStatusChange(l.id, e.target.value)}
                              className="min-w-[9rem] text-xs"
                              aria-label={t('common.status')}
                            >
                              {LEAD_STATUSES.map((s) => (
                                <option key={s} value={s}>{t(`leads.status.${s}`)}</option>
                              ))}
                            </Select>
                          </div>
                        </Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </TableContainer>
          </Card>
        </div>
      )}

      {/* Yangi lid oynasi */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="md"
        title={t('leads.modal.title')}
        description={t('leads.modal.subtitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="lead-new-form">
              {t('leads.modal.save')}
            </Button>
          </>
        }
      >
        <form id="lead-new-form" onSubmit={handleCreateLead} className="space-y-3.5">
          {duplicate && (
            <div className="flex items-center gap-2 rounded-control border border-warning/30 bg-warning-soft p-3 text-xs font-medium text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t('leads.modal.duplicate', { name: duplicate.name, agent: duplicate.agent })}</span>
            </div>
          )}

          <Field label={t('leads.modal.fullName')} required>
            <Input
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder={t('leads.modal.fullNamePlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('leads.modal.phone')} required>
              <Input
                type="tel"
                inputMode="tel"
                required
                value={formData.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="+998 90 123 45 67"
                className="font-mono"
              />
            </Field>
            <Field label={t('leads.modal.extraPhone')}>
              <Input
                type="tel"
                inputMode="tel"
                value={formData.additionalPhone}
                onChange={(e) => setFormData({ ...formData, additionalPhone: e.target.value })}
                placeholder="+998 99..."
                className="font-mono"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('leads.modal.requested')}>
              <Input
                type="number"
                inputMode="numeric"
                value={formData.requestedAmount}
                onChange={(e) => setFormData({ ...formData, requestedAmount: e.target.value })}
                placeholder="10000000"
                className="tabular-nums"
              />
            </Field>
            <Field label={t('leads.modal.approved')}>
              <Input
                type="number"
                inputMode="numeric"
                value={formData.approvedLimit}
                onChange={(e) => setFormData({ ...formData, approvedLimit: e.target.value })}
                placeholder="8000000"
                className="tabular-nums"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('leads.modal.provider')}>
              <Select
                value={formData.providerName}
                onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p === 'Imanium' ? `${p} (${t('leads.modal.daftar25')})` : p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('leads.modal.partner')}>
              <Select
                value={formData.partnerName}
                onChange={(e) => setFormData({ ...formData, partnerName: e.target.value })}
              >
                {PARTNERS.map((p) => (
                  <option key={p} value={p}>
                    {p === 'Qodir aka' ? `${p} (${t('leads.modal.profit5')})` : p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('leads.modal.team')}>
              <Select
                value={formData.teamName}
                onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
              >
                {TEAMS.map((tm) => (
                  <option key={tm} value={tm}>{t('leads.teamOf', { name: tm })}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('leads.modal.agent')}>
              <Input
                type="text"
                value={formData.agentName}
                onChange={(e) => setFormData({ ...formData, agentName: e.target.value })}
                placeholder={t('leads.modal.agentPlaceholder')}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('leads.modal.source')}>
              <Select
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('leads.modal.visitDate')}>
              <Input
                type="date"
                value={formData.visitDate}
                onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })}
              />
            </Field>
          </div>

          <Field label={t('leads.modal.notes')}>
            <Textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t('leads.modal.notesPlaceholder')}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
};

export default LeadsPage;
