import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Settings, Store, Building2, Users, Percent, ShoppingBag,
  Plus, Edit, CheckCircle, RefreshCw, Sliders
} from 'lucide-react';
import { formatPercent } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';
import {
  Button, Card, Modal, PageHeader, Badge, Field, Input, Select,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, EmptyState, Tabs, cn,
} from '../components/ui';

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
  const [ruleForm, setRuleForm] = useState({
    name: '',
    storeId: '',
    providerId: '',
    ratePercent: 0.22,
    priority: 1,
  });

  const [showAddStore, setShowAddStore] = useState(false);
  const [storeForm, setStoreForm] = useState({ name: '', contactPhone: '', address: '' });

  const [showAddProvider, setShowAddProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({ name: '', defaultDiscount: 0.25, isDaftarDefault: false });

  const [showAddAgency, setShowAddAgency] = useState(false);
  const [agencyForm, setAgencyForm] = useState({ name: '', phone: '' });

  const [showAddAgent, setShowAddAgent] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState({ name: '', phone: '' });

  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [buyerForm, setBuyerForm] = useState({ name: '', phone: '', isWholesale: true });

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [rRes, pRes, sRes, aRes, bRes, setRes] = await Promise.all([
        axios.get('/api/references/rules'),
        axios.get('/api/references/providers'),
        axios.get('/api/references/stores'),
        axios.get('/api/references/agencies'),
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
  }, []);

  const notify = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  // Qoida amallari
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRule) {
        await axios.put(`/api/references/rules/${editingRule.id}`, {
          ...ruleForm,
          storeId: ruleForm.storeId || null,
          providerId: ruleForm.providerId || null,
        });
        notify(t('references.rules.updated'));
      } else {
        await axios.post('/api/references/rules', {
          ...ruleForm,
          storeId: ruleForm.storeId || null,
          providerId: ruleForm.providerId || null,
        });
        notify(t('references.rules.saved'));
      }
      setShowAddRuleModal(false);
      setEditingRule(null);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    }
  };

  // Do'kon amallari
  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/references/stores', storeForm);
      setShowAddStore(false);
      setStoreForm({ name: '', contactPhone: '', address: '' });
      notify(t('references.stores.added'));
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    }
  };

  // Provayder amallari
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/references/providers', providerForm);
      setShowAddProvider(false);
      setProviderForm({ name: '', defaultDiscount: 0.25, isDaftarDefault: false });
      notify(t('references.providers.added'));
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    }
  };

  // Agentlik amallari
  const handleSaveAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/references/agencies', agencyForm);
      setShowAddAgency(false);
      setAgencyForm({ name: '', phone: '' });
      notify(t('references.agencies.added'));
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    }
  };

  const handleSaveAgent = async (agencyId: string, e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`/api/references/agencies/${agencyId}/agents`, agentForm);
      setShowAddAgent(null);
      setAgentForm({ name: '', phone: '' });
      notify(t('references.agents.added'));
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    }
  };

  // Xaridor amallari
  const handleSaveBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/references/buyers', buyerForm);
      setShowAddBuyer(false);
      setBuyerForm({ name: '', phone: '', isWholesale: true });
      notify(t('references.buyers.added'));
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || t('common.save_error'));
    }
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
              onClick={() => {
                setEditingRule(null);
                setRuleForm({ name: '', storeId: '', providerId: '', ratePercent: 0.22, priority: 1 });
                setShowAddRuleModal(true);
              }}
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
                  <Th align="center">{t('references.rules.col.priority')}</Th>
                  <Th align="center">{t('common.status')}</Th>
                  <Th align="center">{t('common.actions')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rules.length === 0 && <TableEmpty colSpan={7} title={t('references.rules.empty')} />}
                {rules.map((rule) => (
                  <Tr key={rule.id}>
                    <Td className="font-semibold text-fg">{rule.name}</Td>
                    <Td className="text-fg-secondary">{rule.store?.name || t('references.rules.anyStore')}</Td>
                    <Td className="text-fg-secondary">{rule.provider?.name || t('references.rules.anyProvider')}</Td>
                    <Td align="right" numeric className="font-semibold text-accent">
                      {formatPercent(rule.ratePercent)}
                    </Td>
                    <Td align="center" numeric className="text-fg-secondary">{rule.priority}</Td>
                    <Td align="center">
                      <Badge tone={rule.isActive ? 'success' : 'neutral'}>
                        {rule.isActive ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </Td>
                    <Td align="center">
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Edit className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setEditingRule(rule);
                          setRuleForm({
                            name: rule.name,
                            storeId: rule.storeId || '',
                            providerId: rule.providerId || '',
                            ratePercent: Number(rule.ratePercent),
                            priority: rule.priority,
                          });
                          setShowAddRuleModal(true);
                        }}
                      >
                        {t('common.edit')}
                      </Button>
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
              <Button leftIcon={plusIcon} onClick={() => setShowAddProvider(true)}>
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
                  <Th align="center">{t('references.providers.col.id')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {providers.length === 0 && <TableEmpty colSpan={4} title={t('references.providers.empty')} />}
                {providers.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-semibold text-fg">{p.name}</Td>
                    <Td align="right" numeric className="text-fg-secondary">{formatPercent(p.defaultDiscount)}</Td>
                    <Td align="center">
                      <Badge tone={p.isDaftarDefault ? 'danger' : 'neutral'}>
                        {p.isDaftarDefault ? t('references.providers.daftarYes') : t('common.no')}
                      </Badge>
                    </Td>
                    <Td align="center" numeric className="font-mono text-xs text-fg-muted">{p.id.slice(0, 8)}...</Td>
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
              <Button leftIcon={plusIcon} onClick={() => setShowAddStore(true)}>
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
                </Tr>
              </Thead>
              <Tbody>
                {stores.length === 0 && <TableEmpty colSpan={3} title={t('references.stores.empty')} />}
                {stores.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-semibold text-fg">{s.name}</Td>
                    <Td numeric className="text-fg-secondary">{s.contactPhone || '-'}</Td>
                    <Td className="text-fg-muted">{s.address || '-'}</Td>
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
              <Button leftIcon={plusIcon} onClick={() => setShowAddAgency(true)}>
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
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setShowAddAgent(agency.id);
                      setAgentForm({ name: '', phone: '' });
                    }}
                  >
                    {t('references.agencies.addAgent')}
                  </Button>
                </div>

                <div className="border-t border-line pt-3">
                  <span className="text-xs font-medium text-fg-muted">{t('references.agencies.agentsList')}</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {agency.agents?.length > 0 ? (
                      agency.agents.map((agt: any) => (
                        <Badge key={agt.id}>
                          {agt.name}
                          {agt.phone && <span className="tabular-nums text-fg-muted">({agt.phone})</span>}
                        </Badge>
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
              <Button leftIcon={plusIcon} onClick={() => setShowAddBuyer(true)}>
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
                </Tr>
              </Thead>
              <Tbody>
                {buyers.length === 0 && <TableEmpty colSpan={3} title={t('references.buyers.empty')} />}
                {buyers.map((b) => (
                  <Tr key={b.id}>
                    <Td className="font-semibold text-fg">{b.name}</Td>
                    <Td numeric className="text-fg-secondary">{b.phone || '-'}</Td>
                    <Td align="center">
                      <Badge tone={b.isWholesale ? 'brand' : 'neutral'}>
                        {b.isWholesale ? t('references.buyers.wholesale') : t('references.buyers.retail')}
                      </Badge>
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
              {stores.map((s) => (
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
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
                required
                className="tabular-nums"
                onFocus={(e) => e.target.select()}
                value={ruleForm.ratePercent}
                onChange={(e) => setRuleForm({ ...ruleForm, ratePercent: parseFloat(e.target.value) || 0 })}
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
                onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 1 })}
              />
            </Field>
          </div>
        </form>
      </Modal>

      {/* MODAL: Do'kon */}
      <Modal
        open={showAddStore}
        onClose={() => setShowAddStore(false)}
        title={t('references.stores.modal.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddStore(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-store-form">{t('common.add')}</Button>
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
        title={t('references.providers.modal.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddProvider(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-provider-form">{t('common.add')}</Button>
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
        title={t('references.agencies.modal.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddAgency(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-agency-form">{t('common.add')}</Button>
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
          onClose={() => setShowAddAgent(null)}
          title={t('references.agents.modal.title')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowAddAgent(null)}>{t('common.cancel')}</Button>
              <Button type="submit" form="ref-agent-form">{t('common.add')}</Button>
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
        title={t('references.buyers.modal.title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddBuyer(false)}>{t('common.cancel')}</Button>
            <Button type="submit" form="ref-buyer-form">{t('common.add')}</Button>
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
