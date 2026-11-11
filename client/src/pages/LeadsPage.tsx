import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, 
  PhoneCall, 
  UserPlus, 
  Search, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  AlertTriangle, 
  ShieldCheck, 
  Layers, 
  X, 
  Calendar,
  Sparkles,
  Trophy,
  Filter
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

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

export const LeadsPage: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [teamStats, setTeamStats] = useState<TeamStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'leads' | 'teams'>('leads');

  // New Lead Modal state
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

  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/leads', {
        params: { status: statusFilter, team: teamFilter, search },
      });
      setLeads(res.data);
    } catch (err) {
      console.error('Error fetching leads:', err);
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
          setDuplicateWarning(
            `Diqqat: Ushbu telefon raqami bazada mavjud (${res.data.existingLead?.fullName} - ${res.data.existingLead?.agentName})`
          );
        } else {
          setDuplicateWarning(null);
        }
      } catch (err) {}
    } else {
      setDuplicateWarning(null);
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
    } catch (err) {
      alert('Lid yaratishda xatolik yuz berdi');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await axios.put(`/api/leads/${id}`, { status: newStatus });
      fetchLeads();
      fetchTeams();
    } catch (err) {
      alert('Statusni o\'zgartirishda xatolik');
    }
  };

  // Convert Lead to Deal (Navigates to /deals with state)
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

  // KPI calculations
  const totalLeads = leads.length;
  const convertedLeads = leads.filter((l) => l.status === 'BITIMGA_OTDI').length;
  const visitScheduled = leads.filter((l) => l.status === 'OFISGA_BELGILANDI').length;
  const totalLimit = leads.reduce((acc, curr) => acc + Number(curr.approvedLimit || 0), 0);
  const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : '0';

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('uz-UZ').format(num);
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'YANGI':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Yangi</span>;
      case 'BOGLANILDI':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">Bog'lanildi</span>;
      case 'LIMIT_TEKSHIRILDI':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Limit tekshirildi</span>;
      case 'OFISGA_BELGILANDI':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300">Ofisga keladi</span>;
      case 'BITIMGA_OTDI':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Bitimga o'tdi</span>;
      case 'BEKOR_QILINDI':
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">Bekor qilindi</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">{st}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight">
              Lidlar va Koll-markaz (CRM)
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 uppercase">
              TZ 5.0
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Mijoz murojaatlari, koll-markaz jamoalari (Jahongir & Farida) va konversiya nazorati
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab switcher: Leads vs Rankings */}
          <div className="p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl flex items-center shadow-inner">
            <button
              onClick={() => setActiveTab('leads')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'leads'
                  ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Lidlar ro'yxati</span>
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'teams'
                  ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Jamoalar reytingi</span>
            </button>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-3d py-2 px-3.5 rounded-xl font-bold text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-600/30 flex items-center gap-1.5 active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Yangi Lid</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">Jami Lidlar</p>
          <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white mt-1">{totalLeads}</p>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">Barcha murojaatlar</span>
        </div>

        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">Ofisga BelGilandi</p>
          <p className="text-xl sm:text-2xl font-black text-cyan-600 dark:text-cyan-400 mt-1">{visitScheduled}</p>
          <span className="text-[10px] text-slate-500 font-semibold">Tashrif kutilmoqda</span>
        </div>

        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">Bitimga O'tgan</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{convertedLeads}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">Muvaffaqiyatli</span>
        </div>

        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">Konversiya %</p>
          <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{conversionRate}%</p>
          <span className="text-[10px] text-indigo-500 font-semibold">Lid → Bitim ulushi</span>
        </div>

        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm col-span-2 lg:col-span-1">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">Tasdiqlangan Limit</p>
          <p className="text-lg sm:text-xl font-black text-purple-600 dark:text-purple-400 mt-1 truncate">
            {formatNumber(totalLimit)} <span className="text-xs font-normal">UZS</span>
          </p>
          <span className="text-[10px] text-slate-500 font-semibold">Mavjud summa</span>
        </div>
      </div>

      {activeTab === 'teams' ? (
        /* Team Rankings View (TZ 5.1) */
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-600 text-white shadow-md">
                <Trophy className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                  Koll-markaz Jamoalari Samaradorligi (TZ 5.1)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Jahongir va Farida jamoalari bo'yicha cheklar soni, konversiya va umumiy limit aylanmasi
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamStats.map((team, idx) => (
              <div
                key={team.id}
                className="card-3d p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center font-black text-base shadow-md">
                      #{idx + 1}
                    </div>
                    <div>
                      <h4 className="font-black text-base text-slate-800 dark:text-white">
                        {team.leaderName} Jamoasi
                      </h4>
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-bold">
                        Rahbar: {team.leaderName}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Konversiya: {team.conversionRate}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Lidlar</span>
                    <p className="text-base font-black text-slate-800 dark:text-white">{team.totalLeads}</p>
                  </div>
                  <div className="border-x border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Bitimlar</span>
                    <p className="text-base font-black text-emerald-600">{team.convertedLeads}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Bekor</span>
                    <p className="text-base font-black text-rose-500">{team.cancelledLeads}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase mb-2">Jamoa A'zolari:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {team.members.map((m, mIdx) => (
                      <span
                        key={mIdx}
                        className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Leads List View */
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="card-3d p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Lid qidirish: F.I.Sh, telefon, agent..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Status filter dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-2 px-3 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none"
              >
                <option value="ALL">Barcha statuslar</option>
                <option value="YANGI">Yangi</option>
                <option value="BOGLANILDI">Bog'lanildi</option>
                <option value="LIMIT_TEKSHIRILDI">Limit tekshirildi</option>
                <option value="OFISGA_BELGILANDI">Ofisga belgilandi</option>
                <option value="BITIMGA_OTDI">Bitimga o'tdi</option>
                <option value="BEKOR_QILINDI">Bekor qilindi</option>
              </select>

              {/* Team filter dropdown */}
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="py-2 px-3 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none hidden sm:block"
              >
                <option value="ALL">Barcha jamoalar</option>
                <option value="Jahongir">Jahongir jamoasi</option>
                <option value="Farida">Farida jamoasi</option>
              </select>
            </div>
          </div>

          {/* Leads Table */}
          <div className="card-3d rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-4">№ / ID</th>
                    <th className="py-3 px-4">Mijoz F.I.Sh</th>
                    <th className="py-3 px-4">Telefon</th>
                    <th className="py-3 px-4">Limit / So'ralgan</th>
                    <th className="py-3 px-4">Bank & Do'kon</th>
                    <th className="py-3 px-4">Holati</th>
                    <th className="py-3 px-4">Mas'ul Agent</th>
                    <th className="py-3 px-4 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Lidlar yuklanmoqda...
                      </td>
                    </tr>
                  ) : leads.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Lidlar topilmadi
                      </td>
                    </tr>
                  ) : (
                    leads.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-purple-600 dark:text-purple-400">
                          #{l.leadNumber}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          {l.fullName}
                          {l.passportMasked && (
                            <span className="block text-[10px] text-slate-400 font-normal">
                              Pasport: {l.passportMasked}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {l.phone}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {formatNumber(l.approvedLimit || l.requestedAmount)} UZS
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            So'rov: {formatNumber(l.requestedAmount)} UZS
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold">{l.providerName}</span>
                          <span className="block text-[10px] text-slate-400">{l.partnerName}</span>
                        </td>
                        <td className="py-3 px-4">
                          {getStatusBadge(l.status)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold">{l.agentName}</span>
                          <span className="block text-[10px] text-slate-400">{l.teamName} jamoasi</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {l.status !== 'BITIMGA_OTDI' && (
                              <button
                                onClick={() => handleConvertToDeal(l)}
                                title="Bitimga o'tkazish"
                                className="py-1 px-2.5 rounded-lg font-bold text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-sm transition active:scale-95"
                              >
                                <span>Bitimga</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}

                            <select
                              value={l.status}
                              onChange={(e) => handleStatusChange(l.id, e.target.value)}
                              className="py-1 px-2 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                            >
                              <option value="YANGI">Yangi</option>
                              <option value="BOGLANILDI">Bog'lanildi</option>
                              <option value="LIMIT_TEKSHIRILDI">Limit tekshirildi</option>
                              <option value="OFISGA_BELGILANDI">Ofisga keladi</option>
                              <option value="BITIMGA_OTDI">Bitimga o'tdi</option>
                              <option value="BEKOR_QILINDI">Bekor</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* New Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight">Yangi Lid Qo'shish</h3>
                <p className="text-xs text-purple-100">Koll-markaz mijoz murojaatini ro'yxatga olish</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="p-5 overflow-y-auto space-y-3.5 text-xs">
              {duplicateWarning && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                  <span>{duplicateWarning}</span>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mijoz F.I.Sh *</label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Misol: Abdullayev Botir Alisherovich"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Telefon raqami *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Qo'shimcha tel</label>
                  <input
                    type="text"
                    value={formData.additionalPhone}
                    onChange={(e) => setFormData({ ...formData, additionalPhone: e.target.value })}
                    placeholder="+998 99..."
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">So'ralgan summa (UZS)</label>
                  <input
                    type="number"
                    value={formData.requestedAmount}
                    onChange={(e) => setFormData({ ...formData, requestedAmount: e.target.value })}
                    placeholder="10000000"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tasdiqlangan limit</label>
                  <input
                    type="number"
                    value={formData.approvedLimit}
                    onChange={(e) => setFormData({ ...formData, approvedLimit: e.target.value })}
                    placeholder="8000000"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bank / Platforma (TZ 4.1)</label>
                  <select
                    value={formData.providerName}
                    onChange={(e) => setFormData({ ...formData, providerName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="Imanium">Imanium (25% - Daftar)</option>
                    <option value="Alif online">Alif online</option>
                    <option value="Alif offline">Alif offline</option>
                    <option value="Infin Bank">Infin Bank</option>
                    <option value="Payme">Payme</option>
                    <option value="Trust 1">Trust 1</option>
                    <option value="Variant">Variant</option>
                    <option value="Paylater online">Paylater online</option>
                    <option value="Paylater offline">Paylater offline</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Hamkor Do'kon (TZ 4.2)</label>
                  <select
                    value={formData.partnerName}
                    onChange={(e) => setFormData({ ...formData, partnerName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="Qodir aka">Qodir aka (5% foyda)</option>
                    <option value="Planet phone">Planet phone</option>
                    <option value="Green bazar">Green bazar</option>
                    <option value="Denov">Denov</option>
                    <option value="Angren">Angren</option>
                    <option value="Samarqand">Samarqand</option>
                    <option value="Media park Angren">Media park Angren</option>
                    <option value="Trust">Trust</option>
                    <option value="Jizzax">Jizzax</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Jamoa (TZ 5.1)</label>
                  <select
                    value={formData.teamName}
                    onChange={(e) => setFormData({ ...formData, teamName: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="Jahongir">Jahongir Jamoasi</option>
                    <option value="Farida">Farida Jamoasi</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mas'ul Agent</label>
                  <input
                    type="text"
                    value={formData.agentName}
                    onChange={(e) => setFormData({ ...formData, agentName: e.target.value })}
                    placeholder="Agent ismi"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Murojaat Manbasi</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="Qo'ng'iroq">Qo'ng'iroq</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Telegram">Telegram</option>
                    <option value="Tavsiya">Tavsiya</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ofisga tashrif sanasi</label>
                  <input
                    type="date"
                    value={formData.visitDate}
                    onChange={(e) => setFormData({ ...formData, visitDate: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Qo'shimcha izoh</label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Mijoz ehtiyoji, shartlar..."
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-3d py-2 px-5 rounded-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30"
                >
                  Lidni Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsPage;
