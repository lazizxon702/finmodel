import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarCheck, AlertTriangle, CheckCircle, Save } from 'lucide-react';
import { formatMoney, formatPercent } from '../utils/format';

export const DailyAccountingPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState('2026-11');
  const [activeCell, setActiveCell] = useState<{ day: number; code: string; count: number } | null>(null);

  useEffect(() => {
    fetchDailyData();
  }, [yearMonth]);

  const fetchDailyData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/daily?yearMonth=${yearMonth}`);
      setData(res.data);
    } catch (err) {
      console.error('Fetch daily error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCellSave = async (day: number, code: string, count: number) => {
    try {
      await axios.post('/api/daily/cell', {
        yearMonth,
        dayNumber: day,
        providerCode: code,
        dealCount: count,
      });
      setActiveCell(null);
      fetchDailyData();
    } catch (err: any) {
      alert('Xatolik: ' + err.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Kunlik hisob yuklanmoqda...</div>;
  }

  const summary = data?.summary;
  const isDeficit = summary?.overallLiquidityStatus?.includes('дефицита') || summary?.overallLiquidityStatus?.includes('UZILISHI');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-800">
            Kunlik moliyaviy hisob va pul oqimi (Ежедневный_Учет)
          </h1>
          <p className="text-xs text-slate-500">
            31 kunlik operatsion ko'rsatkichlar, xaridlar, tushum, OPEX va kassa uzilishi monitoringi
          </p>
        </div>

        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none self-start sm:self-auto"
        />
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Jami xarid qilingan qurilmalar</p>
          <h3 className="text-xl font-bold text-slate-900 mt-2">{summary?.totalDevicesBought} ta bitim</h3>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Sotuv tushumi (Revenue)</p>
          <h3 className="text-xl font-bold text-emerald-600 mt-2">{formatMoney(summary?.totalRevenue)}</h3>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Sof foyda (P&L EBITDA)</p>
          <h3 className="text-xl font-bold text-blue-700 mt-2">{formatMoney(summary?.netProfit)}</h3>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm ${
          isDeficit ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase">Likvidlik holati</p>
            {isDeficit ? <AlertTriangle className="w-4 h-4 text-rose-600" /> : <CheckCircle className="w-4 h-4 text-emerald-600" />}
          </div>
          <h3 className="text-lg font-extrabold mt-2">{summary?.overallLiquidityStatus}</h3>
          <p className="text-[11px] opacity-75 mt-0.5">Kun oxiri kassa: {formatMoney(summary?.endingCash)}</p>
        </div>
      </div>

      {/* Main 31-day accounting table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">
            31 kunlik operatsion hisob matritsasi
          </h3>
          <span className="text-xs text-slate-400 hidden sm:inline">
            Katakka bosib qiymatni o'zgartirishingiz mumkin
          </span>
        </div>
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-cyan-600 dark:text-cyan-400">31 kun</span>
        </div>
        <div className="table-scroll-container custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="table-sticky-head bg-slate-900 text-white font-semibold shadow-md">
              <tr>
                <th className="px-3 py-3 sticky top-0 left-0 bg-slate-900 z-30 min-w-[200px] shadow-sm">
                  Modda / Provayder
                </th>
                <th className="px-3 py-3 text-right min-w-[100px] bg-slate-800 sticky top-0 z-20">OYLIK JAMI</th>
                {data?.days?.map((d: any) => (
                  <th key={d.dayNumber} className="px-2 py-3 text-center min-w-[65px] bg-slate-900 sticky top-0 z-20 whitespace-nowrap">
                    Kun {d.dayNumber}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {/* Provider Counts Rows */}
              <tr className="bg-slate-50 font-bold text-slate-800 text-[11px]">
                <td className="px-3 py-2 sticky left-0 bg-slate-50" colSpan={33}>
                  1. OPERATSION KO'RSATKICHLAR: PROVAYDERLAR KESIMIDA SOTIB OLINGAN (DONA)
                </td>
              </tr>
              {data?.providers?.map((p: any) => {
                const monthTotal = data?.days?.reduce((s: number, d: any) => s + (d.providerCounts[p.code] || 0), 0);
                return (
                  <tr key={p.code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 sticky left-0 bg-white font-medium text-slate-700">
                      {p.name}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-blue-700 bg-slate-50">
                      {monthTotal} ta
                    </td>
                    {data?.days?.map((d: any) => {
                      const count = d.providerCounts[p.code] || 0;
                      const isEditing = activeCell?.day === d.dayNumber && activeCell?.code === p.code;
                      return (
                        <td
                          key={d.dayNumber}
                          onClick={() => setActiveCell({ day: d.dayNumber, code: p.code, count })}
                          className="px-2 py-2 text-center cursor-pointer hover:bg-emerald-50 transition-colors"
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              autoFocus
                              onFocus={(e) => e.target.select()}
                              defaultValue={count}
                              onBlur={(e) => handleCellSave(d.dayNumber, p.code, Number(e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleCellSave(d.dayNumber, p.code, Number((e.target as any).value));
                                }
                              }}
                              className="w-12 text-center border border-emerald-500 rounded text-xs"
                            />
                          ) : (
                            <span className={count > 0 ? 'font-bold text-slate-900' : 'text-slate-300'}>
                              {count}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Total devices bought */}
              <tr className="bg-blue-50 font-bold text-blue-900 border-t">
                <td className="px-3 py-2 sticky left-0 bg-blue-50">JAMI SOTIB OLINGAN (BITIM):</td>
                <td className="px-3 py-2 text-right">{summary?.totalDevicesBought} ta</td>
                {data?.days?.map((d: any) => (
                  <td key={d.dayNumber} className="px-2 py-2 text-center font-extrabold">
                    {d.dayTotalCount}
                  </td>
                ))}
              </tr>

              {/* Revenue & Direct Costs */}
              <tr className="bg-slate-50 font-bold text-slate-800 text-[11px]">
                <td className="px-3 py-2 sticky left-0 bg-slate-50" colSpan={33}>
                  2. SAVDO TUSHUMI VA TANNARX (UZS)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-white">Jami tushum (Revenue)</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700 bg-slate-50">
                  {formatMoney(summary?.totalRevenue)}
                </td>
                {data?.days?.map((d: any) => (
                  <td key={d.dayNumber} className="px-2 py-2 text-right text-emerald-700">
                    {d.totalRevenue > 0 ? formatMoney(d.totalRevenue, '') : '-'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-white">Xarid xarajati (Mijozga)</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-700 bg-slate-50">
                  {formatMoney(summary?.purchaseCost)}
                </td>
                {data?.days?.map((d: any) => (
                  <td key={d.dayNumber} className="px-2 py-2 text-right text-slate-600">
                    {d.purchaseCost > 0 ? formatMoney(d.purchaseCost, '') : '-'}
                  </td>
                ))}
              </tr>
              <tr className="bg-emerald-50/60 font-semibold text-emerald-900">
                <td className="px-3 py-2 sticky left-0 bg-emerald-50">Yalpi foyda (Gross Profit)</td>
                <td className="px-3 py-2 text-right font-bold">{formatMoney(summary?.grossProfit)}</td>
                {data?.days?.map((d: any) => (
                  <td key={d.dayNumber} className="px-2 py-2 text-right font-bold">
                    {d.grossProfit > 0 ? formatMoney(d.grossProfit, '') : '-'}
                  </td>
                ))}
              </tr>

              {/* OPEX & Net Profit */}
              <tr className="bg-slate-50 font-bold text-slate-800 text-[11px]">
                <td className="px-3 py-2 sticky left-0 bg-slate-50" colSpan={33}>
                  3. OPEX VA SOF FOYDA (UZS)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 sticky left-0 bg-white">Jami OPEX (Reklama, FOT, Ijara)</td>
                <td className="px-3 py-2 text-right font-semibold text-rose-700 bg-slate-50">
                  {formatMoney(summary?.totalOpex)}
                </td>
                {data?.days?.map((d: any) => (
                  <td key={d.dayNumber} className="px-2 py-2 text-right text-rose-600">
                    {formatMoney(d.totalOpex, '')}
                  </td>
                ))}
              </tr>
              <tr className="bg-indigo-50 font-bold text-indigo-900">
                <td className="px-3 py-2 sticky left-0 bg-indigo-50">SOF FOYDA (NET PROFIT)</td>
                <td className="px-3 py-2 text-right font-extrabold">{formatMoney(summary?.netProfit)}</td>
                {data?.days?.map((d: any) => (
                  <td key={d.dayNumber} className="px-2 py-2 text-right font-extrabold">
                    {formatMoney(d.netProfit, '')}
                  </td>
                ))}
              </tr>

              {/* Cash Flow & Liquidity */}
              <tr className="bg-slate-50 font-bold text-slate-800 text-[11px]">
                <td className="px-3 py-2 sticky left-0 bg-slate-50" colSpan={33}>
                  4. KASSA HARAKATI VA LIKVIDLIK NAZORATI
                </td>
              </tr>
              <tr className="font-semibold text-slate-800">
                <td className="px-3 py-2 sticky left-0 bg-white">Kun oxiridagi kassa qoldig'i</td>
                <td className="px-3 py-2 text-right font-extrabold bg-slate-100">
                  {formatMoney(summary?.endingCash)}
                </td>
                {data?.days?.map((d: any) => (
                  <td
                    key={d.dayNumber}
                    className={`px-2 py-2 text-right font-bold ${
                      d.dayEndCash < 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-800'
                    }`}
                  >
                    {formatMoney(d.dayEndCash, '')}
                  </td>
                ))}
              </tr>
              <tr className="font-bold text-[10px]">
                <td className="px-3 py-1.5 sticky left-0 bg-white">Likvidlik holati</td>
                <td className="px-3 py-1.5 text-right font-extrabold">
                  {summary?.overallLiquidityStatus}
                </td>
                {data?.days?.map((d: any) => (
                  <td
                    key={d.dayNumber}
                    className={`px-1 py-1.5 text-center ${
                      d.liquidityStatus === 'В НОРМЕ' ? 'text-emerald-700' : 'text-rose-600 font-extrabold'
                    }`}
                  >
                    {d.liquidityStatus}
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
