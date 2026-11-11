import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, Save, ShieldAlert, Sparkles, Target, Zap } from 'lucide-react';
import { formatMoney, formatPercent } from '../utils/format';

export const AgentSwotPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgency, setSelectedAgency] = useState<string>('Асадбек');
  const [swotForm, setSwotForm] = useState({
    strengths: '',
    weaknesses: '',
    opportunities: '',
    threats: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSwotData();
  }, []);

  const fetchSwotData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/agents/swot');
      setData(res.data);
      if (res.data.agencies?.length > 0) {
        const first = res.data.agencies[0];
        setSelectedAgency(first.agencyName);
        setSwotForm({
          strengths: first.swot?.strengths || 'Mijozlar oqimi katta, yaxshi provayderlar bilan ishlaydi',
          weaknesses: first.swot?.weaknesses || 'Kechikishlar, hujjatlarni to\'liq yuklamaslik',
          opportunities: first.swot?.opportunities || 'Viloyat do\'konlari orqali aylanmani 2 barobar oshirish',
          threats: first.swot?.threats || 'Limitlar foizi pasayishi yoki kechiktirilgan to\'lovlar',
        });
      }
    } catch (err) {
      console.error('Fetch SWOT error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAgency = (agencyName: string) => {
    setSelectedAgency(agencyName);
    const agc = data?.agencies?.find((a: any) => a.agencyName === agencyName);
    if (agc) {
      setSwotForm({
        strengths: agc.swot?.strengths || '',
        weaknesses: agc.swot?.weaknesses || '',
        opportunities: agc.swot?.opportunities || '',
        threats: agc.swot?.threats || '',
      });
    }
  };

  const handleSaveSwot = async () => {
    try {
      setSaving(true);
      await axios.post(`/api/agents/swot/${selectedAgency}`, swotForm);
      alert('SWOT tahlili muvaffaqiyatli saqlandi!');
      fetchSwotData();
    } catch (err: any) {
      alert('Saqlashda xatolik: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">SWOT yuklanmoqda...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-base sm:text-lg font-bold text-slate-800">
          Agentliklar samaradorligi va SWOT tahlili (SWOT_Агентства)
        </h1>
        <p className="text-xs text-slate-500">
          Hamkor agentliklar aylanmasi, kompaniya marjinalligi, komissiya ulushi va strategik SWOT tahlili
        </p>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Umumiy limit hajmi</p>
          <h3 className="text-lg font-bold text-slate-900 mt-2">{formatMoney(data?.totals?.totalLimit)}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Kompaniya daromadi</p>
          <h3 className="text-lg font-bold text-blue-700 mt-2">{formatMoney(data?.totals?.companyRevenue)}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Agentliklarga to'lov</p>
          <h3 className="text-lg font-bold text-purple-700 mt-2">{formatMoney(data?.totals?.agencyPayout)}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Sof foyda</p>
          <h3 className="text-lg font-bold text-emerald-700 mt-2">{formatMoney(data?.totals?.netProfit)}</h3>
        </div>
      </div>

      {/* Agency efficiency comparison table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Agentliklar solishtirma reytingi</h3>
        </div>
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">{data?.agencies?.length || 0} ta agentlik</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-900 text-white font-semibold">
              <tr>
                <th className="px-4 py-3">Agentlik (Агентство)</th>
                <th className="px-4 py-3 text-right">Bitimlar soni</th>
                <th className="px-4 py-3 text-right">Umumiy limit</th>
                <th className="px-4 py-3 text-right">Hisoblangan summa</th>
                <th className="px-4 py-3 text-right">Kompaniya daromadi</th>
                <th className="px-4 py-3 text-right">Agentlikka to'lov</th>
                <th className="px-4 py-3 text-right">Kompaniya sof foydasi</th>
                <th className="px-4 py-3 text-right">Komissiya ulushi %</th>
                <th className="px-4 py-3 text-right">Aylanmadagi ulush %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.agencies?.map((a: any) => (
                <tr
                  key={a.id}
                  onClick={() => handleSelectAgency(a.agencyName)}
                  className={`cursor-pointer transition-colors ${
                    selectedAgency === a.agencyName ? 'bg-emerald-50/70 font-semibold' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-2.5 font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    {a.agencyName}
                  </td>
                  <td className="px-4 py-2.5 text-right font-bold text-blue-600">{a.dealCount} ta</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatMoney(a.totalLimit)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{formatMoney(a.calculatedSum)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-blue-700">{formatMoney(a.companyRevenue)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-purple-700">{formatMoney(a.agencyPayout)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{formatMoney(a.netProfit)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{formatPercent(a.commissionSharePct)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-800">{formatPercent(a.turnoverSharePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SWOT Quadrant Matrix (Editable) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Agentlik SWOT tahlili: <span className="text-emerald-700 font-extrabold">{selectedAgency}</span>
            </h3>
            <p className="text-xs text-slate-500">
              Quyidagi matn maydonlarini tahrirlab "Saqlash" tugmasini bosing
            </p>
          </div>
          <button
            onClick={handleSaveSwot}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm self-start sm:self-auto"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saqlanmoqda...' : 'SWOT ni saqlash'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Strengths */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
            <div className="flex items-center gap-2 text-emerald-800 font-bold">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span>Kuchli tomonlari (Strengths)</span>
            </div>
            <textarea
              rows={3}
              value={swotForm.strengths}
              onChange={(e) => setSwotForm({ ...swotForm, strengths: e.target.value })}
              className="w-full p-2.5 bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Masalan: Yirik mijozlar bazasi, operatsion tezlik..."
            />
          </div>

          {/* Weaknesses */}
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/40 space-y-2">
            <div className="flex items-center gap-2 text-rose-800 font-bold">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Zaif tomonlari (Weaknesses)</span>
            </div>
            <textarea
              rows={3}
              value={swotForm.weaknesses}
              onChange={(e) => setSwotForm({ ...swotForm, weaknesses: e.target.value })}
              className="w-full p-2.5 bg-white border border-rose-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              placeholder="Masalan: Hujjatlarni to'liq topshirmaslik, cheklar kechikishi..."
            />
          </div>

          {/* Opportunities */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2">
            <div className="flex items-center gap-2 text-blue-800 font-bold">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Imkoniyatlar (Opportunities)</span>
            </div>
            <textarea
              rows={3}
              value={swotForm.opportunities}
              onChange={(e) => setSwotForm({ ...swotForm, opportunities: e.target.value })}
              className="w-full p-2.5 bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Masalan: Viloyatlarda yangi do'konlar bilan limitlarni kengaytirish..."
            />
          </div>

          {/* Threats */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 font-bold">
              <Target className="w-4 h-4 text-amber-600" />
              <span>Xavflar va Xatarlar (Threats)</span>
            </div>
            <textarea
              rows={3}
              value={swotForm.threats}
              onChange={(e) => setSwotForm({ ...swotForm, threats: e.target.value })}
              className="w-full p-2.5 bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              placeholder="Masalan: Banklar komissiya stavkalarini o'zgartirishi..."
            />
          </div>
        </div>
      </div>
    </div>
  );
};
