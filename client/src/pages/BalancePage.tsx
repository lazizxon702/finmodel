import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Wallet, Plus, Calendar, DollarSign } from 'lucide-react';
import { formatMoney } from '../utils/format';
import { AmountInput } from '../components/AmountInput';

export const BalancePage: React.FC = () => {
  const [matrixData, setMatrixData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState('2026-11');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');

  // Deposit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [depForm, setDepForm] = useState({
    partnerId: '',
    date: '2026-11-01',
    accountType: 'CASH',
    depositAmount: 10000000,
  });

  useEffect(() => {
    fetchMatrix();
  }, [yearMonth]);

  const fetchMatrix = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/balance/matrix?yearMonth=${yearMonth}`);
      setMatrixData(res.data);
      if (res.data.partners?.length > 0 && !selectedPartnerId) {
        setSelectedPartnerId(res.data.partners[0].partnerId);
        setDepForm((prev) => ({ ...prev, partnerId: res.data.partners[0].partnerId }));
      }
    } catch (err) {
      console.error('Fetch balance matrix error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/balance/deposit', depForm);
      setIsModalOpen(false);
      fetchMatrix();
    } catch (err: any) {
      alert('Xatolik: ' + (err.response?.data?.error || err.message));
    }
  };

  const selectedPartner = matrixData?.partners?.find((p: any) => p.partnerId === selectedPartnerId) || matrixData?.partners?.[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-800">
            Sheriklar depoziti va daromad-xarajat balansi (Баланс)
          </h1>
          <p className="text-xs text-slate-500">
            Hasan, Qodir va barcha sheriklar bo'yicha kunlik depozitlar, DDS daromad va xarajatlari
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none"
          />
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Depozit kiritish</span>
          </button>
        </div>
      </div>

      {/* Partner Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        {matrixData?.partners?.map((p: any) => (
          <button
            key={p.partnerId}
            onClick={() => {
              setSelectedPartnerId(p.partnerId);
              setDepForm((prev) => ({ ...prev, partnerId: p.partnerId }));
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              selectedPartnerId === p.partnerId
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {p.partnerName}
          </button>
        ))}
      </div>

      {/* Partner Monthly Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Oylik depozit</p>
          <h3 className="text-lg font-bold text-slate-900 mt-2">
            {formatMoney(selectedPartner?.monthlyTotals?.deposit)}
          </h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Oylik tushum (Доход)</p>
          <h3 className="text-lg font-bold text-emerald-600 mt-2">
            {formatMoney(selectedPartner?.monthlyTotals?.income)}
          </h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Oylik xarajat (Расход)</p>
          <h3 className="text-lg font-bold text-rose-600 mt-2">
            {formatMoney(selectedPartner?.monthlyTotals?.expense)}
          </h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase">Sof foyda (Сальдо)</p>
          <h3 className="text-lg font-bold text-blue-700 mt-2">
            {formatMoney(selectedPartner?.monthlyTotals?.netProfit)}
          </h3>
        </div>
      </div>

      {/* Detailed Days Matrix Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">
            {selectedPartner?.partnerName} bo'yicha 31 kunlik to'liq balans jadvali
          </h3>
        </div>
        <div className="lg:hidden px-3.5 py-2 bg-slate-100 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-400 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1 font-medium">👉 Jadvalni ko'rish uchun o'ngga suring</span>
          <span className="font-bold text-blue-600 dark:text-blue-400">31 kun</span>
        </div>

        <div className="table-scroll-container custom-scrollbar">
          <table className="w-full text-xs text-left">
            <thead className="table-sticky-head bg-slate-900 text-white font-semibold shadow-md">
              <tr>
                <th className="px-3 py-3 sticky top-0 left-0 bg-slate-900 z-30 min-w-[140px] shadow-sm">Hisob turi</th>
                <th className="px-3 py-3 text-right min-w-[100px] bg-slate-800 sticky top-0 z-20">Oylik jami</th>
                {Array.from({ length: matrixData?.daysInMonth || 31 }, (_, i) => i + 1).map((d) => (
                  <th key={d} className="px-2 py-3 text-center min-w-[70px] bg-slate-900 sticky top-0 z-20 whitespace-nowrap">
                    Kun {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedPartner?.accountRows?.map((row: any, rIdx: number) => (
                <React.Fragment key={rIdx}>
                  {/* Deposit row */}
                  <tr className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-800 sticky left-0 bg-white">
                      {row.accountLabel} (Depozit)
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-slate-900 bg-slate-50">
                      {formatMoney(row.monthlyTotals.deposit)}
                    </td>
                    {Array.from({ length: matrixData?.daysInMonth || 31 }, (_, i) => i + 1).map((d) => (
                      <td key={d} className="px-2 py-2 text-right text-slate-700">
                        {row.days[d]?.deposit ? formatMoney(row.days[d].deposit, '') : '-'}
                      </td>
                    ))}
                  </tr>
                  {/* Income row */}
                  <tr className="hover:bg-slate-50 text-[11px] text-emerald-700">
                    <td className="px-3 py-1.5 pl-6 sticky left-0 bg-white">└ Daromad (DDS)</td>
                    <td className="px-3 py-1.5 text-right font-semibold bg-slate-50">
                      {formatMoney(row.monthlyTotals.income)}
                    </td>
                    {Array.from({ length: matrixData?.daysInMonth || 31 }, (_, i) => i + 1).map((d) => (
                      <td key={d} className="px-2 py-1.5 text-right">
                        {row.days[d]?.income ? formatMoney(row.days[d].income, '') : '-'}
                      </td>
                    ))}
                  </tr>
                  {/* Expense row */}
                  <tr className="hover:bg-slate-50 text-[11px] text-rose-700">
                    <td className="px-3 py-1.5 pl-6 sticky left-0 bg-white">└ Xarajat (DDS)</td>
                    <td className="px-3 py-1.5 text-right font-semibold bg-slate-50">
                      {formatMoney(row.monthlyTotals.expense)}
                    </td>
                    {Array.from({ length: matrixData?.daysInMonth || 31 }, (_, i) => i + 1).map((d) => (
                      <td key={d} className="px-2 py-1.5 text-right">
                        {row.days[d]?.expense ? formatMoney(row.days[d].expense, '') : '-'}
                      </td>
                    ))}
                  </tr>
                  {/* Net profit row */}
                  <tr className="bg-slate-50/80 font-bold border-b text-blue-900">
                    <td className="px-3 py-1.5 pl-6 sticky left-0 bg-slate-50">└ Sof foyda</td>
                    <td className="px-3 py-1.5 text-right font-extrabold bg-slate-100">
                      {formatMoney(row.monthlyTotals.netProfit)}
                    </td>
                    {Array.from({ length: matrixData?.daysInMonth || 31 }, (_, i) => i + 1).map((d) => (
                      <td key={d} className="px-2 py-1.5 text-right">
                        {row.days[d]?.netProfit ? formatMoney(row.days[d].netProfit, '') : '-'}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Deposit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-800">Depozit kiritish</h3>
            <form onSubmit={handleDepositSubmit} className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sherik / Investor</label>
                <select
                  value={depForm.partnerId}
                  onChange={(e) => setDepForm({ ...depForm, partnerId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                >
                  {matrixData?.partners?.map((p: any) => (
                    <option key={p.partnerId} value={p.partnerId}>{p.partnerName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sana</label>
                <input
                  type="date"
                  required
                  value={depForm.date}
                  onChange={(e) => setDepForm({ ...depForm, date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hisob turi</label>
                <select
                  value={depForm.accountType}
                  onChange={(e) => setDepForm({ ...depForm, accountType: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                >
                  <option value="CASH">Naqd so'm (Нахт пул сум)</option>
                  <option value="BANK_CARD">Karta (Карта)</option>
                  <option value="SETTLEMENT_ACCOUNT">Hisob-raqam (Счет)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">Depozit summasi (UZS)</label>
                <AmountInput
                  required
                  placeholder="Summani kiriting..."
                  value={depForm.depositAmount}
                  onChange={(val) => setDepForm({ ...depForm, depositAmount: val })}
                  className="w-full px-3 py-2 border dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-slate-600 hover:bg-slate-50"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
