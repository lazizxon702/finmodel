import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Calculator, TrendingUp, Layers, DollarSign, Award } from 'lucide-react';
import { formatMoney, formatPercent } from '../utils/format';

export const FinModelPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModel();
  }, []);

  const fetchModel = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/finmodel');
      setData(res.data);
    } catch (err) {
      console.error('Fetch model error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Moliyaviy model yuklanmoqda...</div>;
  }

  const { assumptions, providers, unitEconomics, months, yearSummary, weightedAvgRate } = data || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base sm:text-lg font-bold text-slate-800">
          Strategik 12 oylik moliyaviy model (Фин_Модель)
        </h1>
        <p className="text-xs text-slate-500">
          Rassrochka limitlari bo'yicha texnika sotib olish unit-iqtisodiyoti va 1 yillik P&L prognozi
        </p>
      </div>

      {/* 1-Year KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Yillik jami bitimlar</p>
          <h3 className="text-xl font-bold text-slate-900 mt-2">{yearSummary?.totalDeals} ta qurilma</h3>
          <p className="text-[11px] text-slate-400 mt-1">O'rtacha {yearSummary?.avgDealsPerMonth} ta / oy</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Yillik savdo tushumi</p>
          <h3 className="text-xl font-bold text-emerald-600 mt-2">{formatMoney(yearSummary?.totalRevenue)}</h3>
          <p className="text-[11px] text-slate-400 mt-1">O'rtacha {formatMoney(yearSummary?.avgRevenuePerMonth)} / oy</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Yalpi foyda (Gross Profit)</p>
          <h3 className="text-xl font-bold text-blue-700 mt-2">{formatMoney(yearSummary?.totalGrossProfit)}</h3>
          <p className="text-[11px] text-blue-500 font-semibold mt-1">Marja: {formatPercent(yearSummary?.grossMarginPct)}</p>
        </div>

        <div className="bg-gradient-to-tr from-emerald-800 to-teal-800 text-white p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-200 uppercase">Yillik sof foyda (EBITDA)</p>
            <Award className="w-5 h-5 text-emerald-300" />
          </div>
          <h3 className="text-xl font-extrabold mt-2">{formatMoney(yearSummary?.totalNetProfit)}</h3>
          <p className="text-[11px] text-emerald-200 font-medium mt-1">Sof rentabellik: {formatPercent(yearSummary?.netMarginPct)}</p>
        </div>
      </div>

      {/* Assumptions & Providers Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model Assumptions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800 border-b pb-2">Asosiy parametrlar</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">O'rtacha chek:</span>
              <span className="font-bold text-slate-800">{formatMoney(assumptions?.baseCheck)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Ulgurji savdo ulushi:</span>
              <span className="font-bold text-slate-800">{formatPercent(assumptions?.wholesaleShare)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Chakana savdo ulushi:</span>
              <span className="font-bold text-slate-800">{formatPercent(assumptions?.retailShare)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Ulgurji narx koeffitsiyenti:</span>
              <span className="font-bold text-slate-800">{assumptions?.wholesaleCoef} (-15%)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Chakana narx koeffitsiyenti:</span>
              <span className="font-bold text-slate-800">{assumptions?.retailCoef} (-5%)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Oylik bitimlar o'sishi:</span>
              <span className="font-bold text-emerald-600">+{formatPercent(assumptions?.monthlyGrowth)} / oy</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">O'rtacha vaznli komissiya:</span>
              <span className="font-extrabold text-purple-700">{formatPercent(weightedAvgRate)}</span>
            </div>
          </div>
        </div>

        {/* Providers Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">
              Provayderlar stavkalari va portfel ulushi (Mix)
            </h3>
          </div>
          <div className="lg:hidden px-3.5 py-1.5 bg-slate-50 text-[10px] text-slate-500 border-b flex items-center justify-between">
            <span>👉 O'ngga suring</span>
            <span className="font-bold">{providers?.length || 0} ta provayder</span>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[320px] flex-1 custom-scrollbar">
            <table className="w-full text-xs text-left">
              <thead className="table-sticky-head bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700 shadow-sm">
                <tr>
                  <th className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Provayder</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Asosiy komissiya</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">UZIMEI bonusi</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Yakuniy komissiya</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Mix ulushi %</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Vaznli stavka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {providers?.map((p: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">{p.name}</td>
                    <td className="px-3 py-2 text-right">{formatPercent(p.baseCommission)}</td>
                    <td className="px-3 py-2 text-right text-slate-500">+{formatPercent(p.uzimeiBonus)}</td>
                    <td className="px-3 py-2 text-right font-bold text-purple-700">{formatPercent(p.finalCommission)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatPercent(p.mixShare)}</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-900">{formatPercent(p.weightedRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 12 Months P&L Projections */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">
            12 oylik P&L moliyaviy rejasi (Помесячный P&L на 12 месяцев)
          </h3>
        </div>
        <div className="lg:hidden px-3.5 py-1.5 bg-slate-50 text-[10px] text-slate-500 border-b flex items-center justify-between">
          <span>👉 12 oylik ma'lumotlar uchun o'ngga suring</span>
          <span className="font-bold">12 oy</span>
        </div>
        <div className="table-scroll-container custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="table-sticky-head bg-slate-900 text-white font-semibold shadow-md">
              <tr>
                <th className="px-3 py-3 sticky top-0 left-0 bg-slate-900 z-30 min-w-[200px] shadow-sm">Modda</th>
                <th className="px-3 py-3 text-right bg-slate-800 sticky top-0 z-20 min-w-[110px]">YILLIK JAMI</th>
                {months?.map((m: any) => (
                  <th key={m.monthNumber} className="px-3 py-3 text-right min-w-[100px] bg-slate-900 sticky top-0 z-20 whitespace-nowrap">
                    {m.monthName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50 font-bold text-slate-800">
                <td className="px-3 py-2 sticky left-0 bg-slate-50">Bitimlar soni</td>
                <td className="px-3 py-2 text-right text-blue-700">{yearSummary?.totalDeals} ta</td>
                {months?.map((m: any) => (
                  <td key={m.monthNumber} className="px-3 py-2 text-right font-bold text-blue-700">
                    {m.dealsCount} ta
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-white font-semibold text-slate-900">Jami tushum (Revenue)</td>
                <td className="px-3 py-2 text-right font-extrabold text-emerald-700 bg-slate-50">{formatMoney(yearSummary?.totalRevenue)}</td>
                {months?.map((m: any) => (
                  <td key={m.monthNumber} className="px-3 py-2 text-right font-bold text-emerald-700">
                    {formatMoney(m.totalRevenue)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-white text-slate-600">Tovar xarid xarajati</td>
                <td className="px-3 py-2 text-right text-slate-700 bg-slate-50">{formatMoney(months?.reduce((s: number, m: any) => s + m.purchaseCost, 0))}</td>
                {months?.map((m: any) => (
                  <td key={m.monthNumber} className="px-3 py-2 text-right text-slate-600">
                    {formatMoney(m.purchaseCost)}
                  </td>
                ))}
              </tr>
              <tr className="bg-emerald-50/70 font-bold text-emerald-950">
                <td className="px-3 py-2 sticky left-0 bg-emerald-50">Yalpi foyda (Gross Profit)</td>
                <td className="px-3 py-2 text-right font-extrabold">{formatMoney(yearSummary?.totalGrossProfit)}</td>
                {months?.map((m: any) => (
                  <td key={m.monthNumber} className="px-3 py-2 text-right font-extrabold">
                    {formatMoney(m.grossProfit)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-white text-rose-700">Jami OPEX (FOT, Reklama, Ijara)</td>
                <td className="px-3 py-2 text-right font-semibold text-rose-700 bg-slate-50">{formatMoney(months?.reduce((s: number, m: any) => s + m.totalOpex, 0))}</td>
                {months?.map((m: any) => (
                  <td key={m.monthNumber} className="px-3 py-2 text-right text-rose-600 font-medium">
                    {formatMoney(m.totalOpex)}
                  </td>
                ))}
              </tr>
              <tr className="bg-slate-900 font-extrabold text-white text-[12px]">
                <td className="px-3 py-2.5 sticky left-0 bg-slate-900">SOF FOYDA (NET PROFIT)</td>
                <td className="px-3 py-2.5 text-right font-black text-emerald-400 bg-slate-950">{formatMoney(yearSummary?.totalNetProfit)}</td>
                {months?.map((m: any) => (
                  <td key={m.monthNumber} className="px-3 py-2.5 text-right font-black text-emerald-400">
                    {formatMoney(m.netProfit)}
                  </td>
                ))}
              </tr>
              <tr className="bg-slate-50 font-bold text-slate-600 text-[10px]">
                <td className="px-3 py-1.5 sticky left-0 bg-slate-50">Sof rentabellik %</td>
                <td className="px-3 py-1.5 text-right font-black">{formatPercent(yearSummary?.netMarginPct)}</td>
                {months?.map((m: any) => (
                  <td key={m.monthNumber} className="px-3 py-1.5 text-right font-bold">
                    {formatPercent(m.netMarginPct)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
