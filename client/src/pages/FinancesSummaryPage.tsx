import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { PieChart, ShieldCheck, AlertCircle, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { formatMoney, formatPercent } from '../utils/format';

export const FinancesSummaryPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinances();
  }, []);

  const fetchFinances = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/finances/summary');
      setData(res.data);
    } catch (err) {
      console.error('Fetch finances error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Moliya ko'rsatkichlari yuklanmoqda...</div>;
  }

  const { cards, receivables, payables, totals, pnl, cashFlow, balanceSheet } = data || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base sm:text-lg font-bold text-slate-800">
          Umumiy moliya, P&L va Boshqaruv balansi (Финансы_Свод)
        </h1>
        <p className="text-xs text-slate-500">
          Debitorlik va kreditorlik qarzlari, foyda va zararlar hisoboti, pul oqimi va boshqaruv balansi tekshiruvi
        </p>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Pul qoldig'i (Kassa / H-r)</p>
          <h3 className="text-xl font-bold text-slate-900 mt-2">{formatMoney(cards?.liquidCash)}</h3>
          <p className="text-[11px] text-slate-400 mt-1">Likvid qoldiq</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Tovar qoldig'i (Ombor)</p>
          <h3 className="text-xl font-bold text-blue-700 mt-2">{formatMoney(cards?.warehouseValue)}</h3>
          <p className="text-[11px] text-blue-500 font-semibold mt-1">{cards?.warehouseCount} ta qurilma omborda</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Debitorlik (Bizga qarz)</p>
          <h3 className="text-xl font-bold text-amber-600 mt-2">{formatMoney(cards?.receivablesDebt)}</h3>
          <p className="text-[11px] text-slate-400 mt-1">Xaridorlar saldosi</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Sof foyda (P&L)</p>
          <h3 className="text-xl font-bold text-emerald-600 mt-2">{formatMoney(cards?.netProfit)}</h3>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1">Rentabellik: {formatPercent(cards?.rosPct)}</p>
        </div>
      </div>

      {/* Section 1: Settlements (Debitor & Creditor) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receivables Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">
              Debitorlik qarzlari (Xaridorlar saldosi)
            </h3>
            <span className="text-xs font-bold text-amber-700">
              Jami: {formatMoney(totals?.totalReceivables)}
            </span>
          </div>
          <div className="lg:hidden px-3 py-1.5 bg-slate-50 text-[10px] text-slate-500 border-b flex items-center justify-between">
            <span>👉 O'ngga suring</span>
            <span className="font-bold">{receivables?.length || 0} ta</span>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[300px] flex-1 custom-scrollbar">
            <table className="w-full text-xs text-left">
              <thead className="table-sticky-head bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b shadow-sm">
                <tr>
                  <th className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Xaridor (Kontragent)</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Jo'natildi (UZS)</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">To'landi (UZS)</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Qoldiq qarz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receivables?.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">{r.buyerName}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(r.shipped)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatMoney(r.paid)}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700">{formatMoney(r.remainder)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payables Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="text-sm font-bold text-slate-800">
              Kreditorlik majburiyatlari (Bizning qarzlarimiz)
            </h3>
            <span className="text-xs font-bold text-rose-700">
              Jami: {formatMoney(totals?.totalPayables)}
            </span>
          </div>
          <div className="lg:hidden px-3 py-1.5 bg-slate-50 text-[10px] text-slate-500 border-b flex items-center justify-between">
            <span>👉 O'ngga suring</span>
            <span className="font-bold">{payables?.length || 0} ta</span>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[300px] flex-1 custom-scrollbar">
            <table className="w-full text-xs text-left">
              <thead className="table-sticky-head bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b shadow-sm">
                <tr>
                  <th className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Hamkor / Manba</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Hisoblandi</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">To'landi</th>
                  <th className="px-3 py-2.5 text-right bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Qoldiq qarz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payables?.map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">{c.name}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(c.accrued)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatMoney(c.paid)}</td>
                    <td className="px-3 py-2 text-right font-bold text-rose-700">{formatMoney(c.remainder)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 2: P&L Report */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">
            Foyda va zararlar to'g'risida hisobot (P&L - Report on Profit and Loss)
          </h3>
          <span className="text-xs font-semibold text-emerald-700">
            Sof rentabellik: {formatPercent(pnl?.rosPct)}
          </span>
        </div>
        <div className="p-5 space-y-3 text-xs">
          <div className="flex justify-between py-2 border-b font-bold text-slate-900 text-sm">
            <span>Savdo tushumi (Выручка от реализации):</span>
            <span className="text-emerald-700">{formatMoney(pnl?.salesRevenue)}</span>
          </div>
          <div className="flex justify-between py-1.5 pl-4 text-slate-600 border-b">
            <span>(-) Sotilgan tovarlar tannarxi (COGS):</span>
            <span className="font-semibold text-slate-800">-{formatMoney(pnl?.cogs)}</span>
          </div>
          <div className="flex justify-between py-2 bg-emerald-50/70 px-4 rounded-xl font-bold text-emerald-950">
            <span>(=) YALPI FOYDA (Gross Profit):</span>
            <span className="text-emerald-800 font-extrabold">{formatMoney(pnl?.grossProfit)}</span>
          </div>
          <div className="flex justify-between py-1.5 pl-4 text-slate-600 border-b">
            <span>(-) Agent va hamkor komissiyalari:</span>
            <span>-{formatMoney(pnl?.agentPayouts)}</span>
          </div>
          <div className="flex justify-between py-1.5 pl-4 text-slate-600 border-b">
            <span>(-) Transport va logistika xarajatlari:</span>
            <span>-{formatMoney(pnl?.logisticsExpenses)}</span>
          </div>
          <div className="flex justify-between py-1.5 pl-4 text-slate-600 border-b">
            <span>(-) Ofis, aloqa va boshqa operatsion xarajatlar:</span>
            <span>-{formatMoney(pnl?.officeAndAdmin)}</span>
          </div>
          <div className="flex justify-between py-2 bg-rose-50/60 px-4 rounded-xl font-semibold text-rose-900">
            <span>(=) Jami operatsion xarajatlar (OPEX):</span>
            <span className="font-bold text-rose-700">-{formatMoney(pnl?.totalOpex)}</span>
          </div>
          <div className="flex justify-between py-3 bg-slate-900 text-white px-4 rounded-xl font-bold text-sm">
            <span>(=) SOF FOYDA (NET PROFIT):</span>
            <span className="text-emerald-400 font-black text-base">{formatMoney(pnl?.netProfit)}</span>
          </div>
        </div>
      </div>

      {/* Section 3 & 4: Cash Flow & Management Balance Sheet */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Flow */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-slate-800 border-b pb-2">
            Pul oqimi hisoboti (Cash Flow Statement)
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between py-1 text-slate-500">
              <span>Boshlang'ich kassa qoldig'i:</span>
              <span className="font-bold text-slate-800">{formatMoney(cashFlow?.beginningCash)}</span>
            </div>
            <div className="flex justify-between py-1 text-emerald-700 font-semibold border-b">
              <span>(+) Xaridorlardan tushumlar:</span>
              <span>+{formatMoney(cashFlow?.buyerInflows)}</span>
            </div>
            <div className="flex justify-between py-1 text-emerald-700 font-semibold border-b">
              <span>(+) Investor jalb qilingan qarz:</span>
              <span>+{formatMoney(cashFlow?.investorLoanInflow)}</span>
            </div>
            <div className="flex justify-between py-1 text-rose-700 font-semibold border-b">
              <span>(-) Tovar xaridiga chiqim:</span>
              <span>-{formatMoney(cashFlow?.purchaseOutflows)}</span>
            </div>
            <div className="flex justify-between py-1 text-rose-700 font-semibold border-b">
              <span>(-) UZIMEI va boshqa chiqimlar:</span>
              <span>-{formatMoney(cashFlow?.uzimeiOutflows)}</span>
            </div>
            <div className="flex justify-between py-1 text-rose-700 font-semibold border-b">
              <span>(-) OPEX chiqimlari:</span>
              <span>-{formatMoney(cashFlow?.opexOutflows)}</span>
            </div>
            <div className="flex justify-between py-2 bg-blue-50 px-3 rounded-xl font-bold text-blue-900">
              <span>YAKUNIY KASSA QOLDIG'I:</span>
              <span className="font-black text-blue-700">{formatMoney(cashFlow?.endingCash)}</span>
            </div>
          </div>
        </div>

        {/* Management Balance Sheet with Convergence Check */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-sm font-bold text-slate-800">
              Boshqaruv balansi (Aktivlar va Passivlar)
            </h3>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{balanceSheet?.balanceCheck?.statusText}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-bold text-slate-700 uppercase text-[10px]">Aktivlar (Активы):</p>
            <div className="flex justify-between pl-3 text-slate-600">
              <span>Pul mablag'lari (Kassa va hisob-raqamlar):</span>
              <span className="font-semibold text-slate-800">{formatMoney(balanceSheet?.assets?.cash)}</span>
            </div>
            <div className="flex justify-between pl-3 text-slate-600">
              <span>Tovar zaxiralari (Ombor va yo'lda):</span>
              <span className="font-semibold text-slate-800">{formatMoney(balanceSheet?.assets?.inventory)}</span>
            </div>
            <div className="flex justify-between pl-3 text-slate-600">
              <span>Debitorlik qarzlari (Mijozlar qarzi):</span>
              <span className="font-semibold text-slate-800">{formatMoney(balanceSheet?.assets?.receivables)}</span>
            </div>
            <div className="flex justify-between pl-3 text-slate-600 border-b pb-1">
              <span>Asosiy vositalar (Jihozlar va ofis):</span>
              <span className="font-semibold text-slate-800">{formatMoney(balanceSheet?.assets?.fixedAssets)}</span>
            </div>
            <div className="flex justify-between font-bold text-emerald-800 py-1 bg-emerald-50/70 px-3 rounded-lg">
              <span>JAMI AKTIVLAR:</span>
              <span className="font-black">{formatMoney(balanceSheet?.assets?.totalAssets)}</span>
            </div>

            <p className="font-bold text-slate-700 uppercase text-[10px] pt-2">Passivlar va Kapital (Пассивы):</p>
            <div className="flex justify-between pl-3 text-slate-600">
              <span>Kreditorlik (Ta'minotchilar va hamkorlar):</span>
              <span className="font-semibold text-slate-800">{formatMoney(balanceSheet?.liabilities?.payables)}</span>
            </div>
            <div className="flex justify-between pl-3 text-slate-600">
              <span>Qarzlar va kreditlar (Investor zayomi):</span>
              <span className="font-semibold text-slate-800">{formatMoney(balanceSheet?.liabilities?.longTermLoan)}</span>
            </div>
            <div className="flex justify-between pl-3 text-slate-600">
              <span>Xususiy kapital (Ustav fondi):</span>
              <span className="font-semibold text-slate-800">{formatMoney(balanceSheet?.liabilities?.charterCapital)}</span>
            </div>
            <div className="flex justify-between pl-3 text-slate-600 border-b pb-1">
              <span>Taqsimlanmagan sof foyda:</span>
              <span className="font-semibold text-slate-800">{formatMoney(balanceSheet?.liabilities?.retainedEarnings)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 py-1 bg-slate-100 px-3 rounded-lg">
              <span>JAMI PASSIVLAR VA KAPITAL:</span>
              <span className="font-black">{formatMoney(balanceSheet?.liabilities?.totalLiabilitiesAndEquity)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
