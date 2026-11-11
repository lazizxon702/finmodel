import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Users,
  Search,
  Filter,
  Calendar,
  X,
  Briefcase,
  TrendingUp,
  CreditCard,
  Wallet,
  Clock,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  Sparkles,
  Phone,
  UserCheck,
  RefreshCw,
  Building,
  Coins,
  ArrowUpRight,
} from 'lucide-react';
import { formatMoney, formatPercent, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';

export const AgentsPage: React.FC = () => {
  const { t } = useTranslation();

  const [items, setItems] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedAgencyId, setSelectedAgencyId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Catalogs
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [agenciesList, setAgenciesList] = useState<any[]>([]);
  const [selectedAgentInfo, setSelectedAgentInfo] = useState<any>(null);

  useEffect(() => {
    fetchAgentsDeals();
  }, [search, selectedAgentId, selectedAgencyId, statusFilter, startDate, endDate, page]);

  const fetchAgentsDeals = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedAgentId) params.append('agentId', selectedAgentId);
      if (selectedAgencyId) params.append('agencyId', selectedAgencyId);
      if (statusFilter) params.append('status', statusFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('page', String(page));
      params.append('limit', '50');

      const res = await axios.get(`/api/agents/deals?${params.toString()}`);
      setItems(res.data.items || []);
      setTotals(res.data.totals || null);
      setSelectedAgentInfo(res.data.selectedAgent || null);
      if (res.data.agentsList) setAgentsList(res.data.agentsList);
      if (res.data.agenciesList) setAgenciesList(res.data.agenciesList);
      if (res.data.pagination) setTotalPages(res.data.pagination.totalPages || 1);
    } catch (err) {
      console.error('Fetch agents deals error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuickAgent = (agentId: string) => {
    if (selectedAgentId === agentId) {
      setSelectedAgentId('');
    } else {
      setSelectedAgentId(agentId);
      setPage(1);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedAgentId('');
    setSelectedAgencyId('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  // Top 10 most active agents for the quick CRM switcher pills
  const topActiveAgents = [...agentsList]
    .filter((ag) => ag.dealCount > 0)
    .sort((a, b) => b.dealCount - a.dealCount)
    .slice(0, 10);

  const byStatus = totals?.byStatus || {
    PENDING: { count: 0, volume: 0 },
    IN_WAREHOUSE: { count: 0, volume: 0 },
    SOLD: { count: 0, volume: 0 },
    NEED_TO_BUY: { count: 0, volume: 0 },
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            Kutilmoqda
          </span>
        );
      case 'IN_WAREHOUSE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            <Package className="w-3 h-3" />
            Omborda
          </span>
        );
      case 'SOLD':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Sotilgan
          </span>
        );
      case 'NEED_TO_BUY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            Sotib olish kerak
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {status || '-'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* Top Banner / CRM Header */}
      <div className="card-3d flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white rounded-3xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                <span>Agentlar Shaxsiy CRM & Hisob-kitob Tizimi</span>
                <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Har bir agentning shaxsiy aylanmasi, hisoblangan komissiyasi, mijozlari va bitimlar tahlili
              </p>
            </div>
          </div>
        </div>

        {/* Selected Agent Quick Overview in Banner */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-4 py-2 bg-purple-500/15 border border-purple-500/30 rounded-2xl flex items-center gap-2.5">
            <UserCheck className="w-4 h-4 text-purple-400" />
            <div>
              <span className="text-[10px] text-purple-300 font-semibold uppercase block">Faol Agent CRM:</span>
              <span className="text-xs sm:text-sm font-black text-white">
                {selectedAgentInfo ? selectedAgentInfo.name : 'Barcha Agentlar (Umumiy)'}
              </span>
            </div>
          </div>

          <button
            onClick={fetchAgentsDeals}
            title="Yangilash"
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* QUICK AGENT SWITCHER PILLS (TEZKOR CRM ALMASHTIRGICH) */}
      <div className="p-3 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-purple-500" />
            <span>Agent tanlash (Tezkor CRM kabineti):</span>
          </span>
          {selectedAgentId && (
            <button
              onClick={() => setSelectedAgentId('')}
              className="text-[11px] font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Umumiy ko'rinishga qaytish</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedAgentId('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
              !selectedAgentId
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/25 scale-105'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>🌐 Barchasi ({agentsList.length} agent)</span>
          </button>

          {topActiveAgents.map((ag) => (
            <button
              key={ag.id}
              type="button"
              onClick={() => handleSelectQuickAgent(ag.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                selectedAgentId === ag.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-500/30 scale-105 font-black ring-2 ring-purple-400'
                  : 'bg-slate-100 hover:bg-purple-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <span>{ag.name}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  selectedAgentId === ag.id
                    ? 'bg-white/25 text-white'
                    : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                }`}
              >
                {ag.dealCount}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* TOP AGENT CRM KPI SUMMARY CARDS (6 TA HISOB-KITOB METRIKASI) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 w-full">
        {/* Card 1: Deals Count */}
        <div className="card-3d p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Bitimlar Soni
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-2">
            {totals?.dealCount || 0} ta
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {selectedAgentInfo ? `${selectedAgentInfo.name} bitimlari` : 'Barcha agentlar jami'}
          </p>
        </div>

        {/* Card 2: Limit Volume */}
        <div className="card-3d p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Yechilgan Limit
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
            {formatMoney(totals?.totalWithdrawn)}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Umumiy aylanma summasi</p>
        </div>

        {/* Card 3: Agent Commission */}
        <div className="card-3d p-4 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border border-purple-500/30 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Agent Komissiyasi
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-md shadow-purple-500/25">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300 mt-2">
            {formatMoney(totals?.totalAgentCommission)}
          </h3>
          <p className="text-[11px] text-purple-600/80 dark:text-purple-400/80 mt-0.5">Agentga tegishli haq</p>
        </div>

        {/* Card 4: Customer Payout */}
        <div className="card-3d p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mijozga To'lov
            </span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-cyan-700 dark:text-cyan-400 mt-2">
            {formatMoney(totals?.totalCalculated)}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Berilgan naqd/kartaga</p>
        </div>

        {/* Card 5: Net Profit */}
        <div className="card-3d p-4 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Kompaniya Foydasi
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/25">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-2">
            {formatMoney(totals?.totalProfit)}
          </h3>
          <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Keltirilgan sof foyda</p>
        </div>

        {/* Card 6: Average Rates */}
        <div className="card-3d p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              O'rtacha Stavka %
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-2">
            {totals?.avgAgentPct || 0}%
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Diskont: {totals?.avgDiscountPct || 0}%
          </p>
        </div>
      </div>

      {/* AGENT CRM PIPELINE / FUNNEL STATUS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
              ⏳ Kutilmoqda (Pending)
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white mt-1 block">
              {byStatus.PENDING?.count || 0} ta bitim
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {formatMoney(byStatus.PENDING?.volume || 0)}
            </span>
          </div>
        </div>

        <div className="p-3.5 bg-blue-500/10 border border-blue-500/25 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">
              📦 Omborda (Warehouse)
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white mt-1 block">
              {byStatus.IN_WAREHOUSE?.count || 0} ta bitim
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {formatMoney(byStatus.IN_WAREHOUSE?.volume || 0)}
            </span>
          </div>
        </div>

        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">
              ✅ Sotilgan (Sold)
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white mt-1 block">
              {byStatus.SOLD?.count || 0} ta bitim
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {formatMoney(byStatus.SOLD?.volume || 0)}
            </span>
          </div>
        </div>

        <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 block">
              🛒 Sotib Olish Kerak
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white mt-1 block">
              {byStatus.NEED_TO_BUY?.count || 0} ta bitim
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {formatMoney(byStatus.NEED_TO_BUY?.volume || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* FILTER BAR (AGENTLAR, AGENTLIK, STATUS VA SANA FILTRI) */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Agentlar va Hisob-kitob Filtrlari:
            </span>
          </div>

          {(search || selectedAgentId || selectedAgencyId || statusFilter || startDate || endDate) && (
            <button
              onClick={handleResetFilters}
              className="px-3 py-1 text-xs font-bold text-rose-500 hover:text-white hover:bg-rose-500 rounded-xl transition flex items-center gap-1 border border-rose-500/30"
            >
              <X className="w-3.5 h-3.5" />
              <span>Filtrlarni tozalash</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Chek, mijoz, telefon..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            />
          </div>

          {/* Agent Dropdown */}
          <div>
            <select
              value={selectedAgentId}
              onChange={(e) => {
                setSelectedAgentId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-bold text-purple-700 dark:text-purple-300"
            >
              <option value="">👤 Barcha Agentlar ({agentsList.length})</option>
              {agentsList.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.agencyName || 'Agentliksiz'}) — {ag.dealCount} ta
                </option>
              ))}
            </select>
          </div>

          {/* Agency Dropdown */}
          <div>
            <select
              value={selectedAgencyId}
              onChange={(e) => {
                setSelectedAgencyId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            >
              <option value="">🏢 Barcha Agentliklar ({agenciesList.length})</option>
              {agenciesList.map((agc) => (
                <option key={agc.id} value={agc.id}>
                  {agc.name} ({agc.dealCount} ta bitim)
                </option>
              ))}
            </select>
          </div>

          {/* Status Dropdown */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-medium"
            >
              <option value="">📌 Barcha Holatlar</option>
              <option value="PENDING">Kutilmoqda (Pending)</option>
              <option value="IN_WAREHOUSE">Omborda (In Warehouse)</option>
              <option value="SOLD">Sotilgan (Sold)</option>
              <option value="NEED_TO_BUY">Sotib olish kerak</option>
            </select>
          </div>

          {/* Date range inputs */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-1/2 px-2 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
            />
            <span className="text-slate-400 text-xs">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-1/2 px-2 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
            />
          </div>
        </div>

        {/* Quick Date Presets */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
            Sana tugmalari:
          </span>
          <button
            type="button"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              setStartDate(today);
              setEndDate(today);
            }}
            className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition"
          >
            Bugun
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              const yest = d.toISOString().slice(0, 10);
              setStartDate(yest);
              setEndDate(yest);
            }}
            className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition"
          >
            Kecha
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const past7 = new Date();
              past7.setDate(now.getDate() - 7);
              setStartDate(past7.toISOString().slice(0, 10));
              setEndDate(now.toISOString().slice(0, 10));
            }}
            className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition"
          >
            Oxirgi 7 kun
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
              const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
              setStartDate(firstDay);
              setEndDate(lastDay);
            }}
            className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition"
          >
            Shu oy
          </button>
        </div>
      </div>

      {/* MAIN AGENT CRM DEALS TABLE */}
      <div className="card-3d bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-purple-600" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              {selectedAgentInfo ? `${selectedAgentInfo.name} — Shaxsiy Bitimlari va Hisob-kitoblari` : "Barcha Agentlar Bitimlari Ro'yxati"}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
              {items.length} ta bitim
            </span>
          </div>
        </div>

        <div className="table-scroll-container custom-scrollbar overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-3 py-3 text-center whitespace-nowrap">№</th>
                <th className="px-3 py-3 whitespace-nowrap">Chek №</th>
                <th className="px-3 py-3 whitespace-nowrap">Sana</th>
                <th className="px-3 py-3 whitespace-nowrap">Agentlik</th>
                <th className="px-3 py-3 whitespace-nowrap">Agent</th>
                <th className="px-3 py-3 whitespace-nowrap">Mijoz (F.I.O)</th>
                <th className="px-3 py-3 whitespace-nowrap">Mahsulot</th>
                <th className="px-3 py-3 text-center whitespace-nowrap">Holat</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Yechilgan limit</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Mijozga to'lov</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Diskont %</th>
                <th className="px-3 py-3 text-right whitespace-nowrap bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300">
                  Agent summasi
                </th>
                <th className="px-3 py-3 text-right whitespace-nowrap">% Agenta</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Sof foyda</th>
              </tr>
            </thead>

            {/* Summary Sticky Top Row */}
            <tbody className="bg-purple-100/70 dark:bg-purple-950/70 font-black border-b border-purple-300 dark:border-purple-800 text-purple-950 dark:text-purple-200">
              <tr>
                <td className="px-3 py-2 text-center text-[11px]" colSpan={8}>
                  JAMI YIG'INDI (Tanlangan filtrlar bo'yicha):
                </td>
                <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-white">
                  {formatMoney(totals?.totalWithdrawn)}
                </td>
                <td className="px-3 py-2 text-right font-black text-cyan-800 dark:text-cyan-300">
                  {formatMoney(totals?.totalCalculated)}
                </td>
                <td className="px-3 py-2 text-right font-bold text-slate-600 dark:text-slate-300">
                  {totals?.avgDiscountPct}%
                </td>
                <td className="px-3 py-2 text-right font-black text-purple-700 dark:text-purple-300 bg-purple-200/60 dark:bg-purple-900/60">
                  {formatMoney(totals?.totalAgentCommission)}
                </td>
                <td className="px-3 py-2 text-right font-bold text-purple-700 dark:text-purple-300">
                  {totals?.avgAgentPct}%
                </td>
                <td className="px-3 py-2 text-right font-black text-emerald-700 dark:text-emerald-400">
                  {formatMoney(totals?.totalProfit)}
                </td>
              </tr>
            </tbody>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-400">
                    <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                    Agent ma'lumotlari yuklanmoqda...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-12 text-center text-slate-400">
                    Hech qanday agent bitimi topilmadi
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="hover:bg-purple-50/30 dark:hover:bg-slate-800/40 transition">
                    <td className="px-3 py-2.5 text-center font-bold text-slate-400">{it.index}</td>
                    <td className="px-3 py-2.5 font-black text-purple-600 dark:text-purple-400">
                      №{it.dealNumber}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      {formatDate(it.date)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                      {it.agencyName}
                    </td>
                    <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">
                      <span className="flex items-center gap-1">
                        <span>{it.agentName}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                      <div>{it.customerName}</div>
                      <div className="text-[10px] text-slate-400">{it.customerPhone1}</div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[170px] truncate" title={it.productName}>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{it.productName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {renderStatusBadge(it.status)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-slate-900 dark:text-white">
                      {formatMoney(it.withdrawnLimit)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-cyan-700 dark:text-cyan-400">
                      {formatMoney(it.calculatedAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-500 dark:text-slate-400">
                      {formatPercent(it.purchaseDiscountPct)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-black text-purple-700 dark:text-purple-400 bg-purple-50/40 dark:bg-purple-950/20">
                      {formatMoney(it.agentAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-purple-600 dark:text-purple-400">
                      {formatPercent(it.agentPct)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(it.profit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>
            Jami: <b>{totals?.dealCount || 0} ta</b> bitim
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
            >
              Oldingi
            </button>
            <span>
              Sahifa {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
            >
              Keyingi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
