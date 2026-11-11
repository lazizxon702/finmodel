import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ClipboardCheck, Target, AlertTriangle, Users, Plus, CheckCircle, 
  Trash2, RefreshCw, DollarSign, Calendar, MessageSquare, Phone
} from 'lucide-react';
import { formatMoney, formatDate } from '../utils/format';

export const HandoverPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'CHECKLIST' | 'KPI' | 'DEBTS' | 'FOT'>('CHECKLIST');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Checklist state
  const [checklist, setChecklist] = useState<any[]>([]);

  // KPI state
  const [kpiPlans, setKpiPlans] = useState<any[]>([]);

  // Debts state
  const [debts, setDebts] = useState<any[]>([]);
  const [debtTotals, setDebtTotals] = useState({ totalUsd: 0, totalUzs: 0 });
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [debtForm, setDebtForm] = useState({
    debtorName: '',
    roleDescription: '',
    telegram: '',
    contactPhone: '',
    amountUsd: 0,
    amountUzs: 0,
    remainingAmount: 0,
    note: '',
    weOwe: false,
    isConfirmed: false,
  });

  // FOT state
  const [salaries, setSalaries] = useState<any[]>([]);
  const [totalFOT, setTotalFOT] = useState(0);
  const [showAddSalary, setShowAddSalary] = useState(false);
  const [salaryForm, setSalaryForm] = useState({
    employeeName: '',
    position: '',
    baseSalary: 0,
    bonusAmount: 0,
    paymentDate: new Date().toISOString().split('T')[0],
    isPaid: false,
    note: '',
  });

  const notify = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const fetchChecklist = async () => {
    const res = await axios.get('/api/handover/checklist');
    setChecklist(res.data);
  };

  const fetchKPI = async () => {
    const res = await axios.get('/api/handover/kpi');
    setKpiPlans(res.data);
  };

  const fetchDebts = async () => {
    const res = await axios.get('/api/handover/debts');
    setDebts(res.data.debts || []);
    setDebtTotals(res.data.totals || { totalUsd: 0, totalUzs: 0 });
  };

  const fetchSalaries = async () => {
    const res = await axios.get('/api/handover/salaries');
    setSalaries(res.data.salaries || []);
    setTotalFOT(res.data.totalFOT || 0);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchChecklist(), fetchKPI(), fetchDebts(), fetchSalaries()]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update checklist item
  const handleToggleChecklist = async (id: string, field: 'actDone' | 'applicationTaken', currentVal: boolean) => {
    try {
      const updated = { [field]: !currentVal };
      await axios.put(`/api/handover/checklist/${id}`, updated);
      setChecklist(checklist.map((item) => item.id === id ? { ...item, [field]: !currentVal } : item));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateChecklistComment = async (id: string, comment: string) => {
    try {
      await axios.put(`/api/handover/checklist/${id}`, { comment });
    } catch (err) {
      console.error(err);
    }
  };

  // Add Debt
  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/handover/debts', debtForm);
      setShowAddDebt(false);
      setDebtForm({
        debtorName: '',
        roleDescription: '',
        telegram: '',
        contactPhone: '',
        amountUsd: 0,
        amountUzs: 0,
        remainingAmount: 0,
        note: '',
        weOwe: false,
        isConfirmed: false,
      });
      notify('Qarzdorlik yozuvi qo\'shildi');
      fetchDebts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Xatolik');
    }
  };

  const handleDeleteDebt = async (id: string) => {
    if (!window.confirm('Rostdan ham ushbu yozuvni o\'chirmoqchimisiz?')) return;
    try {
      await axios.delete(`/api/handover/debts/${id}`);
      notify('O\'chirildi');
      fetchDebts();
    } catch (err) {
      console.error(err);
    }
  };

  // Add Salary
  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/handover/salaries', salaryForm);
      setShowAddSalary(false);
      setSalaryForm({
        employeeName: '',
        position: '',
        baseSalary: 0,
        bonusAmount: 0,
        paymentDate: new Date().toISOString().split('T')[0],
        isPaid: false,
        note: '',
      });
      notify('Xodim oyligi saqlandi');
      fetchSalaries();
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
            <ClipboardCheck className="w-7 h-7 text-indigo-600" />
            Topshirish va Boshqaruv (Прием передача, Лист5, Лист8, ФОТ)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Biznesni qabul qilish aktlari, xodimlar KPI talablari, qarzdorliklar va oylik maoshlar fondi
          </p>
        </div>
        <button
          onClick={loadData}
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
            onClick={() => setActiveTab('CHECKLIST')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'CHECKLIST'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Прием передача (Nazorat ro'yxati)
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800">
              {checklist.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('KPI')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'KPI'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Target className="w-4 h-4" />
            Лист5 (Xodimlar KPI Rejasi)
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800">
              {kpiPlans.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('DEBTS')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'DEBTS'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Лист8 (Qarzdorliklar)
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
              {debts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('FOT')}
            className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === 'FOT'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="w-4 h-4" />
            ФОТ (Ish haqi fondi)
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">
              {salaries.length}
            </span>
          </button>
        </nav>
      </div>

      {/* TAB 1: Checklist */}
      {activeTab === 'CHECKLIST' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Biznesni topshirish va qabul qilish paytida tekshirilishi lozim bo'lgan barcha vazifalar va aktlar nazorati (18 band):
          </p>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-3 text-center w-12">№</th>
                  <th className="py-3 px-3">Topshirish ob'yekti va tavsifi</th>
                  <th className="py-3 px-3 text-center">Akt tuzilganmi</th>
                  <th className="py-3 px-3 text-center">Ariza olinganmi</th>
                  <th className="py-3 px-3">Holat</th>
                  <th className="py-3 px-3">Izoh / Kommentariy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {checklist.map((item) => (
                  <tr key={item.id} className="hover:bg-indigo-50/20">
                    <td className="py-3 px-3 text-center font-bold text-gray-500">{item.orderNum}</td>
                    <td className="py-3 px-3 font-semibold text-gray-900">{item.taskDescription}</td>
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={item.actDone}
                        onChange={() => handleToggleChecklist(item.id, 'actDone', item.actDone)}
                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={item.applicationTaken}
                        onChange={() => handleToggleChecklist(item.id, 'applicationTaken', item.applicationTaken)}
                        className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-700">
                        {item.status || 'Jarayonda'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        defaultValue={item.comment || ''}
                        onBlur={(e) => handleUpdateChecklistComment(item.id, e.target.value)}
                        placeholder="Izoh yozish..."
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:border-indigo-500 outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Staff KPI Plans (Лист5) */}
      {activeTab === 'KPI' && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Kompaniya xodimlari uchun hisobot berish davriyligi, formati va kutilayotgan KPI ko'rsatkichlari rejasi:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {kpiPlans.map((kpi) => (
              <div key={kpi.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                    <Target className="w-5 h-5 text-indigo-600" />
                    {kpi.roleName}
                  </h3>
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {kpi.reportType || 'Har kuni'}
                  </span>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg text-xs space-y-1.5 text-gray-700">
                  <div>
                    <span className="font-semibold text-gray-900">Hisobot formati: </span>
                    {kpi.reportFormat || 'Excel / Telegram guruh'}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900">Boshqaruv KPI talablari: </span>
                    {kpi.kpiDetails || 'Kunlik reja bajarilishi, kassa hisobi'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Debts (Лист8) */}
      {activeTab === 'DEBTS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-4">
              <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-[11px] font-semibold text-gray-500 uppercase">Jami qarz (USD):</span>
                <p className="text-lg font-bold text-gray-900">${debtTotals.totalUsd.toLocaleString('en-US')}</p>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
                <span className="text-[11px] font-semibold text-gray-500 uppercase">Jami qarz (UZS):</span>
                <p className="text-lg font-bold text-indigo-600">{formatMoney(debtTotals.totalUzs)}</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddDebt(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Yangi qarzdorlik qo'shish
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                  <tr>
                    <th className="py-3 px-3">Qarzdor F.I.O. / Nomi</th>
                    <th className="py-3 px-3">Lavozimi / Aloqa</th>
                    <th className="py-3 px-3 text-right">Summa (USD)</th>
                    <th className="py-3 px-3 text-right">Summa (UZS)</th>
                    <th className="py-3 px-3 text-center">Turi</th>
                    <th className="py-3 px-3 text-center">Tasdiqlangan</th>
                    <th className="py-3 px-3">Izoh</th>
                    <th className="py-3 px-3 text-center">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {debts.map((d) => (
                    <tr key={d.id} className="hover:bg-amber-50/20">
                      <td className="py-3 px-3 font-semibold text-gray-900">{d.debtorName}</td>
                      <td className="py-3 px-3 text-gray-600">
                        <div>{d.roleDescription || '-'}</div>
                        {d.contactPhone && <div className="text-[11px] text-gray-400">{d.contactPhone}</div>}
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-gray-800">
                        {d.amountUsd ? `$${Number(d.amountUsd).toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-indigo-600">
                        {d.amountUzs ? formatMoney(d.amountUzs) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          d.weOwe ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {d.weOwe ? 'Bizning qarzimiz' : 'Bizga berishi kerak'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          d.isConfirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {d.isConfirmed ? 'Tasdiqlangan' : 'Kutilmoqda'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-500 max-w-xs truncate">{d.note || '-'}</td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleDeleteDebt(d.id)}
                          className="text-red-500 hover:text-red-700 p-1 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Employee Salaries & FOT */}
      {activeTab === 'FOT' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
              <span className="text-[11px] font-semibold text-gray-500 uppercase">Jami Ish Haqi Fondi (FOT):</span>
              <p className="text-xl font-bold text-emerald-700">{formatMoney(totalFOT)}</p>
            </div>
            <button
              onClick={() => setShowAddSalary(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Yangi xodim maoshi qo'shish
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase">
                <tr>
                  <th className="py-3 px-4">Xodim F.I.O.</th>
                  <th className="py-3 px-4">Lavozim</th>
                  <th className="py-3 px-4 text-right">Oklad (Asosiy oylik)</th>
                  <th className="py-3 px-4 text-right">Bonus / Ustama</th>
                  <th className="py-3 px-4 text-right font-bold text-gray-900">Jami Maosh</th>
                  <th className="py-3 px-4 text-center">To'lov sanasi</th>
                  <th className="py-3 px-4 text-center">To'langan</th>
                  <th className="py-3 px-4">Izoh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {salaries.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-semibold text-gray-900">{s.employeeName}</td>
                    <td className="py-3 px-4 text-gray-600">{s.position}</td>
                    <td className="py-3 px-4 text-right text-gray-700 font-medium">{formatMoney(s.baseSalary)}</td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-medium">{formatMoney(s.bonusAmount)}</td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-700">{formatMoney(s.totalAmount)}</td>
                    <td className="py-3 px-4 text-center text-gray-500">{formatDate(s.paymentDate)}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        s.isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {s.isPaid ? 'To\'langan' : 'Kutilmoqda'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{s.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Debt */}
      {showAddDebt && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="font-bold text-gray-900 text-base pb-3 border-b border-gray-100">Yangi Qarzdorlik Kiritish</h3>
            <form onSubmit={handleSaveDebt} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Qarzdor F.I.O. / Hamkor</label>
                <input
                  type="text"
                  required
                  value={debtForm.debtorName}
                  onChange={(e) => setDebtForm({ ...debtForm, debtorName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Lavozimi / Tavsif</label>
                  <input
                    type="text"
                    value={debtForm.roleDescription}
                    onChange={(e) => setDebtForm({ ...debtForm, roleDescription: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={debtForm.contactPhone}
                    onChange={(e) => setDebtForm({ ...debtForm, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Summa (USD)</label>
                  <input
                    type="number"
                    value={debtForm.amountUsd}
                    onChange={(e) => setDebtForm({ ...debtForm, amountUsd: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Summa (UZS)</label>
                  <input
                    type="number"
                    value={debtForm.amountUzs}
                    onChange={(e) => setDebtForm({ ...debtForm, amountUzs: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Izoh / Sababi</label>
                <input
                  type="text"
                  value={debtForm.note}
                  onChange={(e) => setDebtForm({ ...debtForm, note: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={debtForm.weOwe}
                    onChange={(e) => setDebtForm({ ...debtForm, weOwe: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Bizning qarzimizmi?
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={debtForm.isConfirmed}
                    onChange={(e) => setDebtForm({ ...debtForm, isConfirmed: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Tasdiqlanganmi?
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAddDebt(false)} className="px-4 py-2 border rounded-lg text-xs">Bekor qilish</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Salary */}
      {showAddSalary && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="font-bold text-gray-900 text-base pb-3 border-b border-gray-100">Xodim Maoshini Kiritish</h3>
            <form onSubmit={handleSaveSalary} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Xodim F.I.O.</label>
                <input
                  type="text"
                  required
                  value={salaryForm.employeeName}
                  onChange={(e) => setSalaryForm({ ...salaryForm, employeeName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Lavozimi</label>
                <input
                  type="text"
                  required
                  placeholder="Masalan: Bosh hisobchi, Operator"
                  value={salaryForm.position}
                  onChange={(e) => setSalaryForm({ ...salaryForm, position: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Oklad (UZS)</label>
                  <input
                    type="number"
                    required
                    value={salaryForm.baseSalary}
                    onChange={(e) => setSalaryForm({ ...salaryForm, baseSalary: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bonus (UZS)</label>
                  <input
                    type="number"
                    value={salaryForm.bonusAmount}
                    onChange={(e) => setSalaryForm({ ...salaryForm, bonusAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="paidCheck"
                  checked={salaryForm.isPaid}
                  onChange={(e) => setSalaryForm({ ...salaryForm, isPaid: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="paidCheck" className="text-xs font-medium text-gray-700">To'langanmi?</label>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowAddSalary(false)} className="px-4 py-2 border rounded-lg text-xs">Bekor qilish</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default HandoverPage;