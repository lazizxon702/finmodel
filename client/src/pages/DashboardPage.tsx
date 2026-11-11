import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  TrendingUp,
  Layers,
  CreditCard,
  Users,
  Package,
  Wallet,
  ArrowUpRight,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Building,
  Store,
  Briefcase,
  ShoppingBag,
  Coins,
  ChevronDown,
  Sparkles,
  Receipt,
  Calendar,
  Zap,
  Globe,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { formatMoney, formatNumber, formatPercent, formatDate } from '../utils/format';
import { useTranslation } from '../context/LanguageContext';

export const DashboardPage: React.FC = () => {
  const { t, language } = useTranslation();
  const isRu = language === 'ru';
  const [swotData, setSwotData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'daily' | 'providers' | 'stores' | 'agencies'>('daily');
  const [loading, setLoading] = useState(true);

  // Period Selector: TODAY (default), ALL, CUSTOM
  const [periodMode, setPeriodMode] = useState<'TODAY' | 'ALL' | 'CUSTOM'>('TODAY');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchSwotDaily();
  }, [periodMode, startDate, endDate]);

  const fetchSwotDaily = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (periodMode === 'TODAY') {
        params.append('period', 'today');
      } else if (periodMode === 'CUSTOM') {
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
      }
      const res = await axios.get(`/api/deals/swot-daily?${params.toString()}`);
      setSwotData(res.data);
    } catch (err) {
      console.error('Failed to load SWOT daily aggregator:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !swotData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {isRu ? 'Загрузка аналитики SWOT и финансового агрегатора...' : 'SWOT tahlil va moliya agregatori yuklanmoqda...'}
          </p>
        </div>
      </div>
    );
  }

  const summary = swotData?.summary || {};
  const todayKPI = swotData?.todayKPI || {};
  const isTodayActive = periodMode === 'TODAY';
  const buyoutAnalytics = swotData?.orderBuyoutAnalytics || {};
  const dailyRows: any[] = swotData?.dailyRows || [];
  const segmentations = swotData?.segmentations || { providers: [], stores: [], agencies: [] };

  // Top 7 KPI Cards matching the SWOT Date Contract with Dual Today vs Overall comparison
  const kpiCards = [
    {
      title: isTodayActive ? (isRu ? 'Сегодняшние Сделки' : 'Bugungi Bitimlar') : (isRu ? 'Всего Сделок' : 'Jami Bitimlar'),
      sub: isTodayActive 
        ? (isRu ? `Всего за все время: ${todayKPI.totalDeals !== undefined ? swotData?.topKPI?.totalDeals : summary.totalDeals} шт` : `Umumiy barchasi: ${todayKPI.totalDeals !== undefined ? swotData?.topKPI?.totalDeals : summary.totalDeals} ta`) 
        : (isRu ? `Сегодня: ${todayKPI.totalDeals || 0} сделок` : `Bugun: ${todayKPI.totalDeals || 0} ta`),
      value: `${summary.totalDeals || 0} ${isRu ? 'сделок' : 'ta'}`,
      badge: isTodayActive ? (isRu ? 'Сегодня' : 'Bugun') : (isRu ? 'Всего' : 'Jami'),
      icon: Layers,
      color: 'from-blue-600 to-indigo-700',
      shadowColor: 'shadow-indigo-500/25',
    },
    {
      title: isTodayActive ? (isRu ? 'Лимиты Сегодня' : 'Bugungi Yechilgan Limit') : (isRu ? 'Объем Списанных Лимитов' : 'Yechilgan Limitlar'),
      sub: isTodayActive
        ? (isRu ? `Всего: ${formatMoney(swotData?.topKPI?.totalLimitVolume)}` : `Umumiy: ${formatMoney(swotData?.topKPI?.totalLimitVolume)}`)
        : (isRu ? `Сегодня: ${formatMoney(todayKPI.totalLimitVolume)}` : `Bugun: ${formatMoney(todayKPI.totalLimitVolume)}`),
      value: formatMoney(summary.totalLimitVolume),
      badge: isTodayActive ? (isRu ? 'Сегодня' : 'Bugun') : (isRu ? 'Всего' : 'Jami'),
      icon: CreditCard,
      color: 'from-emerald-600 to-teal-700',
      shadowColor: 'shadow-emerald-500/25',
    },
    {
      title: isTodayActive ? (isRu ? 'Комиссии Сегодня' : 'Bugungi Agent Komissiyasi') : (isRu ? 'Комиссии Агентов' : 'Agent Komissiyasi'),
      sub: isTodayActive
        ? (isRu ? `Всего: ${formatMoney(swotData?.topKPI?.totalAgentCommission)}` : `Umumiy: ${formatMoney(swotData?.topKPI?.totalAgentCommission)}`)
        : (isRu ? `Сегодня: ${formatMoney(todayKPI.totalAgentCommission)}` : `Bugun: ${formatMoney(todayKPI.totalAgentCommission)}`),
      value: formatMoney(summary.totalAgentCommission),
      badge: isTodayActive ? (isRu ? 'Сегодня' : 'Bugun') : (isRu ? 'Всего' : 'Jami'),
      icon: Users,
      color: 'from-purple-600 to-pink-600',
      shadowColor: 'shadow-purple-500/25',
    },
    {
      title: isTodayActive ? (isRu ? 'Расход Сегодня (Выкуп)' : 'Bugungi Xarid Xarajati') : (isRu ? 'Расход на Выкуп (Товары)' : 'Xarid Xarajati'),
      sub: isTodayActive
        ? (isRu ? `Всего: ${formatMoney(swotData?.topKPI?.totalBuyoutExpense)}` : `Umumiy: ${formatMoney(swotData?.topKPI?.totalBuyoutExpense)}`)
        : (isRu ? `Сегодня: ${formatMoney(todayKPI.totalBuyoutExpense)}` : `Bugun: ${formatMoney(todayKPI.totalBuyoutExpense)}`),
      value: formatMoney(summary.totalBuyoutExpense),
      badge: isTodayActive ? (isRu ? 'Сегодня' : 'Bugun') : (isRu ? 'Всего' : 'Jami'),
      icon: Package,
      color: 'from-rose-600 to-red-700',
      shadowColor: 'shadow-rose-500/25',
    },
    {
      title: isTodayActive ? (isRu ? 'Выдано Сегодня' : 'Bugun Mijozga To\'lov') : (isRu ? 'Расчетная Сумма (Клиенту)' : 'Mijozga To\'lov'),
      sub: isTodayActive
        ? (isRu ? `Всего: ${formatMoney(swotData?.topKPI?.totalPayout)}` : `Umumiy: ${formatMoney(swotData?.topKPI?.totalPayout)}`)
        : (isRu ? `Сегодня: ${formatMoney(todayKPI.totalPayout)}` : `Bugun: ${formatMoney(todayKPI.totalPayout)}`),
      value: formatMoney(summary.totalPayout),
      badge: isTodayActive ? (isRu ? 'Сегодня' : 'Bugun') : (isRu ? 'Всего' : 'Jami'),
      icon: Wallet,
      color: 'from-amber-600 to-orange-700',
      shadowColor: 'shadow-amber-500/25',
    },
    {
      title: isTodayActive ? (isRu ? 'Маржа Сегодня' : 'Bugungi Yalpi Marja') : (isRu ? 'Валовая Маржа (Gross Margin)' : 'Yalpi Marja'),
      sub: isTodayActive
        ? (isRu ? `Всего: ${formatMoney(swotData?.topKPI?.grossMargin)}` : `Umumiy: ${formatMoney(swotData?.topKPI?.grossMargin)}`)
        : (isRu ? `Сегодня: ${formatMoney(todayKPI.grossMargin)}` : `Bugun: ${formatMoney(todayKPI.grossMargin)}`),
      value: formatMoney(summary.grossMargin),
      badge: isTodayActive ? (isRu ? 'Сегодня' : 'Bugun') : (isRu ? 'Всего' : 'Jami'),
      icon: TrendingUp,
      color: 'from-teal-600 to-cyan-700',
      shadowColor: 'shadow-teal-500/25',
    },
    {
      title: isTodayActive ? (isRu ? 'Чек Кодир Сегодня' : 'Bugungi Qodir Chek') : (isRu ? 'Расход Чек Кодир ака' : 'Qodir Chek Xarajati'),
      sub: isTodayActive
        ? (isRu ? `Всего: ${formatMoney(swotData?.topKPI?.totalQodirChekExpense)}` : `Umumiy: ${formatMoney(swotData?.topKPI?.totalQodirChekExpense)}`)
        : (isRu ? `Сегодня: ${formatMoney(todayKPI.totalQodirChekExpense)}` : `Bugun: ${formatMoney(todayKPI.totalQodirChekExpense)}`),
      value: formatMoney(summary.totalQodirChekExpense),
      badge: isTodayActive ? (isRu ? 'Сегодня' : 'Bugun') : (isRu ? 'Всего' : 'Jami'),
      icon: Receipt,
      color: 'from-amber-600 to-yellow-600',
      shadowColor: 'shadow-amber-500/25',
    },
  ];

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      {/* Top Banner with Real-time Liquid Cash & Quick Info */}
      <div className="card-3d flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white rounded-3xl border border-slate-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-black tracking-tight">
              {isRu ? 'SWOT Операционная Панель Управления (SWOT дате)' : 'Daily Financial & Operational Aggregator (SWOT дате)'}
            </h1>
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isRu
              ? 'Автоматизированный многомерный ежедневный отчет: Сделки, Выкуп техники, Ликвидность кассы и Сегментация'
              : 'Avtomatlashtirilgan ko\'p o\'lchamli kunlik tahlil: Bitimlar, Xarid (Vikup), Kassa likvidligi va Segmentatsiya'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl">
            <Coins className="w-4 h-4 text-emerald-400" />
            <div>
              <span className="text-[10px] text-emerald-300 font-semibold uppercase block">
                {isRu ? 'Ликвидность Кассы' : 'Kassa Likvidligi'}
              </span>
              <span className="text-xs sm:text-sm font-black text-white">{formatMoney(buyoutAnalytics.liquidCash)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 bg-cyan-500/15 border border-cyan-500/30 rounded-2xl">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <div>
              <span className="text-[10px] text-cyan-300 font-semibold uppercase block">
                {isRu ? 'Выкуплено' : 'Xarid Qilingan'}
              </span>
              <span className="text-xs sm:text-sm font-black text-white">{buyoutAnalytics.boughtGoodsCount || 0} {isRu ? 'шт' : 'dona'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Period Selector Bar: Bugungi kun vs Umumiy vs Oraliq */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-emerald-500" />
            <span>{isRu ? 'Показать данные:' : 'Ko\'rsatkich davri:'}</span>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setPeriodMode('TODAY')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                periodMode === 'TODAY'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isRu ? 'Сегодня (Бугун)' : 'Bugungi kun'}</span>
              {todayKPI.totalDeals !== undefined && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  periodMode === 'TODAY' ? 'bg-white/25 text-white' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {todayKPI.totalDeals}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setPeriodMode('ALL')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                periodMode === 'ALL'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isRu ? 'Всего (Умумий)' : 'Umumiy (Jami)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setPeriodMode('CUSTOM')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all ${
                periodMode === 'CUSTOM'
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-500/25'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{isRu ? 'Диапазон дат' : 'Sana oralig\'i'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {periodMode === 'CUSTOM' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
              <span className="text-slate-400 text-xs">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          )}

          <button
            type="button"
            onClick={fetchSwotDaily}
            title={isRu ? 'Обновить' : 'Yangilash'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 rounded-xl transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            <span>{isRu ? 'Обновить' : 'Yangilash'}</span>
          </button>
        </div>
      </div>

      {/* Top 7 KPI Summary Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
        {kpiCards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className="card-3d p-5 relative overflow-hidden group">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {c.title}
                    </p>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {c.badge}
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1 tracking-tight">
                    {c.value}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1">{c.sub}</p>
                </div>
                <div
                  className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${c.color} text-white flex items-center justify-center shadow-lg ${c.shadowColor} transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 border-t border-white/20`}
                >
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Order Buyout Analytics (Questions 8 & 9 from Prompt) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Need to buy orders */}
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-bold text-xs">
              <AlertCircle className="w-4 h-4" />
              <span>{isRu ? 'Нужно Выкупить (Buyout)' : 'Sotib Olish Kerak (Buyout kerak)'}</span>
            </div>
            <span className="pill-3d px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-600 border border-rose-500/30">
              {buyoutAnalytics.needToBuyCount || 0} {isRu ? 'сделок' : 'ta bitim'}
            </span>
          </div>
          <div className="mt-3">
            <p className="text-lg font-black text-slate-900 dark:text-white">
              {formatMoney(buyoutAnalytics.needToBuyTotal)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {isRu ? 'Лимит открыт, но товар еще не куплен' : 'Mijoz limiti ochilgan, ammo tovar sotib olinmagan'}
            </p>
          </div>
        </div>

        {/* Card 2: Bought goods */}
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isRu ? 'Выкупленные Товары (Приход)' : 'Xarid Qilingan Tovarlar (Kirim)'}</span>
            </div>
            <span className="pill-3d px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
              {buyoutAnalytics.boughtGoodsCount || 0} {isRu ? 'устройств' : 'ta qurilma'}
            </span>
          </div>
          <div className="mt-3">
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
              {formatMoney(buyoutAnalytics.boughtGoodsTotal)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={buyoutAnalytics.boughtGoodsList?.join(', ') || ''}>
              {buyoutAnalytics.boughtGoodsList?.length > 0 ? buyoutAnalytics.boughtGoodsList.slice(0, 3).join(', ') + '...' : (isRu ? 'Товары на складе' : 'Tovarlar mavjud')}
            </p>
          </div>
        </div>

        {/* Card 3: Liquid Cash remaining */}
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold text-xs">
              <Wallet className="w-4 h-4" />
              <span>{isRu ? 'Свободный Остаток Кассы (Ликвидность)' : 'Kassa Erkin Qoldig\'i (Ликвидность)'}</span>
            </div>
            <span className="pill-3d px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/15 text-blue-600 border border-blue-500/30">
              {isRu ? 'Касса ДДС' : 'DDS Kassa'}
            </span>
          </div>
          <div className="mt-3">
            <p className="text-lg font-black text-blue-600 dark:text-blue-400">
              {formatMoney(buyoutAnalytics.liquidCash)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {isRu ? 'Свободные средства для выкупа товаров и выплат клиентам' : 'Yangi tovarlar xaridi va mijozlarga to\'lov uchun erkin mablag\''}
            </p>
          </div>
        </div>
      </div>

      {/* Visual Dynamic Area & Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-3d p-6 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isRu ? 'Динамика Лимитов и Выкупа по Дням' : 'Kunlik Limitlar va Xarid Hajmi Dinamikasi'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRu ? 'Лимиты по датам (зеленый) и расходы на выкуп' : 'Sana bo\'yicha limitlar (yashil) va xarid xarajatlari'}
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRows}>
                <defs>
                  <linearGradient id="colorLimit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '12px' }}
                  formatter={(val: any) => [formatMoney(val), isRu ? 'Объем' : 'Hajm']}
                  labelFormatter={(l) => `${isRu ? 'Дата' : 'Sana'}: ${formatDate(l)}`}
                />
                <Area type="monotone" dataKey="limitTotal" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLimit)" name="Limit" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-3d p-6 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isRu ? 'Количество Сделок по Дням' : 'Kunlik Bitimlar Soni'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRu ? 'Количество проведенных сделок' : 'Bajarilgan bitimlar soni'}
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', borderRadius: '12px' }}
                  formatter={(val: any) => [`${val} ${isRu ? 'сделок' : 'ta'}`, isRu ? 'Сделки' : 'Bitimlar']}
                  labelFormatter={(l) => `${isRu ? 'Дата' : 'Sana'}: ${formatDate(l)}`}
                />
                <Bar dataKey="dealsCount" fill="#6366f1" radius={[6, 6, 0, 0]} name="Bitimlar" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Multidimensional Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar flex-nowrap -mx-1 px-1">
        <button
          type="button"
          onClick={() => setActiveTab('daily')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'daily'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {isRu ? 'Ежедневная Таблица SWOT' : 'Kunlik SWOT Jadvali'} ({dailyRows.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('providers')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'providers'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {isRu ? 'По Банкам / Провайдерам' : 'Bank / Provayderlar Kesimida'} ({segmentations.providers?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stores')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'stores'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {isRu ? 'По Магазинам / Филиалам' : 'Filiallar / Do\'konlar Kesimida'} ({segmentations.stores?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('agencies')}
          className={`px-3.5 py-2 text-xs font-bold rounded-xl transition whitespace-nowrap shrink-0 ${
            activeTab === 'agencies'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {isRu ? 'По Агентствам' : 'Agentliklar Kesimida'} ({segmentations.agencies?.length || 0})
        </button>
      </div>

      {/* Tab 1: Full Daily Time-Series SWOT Table */}
      {activeTab === 'daily' && (
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              {isRu ? 'Ежедневная Таблица SWOT (Полный хронологический отчет)' : 'Kunlik SWOT Jadvali (Vaqt qatori bo\'yicha to\'liq hisobot)'}
            </h3>
            <span className="text-xs text-slate-400 font-medium">
              {isRu ? 'Все параметры строго по формулам' : 'Barcha o\'lchamlar formulasiga muvofiq'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-700 dark:text-slate-200">
              <thead className="bg-slate-100/90 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 whitespace-nowrap">
                <tr>
                  <th className="px-3.5 py-3">{isRu ? 'Дата' : 'Sana'}</th>
                  <th className="px-3.5 py-3 text-center">{isRu ? 'Сделки (Кол-во)' : 'Bitimlar Soni'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Лимит Итого' : 'Limit Jami'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Средний Лимит' : 'O\'rtacha Limit'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Комиссия Агента' : 'Agent To\'lovi'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Расход Выкупа' : 'Xarid Xarajati'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Клиенту Выдано' : 'Mijozga To\'lov'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Чек Кодир ака' : 'Qodir Chek Xarajati'}</th>
                  <th className="px-3.5 py-3 text-center">{isRu ? 'Средний Дисконт %' : 'O\'rtacha Diskont %'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Доп. Дафтар' : 'Qo\'shimcha Daftar'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Долг Кодир ака' : 'Qodir aka Qarzi'}</th>
                  <th className="px-3.5 py-3 text-right">Green Bazar</th>
                  <th className="px-3.5 py-3 text-right">Trust {isRu ? 'Баланс' : 'Balansi'}</th>
                  <th className="px-3.5 py-3 text-center">{isRu ? 'Устройства (шт)' : 'Jismoniy Qurilma'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Органик Выкуп' : 'Organik Vikup'}</th>
                  <th className="px-3.5 py-3 text-right">{isRu ? 'Расход Хасана' : 'Hasan Xarajati'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium whitespace-nowrap">
                {dailyRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-3.5 py-2.5 font-bold text-slate-900 dark:text-white">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-3.5 py-2.5 text-center font-bold text-indigo-600 dark:text-indigo-400">
                      {row.dealsCount} ta
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-black text-slate-900 dark:text-white">
                      {formatMoney(row.limitTotal)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-slate-600 dark:text-slate-400">
                      {formatMoney(row.limitAvg)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-semibold text-purple-600 dark:text-purple-400">
                      {formatMoney(row.agentFeeTotal)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-slate-700 dark:text-slate-300">
                      {formatMoney(row.buyoutTotal)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(row.payoutTotal)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-black text-amber-600 dark:text-amber-400">
                      {row.qodirChekExpenseTotal > 0 ? formatMoney(row.qodirChekExpenseTotal) : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      <span className="pill-3d px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        {formatPercent(row.discountAvg)}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-medium text-slate-600 dark:text-slate-400">
                      {row.extraDaftarTotal > 0 ? `${formatMoney(row.extraDaftarTotal)} (${row.extraDaftarCount} ta)` : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-rose-600 dark:text-rose-400">
                      {row.qodirDebtTotal > 0 ? formatMoney(row.qodirDebtTotal) : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-emerald-600 dark:text-emerald-400">
                      {row.greenBazarTotal > 0 ? formatMoney(row.greenBazarTotal) : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-cyan-600 dark:text-cyan-400">
                      {row.trustTotal > 0 ? formatMoney(row.trustTotal) : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-center">
                      {row.physicalItemsQty > 0 ? (
                        <span className="pill-3d px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" title={row.physicalItems?.join(', ') || ''}>
                          {row.physicalItemsQty} dona
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 dark:text-white">
                      {formatMoney(row.organicBuyoutTotal)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-slate-600 dark:text-slate-300">
                      {formatMoney(row.expenseHasan)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Provider Segmentations */}
      {activeTab === 'providers' && (
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              Bank va Provayderlar Bo'yicha Segmentatsiya (Alif, Imanium, Trust, Payme...)
            </h3>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/90 dark:bg-slate-950/80 font-bold uppercase text-[11px] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Provayder Nomi</th>
                <th className="px-4 py-3 text-center">Bitimlar Soni</th>
                <th className="px-4 py-3 text-right">Limit Hajmi (UZS)</th>
                <th className="px-4 py-3 text-right">Agent Komissiyasi</th>
                <th className="px-4 py-3 text-center">Bozordagi Ulushi (Share %)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {segmentations.providers?.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{item.name}</td>
                  <td className="px-4 py-3 text-center font-semibold text-indigo-600 dark:text-indigo-400">{item.count} ta</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">{formatMoney(item.volume)}</td>
                  <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400 font-semibold">{formatMoney(item.commission)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="pill-3d px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                      {formatPercent(item.sharePct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Store Segmentations */}
      {activeTab === 'stores' && (
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              Filiallar va Hamkor Do'konlar Bo'yicha Segmentatsiya (Gorkiy, Green Bazar, Planet phone...)
            </h3>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/90 dark:bg-slate-950/80 font-bold uppercase text-[11px] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Filial / Do'kon</th>
                <th className="px-4 py-3 text-center">Bitimlar Soni</th>
                <th className="px-4 py-3 text-right">Limit Hajmi (UZS)</th>
                <th className="px-4 py-3 text-right">Agent Komissiyasi</th>
                <th className="px-4 py-3 text-center">Ulushi %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {segmentations.stores?.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{item.name}</td>
                  <td className="px-4 py-3 text-center font-semibold text-indigo-600 dark:text-indigo-400">{item.count} ta</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">{formatMoney(item.volume)}</td>
                  <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400 font-semibold">{formatMoney(item.commission)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="pill-3d px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20">
                      {formatPercent(item.sharePct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Agency Segmentations */}
      {activeTab === 'agencies' && (
        <div className="card-3d bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
              Agentliklar Kesimida Tahlil
            </h3>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100/90 dark:bg-slate-950/80 font-bold uppercase text-[11px] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Agentlik Nomi</th>
                <th className="px-4 py-3 text-center">Bitimlar Soni</th>
                <th className="px-4 py-3 text-right">Limit Hajmi (UZS)</th>
                <th className="px-4 py-3 text-right">To'langan Komissiya</th>
                <th className="px-4 py-3 text-center">Ulushi %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {segmentations.agencies?.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{item.name}</td>
                  <td className="px-4 py-3 text-center font-semibold text-indigo-600 dark:text-indigo-400">{item.count} ta</td>
                  <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">{formatMoney(item.volume)}</td>
                  <td className="px-4 py-3 text-right text-purple-600 dark:text-purple-400 font-semibold">{formatMoney(item.commission)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="pill-3d px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                      {formatPercent(item.sharePct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
export default DashboardPage;