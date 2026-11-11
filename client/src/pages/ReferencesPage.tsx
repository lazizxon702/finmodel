import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Settings, Store, Building2, Users, Percent, ShoppingBag, 
  Plus, Edit, Save, CheckCircle, RefreshCw, Sliders, Shield
} from 'lucide-react';
import { formatPercent } from '../utils/format';

export const ReferencesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'RULES' | 'PROVIDERS' | 'STORES' | 'AGENCIES' | 'BUYERS' | 'SETTINGS'>('RULES');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Data states
  const [rules, setRules] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);

  // Modals & form state
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

  // Rule actions
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRule) {
        await axios.put(`/api/references/rules/${editingRule.id}`, {
          ...ruleForm,
          storeId: ruleForm.storeId || null,
          providerId: ruleForm.providerId || null,
        });
        notify('Qoida yangilandi');
      } else {
        await axios.post('/api/references/rules', {
          ...ruleForm,
          storeId: ruleForm.storeId || null,
          providerId: ruleForm.providerId || null,
        });
        notify('Yangi qoida saqlandi');
      }
      setShowAddRuleModal(false);
      setEditingRule(null);
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Xatolik yuz berdi');
    }
  };

  // Store actions
  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/references/stores', storeForm);
      setShowAddStore(false);
      setStoreForm({ name: '', contactPhone: '', address: '' });
      notify('Do\'kon qo\'shildi');
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Xatolik');
    }
  };

  // Provider actions
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/references/providers', providerForm);
      setShowAddProvider(false);
      setProviderForm({ name: '', defaultDiscount: 0.25, isDaftarDefault: false });
      notify('Provayder qo\'shildi');
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Xatolik');
    }
  };

  // Agency actions
  const handleSaveAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/references/agencies', agencyForm);
      setShowAddAgency(false);
      setAgencyForm({ name: '', phone: '' });
      notify('Agentlik qo\'shildi');
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Xatolik');
    }
  };

  const handleSaveAgent = async (agencyId: string, e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`/api/references/agencies/${agencyId}/agents`, agentForm);
      setShowAddAgent(null);
      setAgentForm({ name: '', phone: '' });
      notify('Agent qo\'shildi');
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Xatolik');
    }
  };

  // Buyer actions
  const handleSaveBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/references/buyers', buyerForm);
      setShowAddBuyer(false);
      setBuyerForm({ name: '', phone: '', isWholesale: true });
      notify('Xaridor qo\'shildi');
      fetchAll();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Xatolik');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sliders className="w-7 h-7 text-indigo-600" />
            Spravochniklar va Sozlamalar (Справочники)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Agent komissiyalari stavkalari, provayderlar, hamkor do'konlar va tizim koeffitsiyentlari
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yangilash
        </button>
      </div>

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('RULES')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'RULES'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Percent className="w-4 h-4" />
            Agent Komissiya Qoidalari
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800">
              {rules.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('PROVIDERS')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'PROVIDERS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Banklar va Ilovalar
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
              {providers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('STORES')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'STORES'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Store className="w-4 h-4" />
            Do'konlar va Hamkorlar
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
              {stores.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('AGENCIES')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'AGENCIES'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            Agentliklar va Agentlar
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">
              {agencies.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('BUYERS')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'BUYERS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Xaridorlar (Ulgurji)
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
              {buyers.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'SETTINGS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Settings className="w-4 h-4" />
            Tizim Parametrlari
          </button>
        </nav>
      </div>

      {/* TAB 1: Commission Rules */}
      {activeTab === 'RULES' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
            <div className="text-xs text-indigo-900 leading-relaxed max-w-2xl">
              <span className="font-semibold">Dinamik hisoblash formulasi:</span> Agent summasi = P × (S − X).
              Bunda X — ushbu jadvaldagi ustuvorlik bo'yicha mos kelgan foiz. Istalgan vaqtda foizlarni o'zgartirishingiz mumkin va bu barcha yangi bitimlarda avtomatik qo'llaniladi.
            </div>
            <button
              onClick={() => {
                setEditingRule(null);
                setRuleForm({ name: '', storeId: '', providerId: '', ratePercent: 0.22, priority: 1 });
                setShowAddRuleModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              Yangi qoida qo'shish
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Qoida nomi</th>
                  <th className="py-3 px-4">Do'kon / Hamkor</th>
                  <th className="py-3 px-4">Bank / Provayder</th>
                  <th className="py-3 px-4 text-right">Stavka % (X)</th>
                  <th className="py-3 px-4 text-center">Ustuvorlik</th>
                  <th className="py-3 px-4 text-center">Holat</th>
                  <th className="py-3 px-4 text-center">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-indigo-50/20">
                    <td className="py-3 px-4 font-semibold text-gray-900">{rule.name}</td>
                    <td className="py-3 px-4 text-gray-700">{rule.store?.name || 'Har qanday do\'kon'}</td>
                    <td className="py-3 px-4 text-gray-700">{rule.provider?.name || 'Har qanday bank'}</td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-600 text-sm">
                      {formatPercent(rule.ratePercent)}
                    </td>
                    <td className="py-3 px-4 text-center font-medium text-gray-600">{rule.priority}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        rule.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rule.isActive ? 'Faol' : 'Faol emas'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
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
                        className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Tahrirlash
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Providers */}
      {activeTab === 'PROVIDERS' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">Mijozlar limiti yechiladigan banklar va ilovalar ro'yxati</p>
            <button
              onClick={() => setShowAddProvider(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Yangi bank qo'shish
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Bank / Ilova nomi</th>
                  <th className="py-3 px-4 text-right">Standart diskont %</th>
                  <th className="py-3 px-4 text-center">Daftar hisobi</th>
                  <th className="py-3 px-4 text-center">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {providers.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-semibold text-gray-900">{p.name}</td>
                    <td className="py-3 px-4 text-right font-medium text-gray-700">{formatPercent(p.defaultDiscount)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        p.isDaftarDefault ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {p.isDaftarDefault ? 'Ha (Daftar)' : 'Yo\'q'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-400 font-mono text-[10px]">{p.id.slice(0, 8)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Stores */}
      {activeTab === 'STORES' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">Hamkor savdo nuqtalari va do'konlar</p>
            <button
              onClick={() => setShowAddStore(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Yangi do'kon qo'shish
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Do'kon nomi</th>
                  <th className="py-3 px-4">Aloqa telefoni</th>
                  <th className="py-3 px-4">Manzil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stores.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-semibold text-gray-900">{s.name}</td>
                    <td className="py-3 px-4 text-gray-600">{s.contactPhone || '-'}</td>
                    <td className="py-3 px-4 text-gray-500">{s.address || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Agencies & Agents */}
      {activeTab === 'AGENCIES' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">Biz bilan ishlaydigan agentliklar va ularga biriktirilgan agentlar</p>
            <button
              onClick={() => setShowAddAgency(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Yangi agentlik qo'shish
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agencies.map((agency) => (
              <div key={agency.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-indigo-600" />
                      {agency.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{agency.phone || 'Telefon yo\'q'}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowAddAgent(agency.id);
                      setAgentForm({ name: '', phone: '' });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agent qo'shish
                  </button>
                </div>

                <div className="border-t border-gray-100 pt-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase">Agentlar ro'yxati:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {agency.agents?.length > 0 ? (
                      agency.agents.map((agt: any) => (
                        <span key={agt.id} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                          {agt.name}
                          {agt.phone && <span className="text-gray-400 ml-1 text-[10px]">({agt.phone})</span>}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400 italic">Hali agentlar kiritilmagan</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: Buyers */}
      {activeTab === 'BUYERS' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">Texnika sotib oluvchi ulgurji va chakana mijozlar</p>
            <button
              onClick={() => setShowAddBuyer(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Yangi xaridor qo'shish
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Xaridor F.I.O. / Nomi</th>
                  <th className="py-3 px-4">Telefon</th>
                  <th className="py-3 px-4 text-center">Mijoz turi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {buyers.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-semibold text-gray-900">{b.name}</td>
                    <td className="py-3 px-4 text-gray-600">{b.phone || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        b.isWholesale ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {b.isWholesale ? 'Ulgurji (Опт)' : 'Chakana'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: Settings */}
      {activeTab === 'SETTINGS' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Tizim bo'yicha global sozlamalar va koeffitsiyentlar</p>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Kalit (Key)</th>
                  <th className="py-3 px-4">Qiymat</th>
                  <th className="py-3 px-4">Tavsif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settings.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono font-semibold text-gray-800">{s.key}</td>
                    <td className="py-3 px-4 font-bold text-indigo-700">{s.value}</td>
                    <td className="py-3 px-4 text-gray-600">{s.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Rule */}
      {showAddRuleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-base">
                {editingRule ? 'Qoidani Tahrirlash' : 'Yangi Komissiya Qoidasi'}
              </h3>
              <button onClick={() => setShowAddRuleModal(false)} className="text-gray-400 font-bold">&times;</button>
            </div>
            <form onSubmit={handleSaveRule} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Qoida nomi</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Alif Online stavkasi"
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Hamkor Do'kon (ixtiyoriy)</label>
                <select
                  value={ruleForm.storeId}
                  onChange={(e) => setRuleForm({ ...ruleForm, storeId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- Barcha do'konlar uchun --</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank / Provayder (ixtiyoriy)</label>
                <select
                  value={ruleForm.providerId}
                  onChange={(e) => setRuleForm({ ...ruleForm, providerId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- Barcha banklar uchun --</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Agent foizi X (0.22 = 22%)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    onFocus={(e) => e.target.select()}
                    value={ruleForm.ratePercent}
                    onChange={(e) => setRuleForm({ ...ruleForm, ratePercent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ustuvorlik (Priority)</label>
                  <input
                    type="number"
                    required
                    onFocus={(e) => e.target.select()}
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddRuleModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Store */}
      {showAddStore && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900 text-base pb-3 border-b border-gray-100">Yangi Do'kon Qo'shish</h3>
            <form onSubmit={handleSaveStore} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Do'kon nomi</label>
                <input
                  type="text"
                  required
                  value={storeForm.name}
                  onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefon raqam</label>
                <input
                  type="text"
                  value={storeForm.contactPhone}
                  onChange={(e) => setStoreForm({ ...storeForm, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Manzil</label>
                <input
                  type="text"
                  value={storeForm.address}
                  onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAddStore(false)} className="px-4 py-2 border rounded-lg text-xs">Bekor qilish</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Qo'shish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Provider */}
      {showAddProvider && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900 text-base pb-3 border-b border-gray-100">Yangi Bank / Provayder Qo'shish</h3>
            <form onSubmit={handleSaveProvider} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Bank yoki Ilova nomi</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Anor Bank"
                  value={providerForm.name}
                  onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Standart diskont foizi (0.25 = 25%)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  onFocus={(e) => e.target.select()}
                  value={providerForm.defaultDiscount}
                  onChange={(e) => setProviderForm({ ...providerForm, defaultDiscount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="daftarCheck"
                  checked={providerForm.isDaftarDefault}
                  onChange={(e) => setProviderForm({ ...providerForm, isDaftarDefault: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="daftarCheck" className="text-xs font-medium text-gray-700">Daftar hisobiga kiradimi?</label>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAddProvider(false)} className="px-4 py-2 border rounded-lg text-xs">Bekor qilish</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Qo'shish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Agency */}
      {showAddAgency && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900 text-base pb-3 border-b border-gray-100">Yangi Agentlik Qo'shish</h3>
            <form onSubmit={handleSaveAgency} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Agentlik nomi</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Asadbek team"
                  value={agencyForm.name}
                  onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="text"
                  value={agencyForm.phone}
                  onChange={(e) => setAgencyForm({ ...agencyForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAddAgency(false)} className="px-4 py-2 border rounded-lg text-xs">Bekor qilish</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Qo'shish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Agent */}
      {showAddAgent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900 text-base pb-3 border-b border-gray-100">Agent Qo'shish</h3>
            <form onSubmit={(e) => handleSaveAgent(showAddAgent, e)} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Agent ismi</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Sardor"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="text"
                  value={agentForm.phone}
                  onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAddAgent(null)} className="px-4 py-2 border rounded-lg text-xs">Bekor qilish</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Qo'shish</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Buyer */}
      {showAddBuyer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="font-bold text-gray-900 text-base pb-3 border-b border-gray-100">Yangi Xaridor Qo'shish</h3>
            <form onSubmit={handleSaveBuyer} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Xaridor nomi / F.I.O.</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Malika Optom"
                  value={buyerForm.name}
                  onChange={(e) => setBuyerForm({ ...buyerForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="text"
                  value={buyerForm.phone}
                  onChange={(e) => setBuyerForm({ ...buyerForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="optCheck"
                  checked={buyerForm.isWholesale}
                  onChange={(e) => setBuyerForm({ ...buyerForm, isWholesale: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="optCheck" className="text-xs font-medium text-gray-700">Ulgurji xaridormi (Optom)?</label>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAddBuyer(false)} className="px-4 py-2 border rounded-lg text-xs">Bekor qilish</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Qo'shish</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default ReferencesPage;