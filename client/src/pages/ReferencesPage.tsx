import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Settings, Store, Building2, Users, Percent, ShoppingBag,
  Plus, CheckCircle, RefreshCw, Sliders
} from 'lucide-react';
import { formatPercent } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import {
  Button, Card, Modal, PageHeader, Badge, Field, Input, Select,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, EmptyState, Tabs, cn,
} from '../components/ui';
import { RowActions } from '../components/references/RowActions';
import {
  RuleFormState, emptyRuleForm, ruleToForm, formToRuleBody, isoToTashkentYmd,
} from '../components/references/ruleForm';

type RefTab = 'RULES' | 'PROVIDERS' | 'STORES' | 'AGENCIES' | 'BUYERS' | 'SETTINGS';

// Tab ichidagi yuqori qator: izoh matni + "qo'shish" tugmasi (mobilda ustma-ust)
const SectionBar: React.FC<{ hint: React.ReactNode; action?: React.ReactNode }> = ({ hint, action }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-xs text-fg-muted">{hint}</p>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

// Belgilash katagi (checkbox) uchun umumiy klass
const checkboxClass = 'h-4 w-4 shrink-0 rounded border-line-strong accent-brand';

export const ReferencesPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<RefTab>('RULES');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Ma'lumot holatlari
  const [rules, setRules] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);

  // Modallar va forma holatlari
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(emptyRuleForm);

  // Har bir ro'yxatda: tahrirlanayotgan yozuv id'si (null — yangi qo'shilmoqda)
  const [showAddStore, setShowAddStore] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', contactPhone: '', address: '' });

  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState({ name: '', defaultDiscount: 0.25, isDaftarDefault: false });

  const [showAddAgency, setShowAddAgency] = useState(false);
  const [editingAgencyId, setEditingAgencyId] = useState<string | null>(null);
  const [agencyForm, setAgencyForm] = useState({ name: '', phone: '' });

  const [showAddAgent, setShowAddAgent] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState({ name: '', phone: '' });

  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [editingBuyerId, setEditingBuyerId] = useState<string | null>(null);
  const [buyerForm, setBuyerForm] = useState({ name: '', phone: '', isWholesale: true });

  // Provayder → do'konlar (egasi, 26.11.2026): spravochnikda provayderga do'kon biriktirish
  const [pairMap, setPairMap] = useState<{ enabled: boolean; map: Record<string, string[]> }>({ enabled: false, map: {} });
  const [pairsProvider, setPairsProvider] = useState<any | null>(null);
  const [pairsPicked, setPairsPicked] = useState<string[]>([]);
  const [pairsSaving, setPairsSaving] = useState(false);
  const loadPairs = () =>
    axios
      .get('/api/control/pairs/map')
      .then((r) => setPairMap(r.data || { enabled: false, map: {} }))
      .catch(() => undefined);
  const openPairs = (p: any) => {
    setPairsProvider(p);
    setPairsPicked(pairMap.map[p.id] || []);
  };
  const savePairs = async () => {
    if (!pairsProvider) return;
    setPairsSaving(true);
    try {
      await axios.put(`/api/control/pairs/provider/${pairsProvider.id}`, { storeIds: pairsPicked });
      await loadPairs();
      notify(t('references.providers.stores_saved'));
      setPairsProvider(null);
    } catch (err) {
      showError(err);
    } finally {
      setPairsSaving(false);
    }
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [rRes, pRes, sRes, aRes, bRes, setRes] = await Promise.all([
        axios.get('/api/references/rules'),
        axios.get('/api/references/providers', { params: { all: 1 } }),
        axios.get('/api/references/stores', { params: { all: 1 } }),
        axios.get('/api/references/agencies', { params: { all: 1 } }),
        axios.get('/api/references/buyers'),
        axios.get('/api/references/settings'),
      ]);
      setRules(rRes.data);
      setProviders(pRes.data);
      setStores(sRes.data);
      setAgencies(aRes.data);
      setBuyers(bRes.data);
      setSettings(setRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    void loadPairs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notify = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const showError = (err: any) => alert(err.response?.data?.error || t('common.save_error'));

  // Qoida amallari
  const openRuleModal = (rule: any | null) => {
    setEditingRule(rule);
    setRuleForm(rule ? ruleToForm(rule) : emptyRuleForm);
    setShowAddRuleModal(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = formToRuleBody(ruleForm);
    if ('error' in parsed) {
      alert(parsed.error === 'rate' ? t('references.rules.err.rate') : t('references.rules.err.profit'));
      return;
    }
    if (!parsed.body.storeId && !parsed.body.providerId) {
      alert(t('references.rules.err.target'));
      return;
    }
    try {
      if (editingRule) {
        await axios.put(`/api/references/rules/${editingRule.id}`, parsed.body);
        notify(t('references.rules.updated'));
      } else {
        await axios.post('/api/references/rules', parsed.body);
        notify(t('references.rules.saved'));
      }
      setShowAddRuleModal(false);
      setEditingRule(null);
      fetchAll();
    } catch (err: any) {
      showError(err);
    }
  };

  // Umumiy o'chirish: server bog'langan yozuvni o'chirmay yashirsa (deactivated) — shuni aytamiz
  const handleDelete = async (path: string, name: string, deletedMsg: string) => {
    if (!window.confirm(t('references.confirmDelete').replace('{name}', name))) return;
    try {
      const res = await axios.delete(`/api/references/${path}`);
      notify(res.data?.deactivated ? t('references.deactivated') : deletedMsg);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.delete_error'));
    }
  };

  // Yashirilgan yozuvni qayta yoqish
  const handleRestore = async (path: string) => {
    try {
      await axios.put(`/api/references/${path}`, { isActive: true });
      notify(t('references.restored'));
      fetchAll();
    } catch (err: any) {
      showError(err);
    }
  };

  // Do'kon amallari
  const openStoreModal = (store: any | null) => {
    setEditingStoreId(store?.id || null);
    setStoreForm({ name: store?.name || '', contactPhone: store?.contactPhone || '', address: store?.address || '' });
    setShowAddStore(true);
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStoreId) {
        await axios.put(`/api/references/stores/${editingStoreId}`, storeForm);
        notify(t('references.stores.updated'));
      } else {
        await axios.post('/api/references/stores', storeForm);
        notify(t('references.stores.added'));
      }
      setShowAddStore(false);
      setEditingStoreId(null);
      setStoreForm({ name: '', contactPhone: '', address: '' });
      fetchAll();
    } catch (err: any) {
      showError(err);
    }
  };

  // Provayder amallari
  const openProviderModal = (p: any | null) => {
    setEditingProviderId(p?.id || null);
    setProviderForm(
      p
        ? { name: p.name, defaultDiscount: Number(p.defaultDiscount), isDaftarDefault: Boolean(p.isDaftarDefault) }
        : { name: '', defaultDiscount: 0.25, isDaftarDefault: false }
    );
    setShowAddProvider(true);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProviderId) {
        await axios.put(`/api/references/providers/${editingProviderId}`, providerForm);
        notify(t('references.providers.updated'));
      } else {
        await axios.post('/api/references/providers', providerForm);
        notify(t('references.providers.added'));
      }
      setShowAddProvider(false);
      setEditingProviderId(null);
      setProviderForm({ name: '', defaultDiscount: 0.25, isDaftarDefault: false });
      fetchAll();
    } catch (err: any) {
      showError(err);
    }
  };

  // Agentlik amallari
  const openAgencyModal = (a: any | null) => {
    setEditingAgencyId(a?.id || null);
    setAgencyForm({ name: a?.name || '', phone: a?.phone || '' });
    setShowAddAgency(true);
  };

  const handleSaveAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAgencyId) {
        await axios.put(`/api/references/agencies/${editingAgencyId}`, agencyForm);
        notify(t('references.agencies.updated'));
      } else {
        await axios.post('/api/references/agencies', agencyForm);
        notify(t('references.agencies.added'));
      }
      setShowAddAgency(false);
      setEditingAgencyId(null);
      setAgencyForm({ name: '', phone: '' });
      fetchAll();
    } catch (err: any) {
      showError(err);
    }
  };

  // Agent: yangi qo'shish (agentlik id'si bilan) yoki tahrirlash (agent id'si bilan)
  const openAgentModal = (agencyId: string, agent: any | null) => {
    setShowAddAgent(agencyId);
    setEditingAgentId(agent?.id || null);
    setAgentForm({ name: agent?.name || '', phone: agent?.phone || '' });
  };

  const closeAgentModal = () => {
    setShowAddAgent(null);
    setEditingAgentId(null);
  };

  const handleSaveAgent = async (agencyId: string, e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAgentId) {
        await axios.put(`/api/references/agents/${editingAgentId}`, agentForm);
        notify(t('references.agents.updated'));
      } else {
        await axios.post(`/api/references/agencies/${agencyId}/agents`, agentForm);
        notify(t('references.agents.added'));
      }
      closeAgentModal();
      setAgentForm({ name: '', phone: '' });
      fetchAll();
    } catch (err: any) {
      showError(err);
    }
  };

  // Xaridor amallari
  const openBuyerModal = (b: any | null) => {
    setEditingBuyerId(b?.id || null);
    setBuyerForm({ name: b?.name || '', phone: b?.phone || '', isWholesale: b ? Boolean(b.isWholesale) : true });
    setShowAddBuyer(true);
  };

  const handleSaveBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBuyerId) {
        await axios.put(`/api/references/buyers/${editingBuyerId}`, buyerForm);
        notify(t('references.buyers.updated'));
      } else {
        await axios.post('/api/references/buyers', buyerForm);
        notify(t('references.buyers.added'));
      }
      setShowAddBuyer(false);
      setEditingBuyerId(null);
      setBuyerForm({ name: '', phone: '', isWholesale: true });
      fetchAll();
    } catch (err: any) {
      showError(err);
    }
  };

  // Yashirilgan (nofaol) qator ko'rinishi
  const dimmed = (inactive: boolean) => (inactive ? 'opacity-55' : undefined);
  const hiddenBadge = (inactive: boolean) =>
    inactive ? <Badge tone="neutral" className="ml-2">{t('references.hidden')}</Badge> : null;

  // "dd.mm.yyyy" ko'rinishida davr (bo'sh tomon — cheklanmagan)
  const fmtYmd = (ymd: string) => (ymd ? ymd.split('-').reverse().join('.') : '');
  const rulePeriod = (rule: any) => {
    const from = fmtYmd(isoToTashkentYmd(rule.validFrom));
    const to = fmtYmd(isoToTashkentYmd(rule.validTo));
    if (!from && !to) return t('references.rules.noLimit');
    return `${from || '…'} — ${to || '…'}`;
  };

  const plusIcon = <Plus className="h-4 w-4" />;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Sarlavha */}
      <PageHeader
        icon={<Sliders />}
        title={t('references.title')}
        description={t('references.subtitle')}
        actions={
          <Button
            variant="secondary"
            onClick={fetchAll}
            leftIcon={<RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />}
          >
            {t('common.refresh')}
          </Button>
        }
      />

      {successMsg && (
        <div role="status" className="flex items-center gap-2 rounded-card bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle className="h-5 w-5 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Tablar */}
      <Tabs<RefTab>
        ariaLabel={t('references.tabsLabel')}
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'RULES', label: t('references.tab.rules'), icon: <Percent />, count: rules.length },
          { value: 'PROVIDERS', label: t('references.tab.providers'), icon: <Building2 />, count: providers.length },
          { value: 'STORES', label: t('references.tab.stores'), icon: <Store />, count: stores.length },
          { value: 'AGENCIES', label: t('references.tab.agencies'), icon: <Users />, count: agencies.length },
          { value: 'BUYERS', label: t('references.tab.buyers'), icon: <ShoppingBag />, count: buyers.length },
          { value: 'SETTINGS', label: t('references.tab.settings'), icon: <Settings /> },
        ]}
      />

      {/* 1-TAB: Komissiya qoidalari */}
      {activeTab === 'RULES' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-card border border-line bg-info-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-xs leading-relaxed text-fg-secondary">
              <span className="font-semibold text-fg">{t('references.rules.formulaTitle')}</span>{' '}
              {t('references.rules.formulaText')}
            </p>
            <Button
              className="shrink-0"
              leftIcon={plusIcon}
              onClick={() => openRuleModal(null)}
            >
              {t('references.rules.add')}
            </Button>
          </div>

          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('references.rules.col.name')}</Th>
                  <Th>{t('common.store')}</Th>
                  <Th>{t('common.provider')}</Th>
                  <Th align="right">{t('references.rules.col.rate')}</Th>
                  <Th align="right">{t('references.rules.col.profit')}</Th>
                  <Th>{t('references.rules.col.period')}</Th>
                  <Th align="center">{t('references.rules.col.priority')}</Th>
                  <Th align="center">{t('common.status')}</Th>
                  <Th align="center">{t('common.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rules.length === 0 && <TableEmpty colSpan={9} title={t('references.rules.empty')} />}
                {rules.map((rule) => (
                  <Tr key={rule.id} className={dimmed(!rule.isActive)}>
                    <Td className="font-semibold text-fg">
                      {rule.name}
                      {rule.agency?.name && (
                        <Badge tone="info" size="sm" className="ml-2">
                          {t('references.rules.agencyOnly', { name: rule.agency.name })}
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-fg-secondary">{rule.store?.name || t('references.rules.anyStore')}</Td>
                    <Td className="text-fg-secondary">{rule.provider?.name || t('references.rules.anyProvider')}</Td>
                    <Td align="right" numeric className="font-semibold text-accent">
                      {formatPercent(rule.ratePercent)}
                    </Td>
                    <Td align="right" numeric className={rule.profitPercent == null ? 'text-fg-muted' : 'font-semibold text-fg'}>
                      {formatPercent(rule.profitPercent ?? rule.ratePercent)}
                    </Td>
                    <Td numeric className="whitespace-nowrap text-fg-secondary">{rulePeriod(rule)}</Td>
                    <Td align="center" numeric className="text-fg-secondary">{rule.priority}</Td>
                    <Td align="center">
                      <Badge tone={rule.isActive ? 'success' : 'neutral'}>
                        {rule.isActive ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </Td>
                    <Td align="center">
                      <RowActions
                        onEdit={() => openRuleModal(rule)}
                        onDelete={() => handleDelete(`rules/${rule.id}`, rule.name, t('references.rules.deleted'))}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* 2-TAB: Banklar va ilovalar */}
      {activeTab === 'PROVIDERS' && (
        <div className="space-y-4">
          <SectionBar
            hint={t('references.providers.hint')}
            action={
              <Button leftIcon={plusIcon} onClick={() => openProviderModal(null)}>
                {t('references.providers.add')}
              </Button>
            }
          />

          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('references.providers.col.name')}</Th>
                  <Th align="right">{t('references.providers.col.discount')}</Th>
                  <Th align="center">{t('references.providers.col.daftar')}</Th>
                  <Th>{t('references.providers.col.stores')}</Th>
                  <Th align="center">{t('references.providers.col.id')}</Th>
                  <Th align="center">{t('common.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {providers.length === 0 && <TableEmpty colSpan={6} title={t('references.providers.empty')} />}
                {providers.map((p) => (
                  <Tr key={p.id} className={dimmed(!p.isActive)}>
                    <Td className="font-semibold text-fg">{p.name}{hiddenBadge(!p.isActive)}</Td>
                    <Td align="right" numeric className="text-fg-secondary">{formatPercent(p.defaultDiscount)}</Td>
                    <Td align="center">
                      <Badge tone={p.isDaftarDefault ? 'danger' : 'neutral'}>
                        {p.isDaftarDefault ? t('references.providers.daftarYes') : t('common.no')}
                      </Badge>
                    </Td>
                    <Td className="max-w-[18rem]">
                      <button
                        type="button"
                        className="w-full text-left text-sm text-accent hover:underline"
                        onClick={() => openPairs(p)}
                        title={t('references.providers.stores_edit')}
                      >
                        {(pairMap.map[p.id] || []).length
                          ? (pairMap.map[p.id] || []).map((id) => stores.find((s) => s.id === id)?.name || '?').join(', ')
                          : t('references.providers.stores_all')}
                      </button>
                    </Td>
                    <Td align="center" numeric className="font-mono text-xs text-fg-muted">{p.id.slice(0, 8)}...</Td>
                    <Td align="center">
                      <RowActions
                        inactive={!p.isActive}
                        onRestore={() => handleRestore(`providers/${p.id}`)}
                        onEdit={() => openProviderModal(p)}
                        onDelete={() => handleDelete(`providers/${p.id}`, p.name, t('references.providers.deleted'))}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* 3-TAB: Do'konlar */}
      {activeTab === 'STORES' && (
        <div className="space-y-4">
          <SectionBar
            hint={t('references.stores.hint')}
            action={
              <Button leftIcon={plusIcon} onClick={() => openStoreModal(null)}>
                {t('references.stores.add')}
              </Button>
            }
          />

          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('references.stores.col.name')}</Th>
                  <Th>{t('references.stores.col.phone')}</Th>
                  <Th>{t('common.address')}</Th>
                  <Th align="center">{t('common.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {stores.length === 0 && <TableEmpty colSpan={4} title={t('references.stores.empty')} />}
                {stores.map((s) => (
                  <Tr key={s.id} className={dimmed(!s.isActive)}>
                    <Td className="font-semibold text-fg">{s.name}{hiddenBadge(!s.isActive)}</Td>
                    <Td numeric className="text-fg-secondary">{s.contactPhone || '-'}</Td>
                    <Td className="text-fg-muted">{s.address || '-'}</Td>
                    <Td align="center">
                      <RowActions
                        inactive={!s.isActive}
                        onRestore={() => handleRestore(`stores/${s.id}`)}
                        onEdit={() => openStoreModal(s)}
                        onDelete={() => handleDelete(`stores/${s.id}`, s.name, t('references.stores.deleted'))}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* 4-TAB: Agentliklar va agentlar */}
      {activeTab === 'AGENCIES' && (
        <div className="space-y-4">
          <SectionBar
            hint={t('references.agencies.hint')}
            action={
              <Button leftIcon={plusIcon} onClick={() => openAgencyModal(null)}>
                {t('references.agencies.add')}
              </Button>
            }
          />

          {agencies.length === 0 && (
            <Card>
              <EmptyState icon={<Users />} title={t('references.agencies.empty')} />
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
            {agencies.map((agency) => (
              <Card key={agency.id} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                      <Users className="h-4 w-4 shrink-0 text-accent" />
                      <span className="truncate">{agency.name}</span>
                    </h3>
                    <p className="mt-0.5 text-xs tabular-nums text-fg-muted">{agency.phone || t('references.agencies.noPhone')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => openAgentModal(agency.id, null)}
                    >
                      {t('references.agencies.addAgent')}
                    </Button>
                    <RowActions
                      onEdit={() => openAgencyModal(agency)}
                      onDelete={() => handleDelete(`agencies/${agency.id}`, agency.name, t('references.agencies.deleted'))}
                    />
                  </div>
                </div>

                <div className="border-t border-line pt-3">
                  <span className="text-xs font-medium text-fg-muted">{t('references.agencies.agentsList')}</span>
                  <div className="mt-2 space-y-1">
                    {agency.agents?.length > 0 ? (
                      agency.agents.map((agt: any) => (
                        <div
                          key={agt.id}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-control bg-surface-2 px-2.5 py-1',
                            dimmed(!agt.isActive)
                          )}
                        >
                          <span className="min-w-0 truncate text-sm text-fg">
                            {agt.name}
                            {agt.phone && <span className="ml-1.5 text-xs tabular-nums text-fg-muted">({agt.phone})</span>}
                            {hiddenBadge(!agt.isActive)}
                          </span>
                          <RowActions
                            compact
                            inactive={!agt.isActive}
                            onRestore={() => handleRestore(`agents/${agt.id}`)}
                            onEdit={() => openAgentModal(agency.id, agt)}
                            onDelete={() => handleDelete(`agents/${agt.id}`, agt.name, t('references.agents.deleted'))}
                          />
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-fg-muted">{t('references.agencies.noAgents')}</span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 5-TAB: Xaridorlar */}
      {activeTab === 'BUYERS' && (
        <div className="space-y-4">
          <SectionBar
            hint={t('references.buyers.hint')}
            action={
              <Button leftIcon={plusIcon} onClick={() => openBuyerModal(null)}>
                {t('references.buyers.add')}
              </Button>
            }
          />

          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('references.buyers.col.name')}</Th>
                  <Th>{t('common.phone')}</Th>
                  <Th align="center">{t('references.buyers.col.type')}</Th>
                  <Th align="center">{t('common.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {buyers.length === 0 && <TableEmpty colSpan={4} title={t('references.buyers.empty')} />}
                {buyers.map((b) => (
                  <Tr key={b.id}>
                    <Td className="font-semibold text-fg">{b.name}</Td>
                    <Td numeric className="text-fg-secondary">{b.phone || '-'}</Td>
                    <Td align="center">
                      <Badge tone={b.isWholesale ? 'brand' : 'neutral'}>
                        {b.isWholesale ? t('references.buyers.wholesale') : t('references.buyers.retail')}
                      </Badge>
                    </Td>
                    <Td align="center">
                      <RowActions
                        onEdit={() => openBuyerModal(b)}
                        onDelete={() => handleDelete(`buyers/${b.id}`, b.name, t('references.buyers.deleted'))}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* 6-TAB: Tizim parametrlari */}
      {activeTab === 'SETTINGS' && (
        <div className="space-y-4">
          <SectionBar hint={t('references.settings.hint')} />
          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('references.settings.col.key')}</Th>
                  <Th>{t('references.settings.col.value')}</Th>
                  <Th>{t('common.description')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {settings.length === 0 && <TableEmpty colSpan={3} title={t('references.settings.empty')} />}
                {settings.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-mono text-xs font-semibold text-fg">{s.key}</Td>
                    <Td numeric className="font-semibold text-accent">{s.value}</Td>
                    <Td className="text-fg-secondary">{s.description || '-'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </div>
      )}

      {/* MODAL: Provayder → do'konlar */}
      <Modal
        open={!!pairsProvider}
        onClose={() => setPairsProvider(null)}
        title={t('references.providers.stores_title', { name: pairsProvider?.name || '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPairsProvider(null)}>{t('common.cancel')}</Button>
            <Button onClick={savePairs} loading={pairsSaving}>{t('common.save')}</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-fg-secondary">{t('references.providers.stores_hint')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {stores
            .filter((s) => s.isActive || pairsPicked.includes(s.id))
            .map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-control border border-line px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={pairsPicked.includes(s.id)}
                  onChange={(e) => setPairsPicked((x) => (e.target.checked ? [...x, s.id] : x.filter((id) => id !== s.id)))}
                />
                {s.name}
              </label>
            ))}
        </div>
        {!pairMap.enabled && <p className="mt-3 text-xs text-warning">{t('references.providers.stores_check_off')}</p>}
      </Modal>

      {/* MODAL: Qoida */}
      <Modal
        open={showAddRuleModal}
        onClose={() => setShowAddRuleModal(false)}
        title={editingRule ? t('references.rules.modal.editTitle') : t('references.rules.modal.addTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddRuleModal(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-rule-form">{t('common.save')}</Button>
          </>
        }
      >
        <form id="ref-rule-form" onSubmit={handleSaveRule} className="space-y-4">
          <Field label={t('references.rules.col.name')} required htmlFor="ref-rule-name">
            <Input
              id="ref-rule-name"
              type="text"
              required
              placeholder={t('references.rules.field.name_placeholder')}
              value={ruleForm.name}
              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
            />
          </Field>

          <Field label={t('references.rules.field.store')} htmlFor="ref-rule-store">
            <Select
              id="ref-rule-store"
              value={ruleForm.storeId}
              onChange={(e) => setRuleForm({ ...ruleForm, storeId: e.target.value })}
            >
              <option value="">{t('references.rules.field.allStores')}</option>
              {stores.filter((s) => s.isActive || s.id === ruleForm.storeId).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>

          <Field label={t('references.rules.field.provider')} htmlFor="ref-rule-provider">
            <Select
              id="ref-rule-provider"
              value={ruleForm.providerId}
              onChange={(e) => setRuleForm({ ...ruleForm, providerId: e.target.value })}
            >
              <option value="">{t('references.rules.field.allProviders')}</option>
              {providers.filter((p) => p.isActive || p.id === ruleForm.providerId).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>

          <Field label={t('references.rules.field.agency')} hint={t('references.rules.field.agency_hint')} htmlFor="ref-rule-agency">
            <Select id="ref-rule-agency" value={ruleForm.agencyId} onChange={(e) => setRuleForm({ ...ruleForm, agencyId: e.target.value })}>
              <option value="">{t('references.rules.field.allAgencies')}</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={t('references.rules.field.rate')}
              hint={t('references.rules.field.rate_hint')}
              required
              htmlFor="ref-rule-rate"
            >
              <Input
                id="ref-rule-rate"
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                className="tabular-nums"
                onFocus={(e) => e.target.select()}
                value={ruleForm.ratePct}
                onChange={(e) => setRuleForm({ ...ruleForm, ratePct: e.target.value })}
              />
            </Field>
            <Field
              label={t('references.rules.field.profit')}
              hint={t('references.rules.field.profit_hint')}
              htmlFor="ref-rule-profit"
            >
              <Input
                id="ref-rule-profit"
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="tabular-nums"
                placeholder={t('references.rules.field.profit_placeholder')}
                onFocus={(e) => e.target.select()}
                value={ruleForm.profitPct}
                onChange={(e) => setRuleForm({ ...ruleForm, profitPct: e.target.value })}
              />
            </Field>
            <Field label={t('references.rules.field.validFrom')} htmlFor="ref-rule-from">
              <Input
                id="ref-rule-from"
                type="date"
                value={ruleForm.validFrom}
                onChange={(e) => setRuleForm({ ...ruleForm, validFrom: e.target.value })}
              />
            </Field>
            <Field label={t('references.rules.field.validTo')} htmlFor="ref-rule-to">
              <Input
                id="ref-rule-to"
                type="date"
                min={ruleForm.validFrom || undefined}
                value={ruleForm.validTo}
                onChange={(e) => setRuleForm({ ...ruleForm, validTo: e.target.value })}
              />
            </Field>
            <Field label={t('references.rules.col.priority')} required htmlFor="ref-rule-priority">
              <Input
                id="ref-rule-priority"
                type="number"
                required
                className="tabular-nums"
                onFocus={(e) => e.target.select()}
                value={ruleForm.priority}
                onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })}
              />
            </Field>
            <label htmlFor="ref-rule-active" className="flex min-h-touch cursor-pointer items-center gap-2 self-end text-sm text-fg-secondary">
              <input
                type="checkbox"
                id="ref-rule-active"
                checked={ruleForm.isActive}
                onChange={(e) => setRuleForm({ ...ruleForm, isActive: e.target.checked })}
                className={checkboxClass}
              />
              {t('references.rules.field.active')}
            </label>
          </div>
        </form>
      </Modal>

      {/* MODAL: Do'kon */}
      <Modal
        open={showAddStore}
        onClose={() => setShowAddStore(false)}
        title={editingStoreId ? t('references.stores.modal.editTitle') : t('references.stores.modal.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddStore(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-store-form">{editingStoreId ? t('common.save') : t('common.add')}</Button>
          </>
        }
      >
        <form id="ref-store-form" onSubmit={handleSaveStore} className="space-y-4">
          <Field label={t('references.stores.col.name')} required htmlFor="ref-store-name">
            <Input
              id="ref-store-name"
              type="text"
              required
              value={storeForm.name}
              onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
            />
          </Field>
          <Field label={t('references.stores.field.phone')} htmlFor="ref-store-phone">
            <Input
              id="ref-store-phone"
              type="text"
              value={storeForm.contactPhone}
              onChange={(e) => setStoreForm({ ...storeForm, contactPhone: e.target.value })}
            />
          </Field>
          <Field label={t('common.address')} htmlFor="ref-store-address">
            <Input
              id="ref-store-address"
              type="text"
              value={storeForm.address}
              onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* MODAL: Provayder */}
      <Modal
        open={showAddProvider}
        onClose={() => setShowAddProvider(false)}
        title={editingProviderId ? t('references.providers.modal.editTitle') : t('references.providers.modal.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddProvider(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-provider-form">{editingProviderId ? t('common.save') : t('common.add')}</Button>
          </>
        }
      >
        <form id="ref-provider-form" onSubmit={handleSaveProvider} className="space-y-4">
          <Field label={t('references.providers.field.name')} required htmlFor="ref-provider-name">
            <Input
              id="ref-provider-name"
              type="text"
              required
              placeholder={t('references.providers.field.name_placeholder')}
              value={providerForm.name}
              onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
            />
          </Field>
          <Field
            label={t('references.providers.field.discount')}
            hint={t('references.providers.field.discount_hint')}
            required
            htmlFor="ref-provider-discount"
          >
            <Input
              id="ref-provider-discount"
              type="number"
              step="0.01"
              required
              className="tabular-nums"
              onFocus={(e) => e.target.select()}
              value={providerForm.defaultDiscount}
              onChange={(e) => setProviderForm({ ...providerForm, defaultDiscount: parseFloat(e.target.value) || 0 })}
            />
          </Field>
          <label htmlFor="daftarCheck" className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-fg-secondary">
            <input
              type="checkbox"
              id="daftarCheck"
              checked={providerForm.isDaftarDefault}
              onChange={(e) => setProviderForm({ ...providerForm, isDaftarDefault: e.target.checked })}
              className={checkboxClass}
            />
            {t('references.providers.field.daftar')}
          </label>
        </form>
      </Modal>

      {/* MODAL: Agentlik */}
      <Modal
        open={showAddAgency}
        onClose={() => setShowAddAgency(false)}
        title={editingAgencyId ? t('references.agencies.modal.editTitle') : t('references.agencies.modal.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddAgency(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-agency-form">{editingAgencyId ? t('common.save') : t('common.add')}</Button>
          </>
        }
      >
        <form id="ref-agency-form" onSubmit={handleSaveAgency} className="space-y-4">
          <Field label={t('references.agencies.field.name')} required htmlFor="ref-agency-name">
            <Input
              id="ref-agency-name"
              type="text"
              required
              placeholder={t('references.agencies.field.name_placeholder')}
              value={agencyForm.name}
              onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })}
            />
          </Field>
          <Field label={t('common.phone')} htmlFor="ref-agency-phone">
            <Input
              id="ref-agency-phone"
              type="text"
              value={agencyForm.phone}
              onChange={(e) => setAgencyForm({ ...agencyForm, phone: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* MODAL: Agent (agentlik id'si tanlangan bo'lsagina ochiladi) */}
      {showAddAgent && (
        <Modal
          open
          onClose={closeAgentModal}
          title={editingAgentId ? t('references.agents.modal.editTitle') : t('references.agents.modal.title')}
          footer={
            <>
              <Button variant="secondary" onClick={closeAgentModal}>{t('common.cancel')}</Button>
              <Button type="submit" form="ref-agent-form">{editingAgentId ? t('common.save') : t('common.add')}</Button>
            </>
          }
        >
          <form id="ref-agent-form" onSubmit={(e) => handleSaveAgent(showAddAgent, e)} className="space-y-4">
            <Field label={t('references.agents.field.name')} required htmlFor="ref-agent-name">
              <Input
                id="ref-agent-name"
                type="text"
                required
                placeholder={t('references.agents.field.name_placeholder')}
                value={agentForm.name}
                onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
              />
            </Field>
            <Field label={t('common.phone')} htmlFor="ref-agent-phone">
              <Input
                id="ref-agent-phone"
                type="text"
                value={agentForm.phone}
                onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
              />
            </Field>
          </form>
        </Modal>
      )}

      {/* MODAL: Xaridor */}
      <Modal
        open={showAddBuyer}
        onClose={() => setShowAddBuyer(false)}
        title={editingBuyerId ? t('references.buyers.modal.editTitle') : t('references.buyers.modal.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddBuyer(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-buyer-form">{editingBuyerId ? t('common.save') : t('common.add')}</Button>
          </>
        }
      >
        <form id="ref-buyer-form" onSubmit={handleSaveBuyer} className="space-y-4">
          <Field label={t('references.buyers.col.name')} required htmlFor="ref-buyer-name">
            <Input
              id="ref-buyer-name"
              type="text"
              required
              placeholder={t('references.buyers.field.name_placeholder')}
              value={buyerForm.name}
              onChange={(e) => setBuyerForm({ ...buyerForm, name: e.target.value })}
            />
          </Field>
          <Field label={t('common.phone')} htmlFor="ref-buyer-phone">
            <Input
              id="ref-buyer-phone"
              type="text"
              value={buyerForm.phone}
              onChange={(e) => setBuyerForm({ ...buyerForm, phone: e.target.value })}
            />
          </Field>
          <label htmlFor="optCheck" className="flex min-h-touch cursor-pointer items-center gap-2 text-sm text-fg-secondary">
            <input
              type="checkbox"
              id="optCheck"
              checked={buyerForm.isWholesale}
              onChange={(e) => setBuyerForm({ ...buyerForm, isWholesale: e.target.checked })}
              className={checkboxClass}
            />
            {t('references.buyers.field.wholesale')}
          </label>
        </form>
      </Modal>
    </div>
  );
};
export default ReferencesPage;
