import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, 
  CalendarCheck, 
  Wallet, 
  CheckSquare, 
  UserPlus, 
  Clock, 
  DollarSign, 
  AlertCircle, 
  CheckCircle2, 
  Search, 
  X, 
  Plus, 
  Calendar,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

interface Employee {
  id: string;
  fullName: string;
  phone?: string;
  position: string;
  department: string;
  managerName?: string;
  salaryType: string;
  baseSalary: number;
  kpiBonus: number;
  schedule?: string;
  isActive: boolean;
  advances?: SalaryAdvance[];
}

interface Attendance {
  id: string;
  employeeId: string;
  employee: Employee;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: string;
  lateMinutes: number;
  overtimeMinutes: number;
  approvedBy?: string;
}

interface SalaryAdvance {
  id: string;
  employeeId: string;
  employee: Employee;
  date: string;
  amount: number;
  reason?: string;
  accountType: string;
  status: string;
  paidAt?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  assigneeName?: string;
  priority: string;
  dueDate?: string;
  status: string;
  resultNote?: string;
}

export const HrManagementPage: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'advances' | 'tasks'>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isAttendModalOpen, setIsAttendModalOpen] = useState(false);

  // Forms state
  const [empForm, setEmpForm] = useState({
    fullName: '',
    phone: '',
    position: '',
    department: 'Operatsiyalar',
    managerName: '',
    salaryType: 'MONTHLY',
    baseSalary: '',
    kpiBonus: '',
    schedule: '09:00 - 18:00',
  });

  const [advanceForm, setAdvanceForm] = useState({
    employeeId: '',
    amount: '',
    reason: 'Oylik avansi',
    accountType: 'CASH',
    createDdsExpense: true,
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigneeName: '',
    priority: 'ORTA',
    dueDate: '',
  });

  const [attendForm, setAttendForm] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0],
    checkInTime: '09:00',
    checkOutTime: '18:00',
    status: 'KELDI',
    lateMinutes: '0',
    overtimeMinutes: '0',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [empRes, attRes, advRes, taskRes] = await Promise.all([
        axios.get('/api/hr/employees'),
        axios.get('/api/hr/attendance'),
        axios.get('/api/hr/advances'),
        axios.get('/api/hr/tasks'),
      ]);
      setEmployees(empRes.data);
      setAttendances(attRes.data);
      setAdvances(advRes.data);
      setTasks(taskRes.data);
    } catch (err) {
      console.error('Error fetching HR data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/hr/employees', empForm);
      setIsEmpModalOpen(false);
      setEmpForm({
        fullName: '',
        phone: '',
        position: '',
        department: 'Operatsiyalar',
        managerName: '',
        salaryType: 'MONTHLY',
        baseSalary: '',
        kpiBonus: '',
        schedule: '09:00 - 18:00',
      });
      fetchData();
    } catch (err) {
      alert('Xodim saqlashda xatolik');
    }
  };

  const handleCreateAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/hr/advances', advanceForm);
      setIsAdvanceModalOpen(false);
      setAdvanceForm({
        employeeId: '',
        amount: '',
        reason: 'Oylik avansi',
        accountType: 'CASH',
        createDdsExpense: true,
      });
      fetchData();
    } catch (err) {
      alert('Avans to\'lovida xatolik');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/hr/tasks', taskForm);
      setIsTaskModalOpen(false);
      setTaskForm({
        title: '',
        description: '',
        assigneeName: '',
        priority: 'ORTA',
        dueDate: '',
      });
      fetchData();
    } catch (err) {
      alert('Vazifa yaratishda xatolik');
    }
  };

  const handleRecordAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/hr/attendance', attendForm);
      setIsAttendModalOpen(false);
      fetchData();
    } catch (err) {
      alert('Davomat yozishda xatolik');
    }
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await axios.put(`/api/hr/tasks/${taskId}`, { status: newStatus });
      fetchData();
    } catch (err) {
      alert('Vazifa statusini yangilashda xatolik');
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('uz-UZ').format(num);
  };

  // Stats
  const totalEmployees = employees.length;
  const totalBaseSalary = employees.reduce((acc, curr) => acc + Number(curr.baseSalary || 0), 0);
  const totalAdvancesPaid = advances.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const pendingTasks = tasks.filter((t) => t.status !== 'BAJARILDI').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight">
              HR, Davomat, Ish haqi va Vazifalar
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 uppercase">
              TZ 12.0
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Xodimlar tarkibi, tabel, avanslar, oylik maosh va vazifalar (KPI) boshqaruvi
          </p>
        </div>

        {/* Action Buttons based on active tab */}
        <div className="flex items-center gap-2">
          {activeTab === 'employees' && (
            <button
              onClick={() => setIsEmpModalOpen(true)}
              className="btn-3d py-2 px-3.5 rounded-xl font-bold text-xs bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 text-white shadow-md shadow-rose-600/30 flex items-center gap-1.5 active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span>Yangi Xodim</span>
            </button>
          )}

          {activeTab === 'attendance' && (
            <button
              onClick={() => setIsAttendModalOpen(true)}
              className="btn-3d py-2 px-3.5 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white shadow-md shadow-emerald-600/30 flex items-center gap-1.5 active:scale-95"
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Davomat Belgilash</span>
            </button>
          )}

          {activeTab === 'advances' && (
            <button
              onClick={() => setIsAdvanceModalOpen(true)}
              className="btn-3d py-2 px-3.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 text-white shadow-md shadow-amber-600/30 flex items-center gap-1.5 active:scale-95"
            >
              <DollarSign className="w-4 h-4" />
              <span>Avans Berish</span>
            </button>
          )}

          {activeTab === 'tasks' && (
            <button
              onClick={() => setIsTaskModalOpen(true)}
              className="btn-3d py-2 px-3.5 rounded-xl font-bold text-xs bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 text-white shadow-md shadow-indigo-600/30 flex items-center gap-1.5 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi Vazifa</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">Jami Xodimlar</p>
          <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white mt-1">{totalEmployees} nafar</p>
          <span className="text-[10px] text-emerald-600 font-semibold">Faol shtat</span>
        </div>

        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">Oylik FOT (Reja)</p>
          <p className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 truncate">
            {formatNumber(totalBaseSalary)} <span className="text-xs font-normal">UZS</span>
          </p>
          <span className="text-[10px] text-slate-500 font-semibold">Baza maoshlar jamg'armasi</span>
        </div>

        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">To'langan Avanslar</p>
          <p className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 truncate">
            {formatNumber(totalAdvancesPaid)} <span className="text-xs font-normal">UZS</span>
          </p>
          <span className="text-[10px] text-slate-500 font-semibold">Joriy oyda berilgan</span>
        </div>

        <div className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase">Ochiq Vazifalar</p>
          <p className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{pendingTasks}</p>
          <span className="text-[10px] text-indigo-500 font-semibold">Jarayonda / Kutilmoqda</span>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="p-1 bg-slate-200/70 dark:bg-slate-900 rounded-2xl flex items-center shadow-inner overflow-x-auto">
        <button
          onClick={() => setActiveTab('employees')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
            activeTab === 'employees'
              ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>1. Xodimlar Kartochkasi</span>
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
            activeTab === 'attendance'
              ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>2. Davomat va Tabel</span>
        </button>

        <button
          onClick={() => setActiveTab('advances')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
            activeTab === 'advances'
              ? 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>3. Avans va Maosh</span>
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
            activeTab === 'tasks'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>4. Vazifalar & KPI</span>
        </button>
      </div>

      {/* Tab 1: Employees List */}
      {activeTab === 'employees' && (
        <div className="card-3d rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="table-scroll-container custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="table-sticky-head bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px] shadow-sm">
                <tr>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">F.I.Sh</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Lavozim</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Bo'lim</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Oylik Baza (UZS)</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">KPI Bonus</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Ish Jadvali</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Holati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-200">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {emp.fullName}
                      {emp.phone && <span className="block text-[10px] text-slate-400 font-mono">{emp.phone}</span>}
                    </td>
                    <td className="py-3 px-4 font-semibold text-rose-600 dark:text-rose-400">
                      {emp.position}
                    </td>
                    <td className="py-3 px-4">{emp.department}</td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      {formatNumber(emp.baseSalary)} UZS
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-600">
                      +{formatNumber(emp.kpiBonus)} UZS
                    </td>
                    <td className="py-3 px-4 text-slate-500">{emp.schedule || '09:00 - 18:00'}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Faol
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Attendance (Davomat & Tabel) */}
      {activeTab === 'attendance' && (
        <div className="card-3d rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="table-scroll-container custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="table-sticky-head bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px] shadow-sm">
                <tr>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Sana</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Xodim</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Kelish / Ketish</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Holati</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Kechikish</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Tasdiqlovchi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-200">
                {attendances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Davomat yozuvlari hali kiritilmagan. Yuqoridagi "Davomat Belgilash" tugmasini bosing.
                    </td>
                  </tr>
                ) : (
                  attendances.map((att) => (
                    <tr key={att.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono">
                        {new Date(att.date).toLocaleDateString('uz-UZ')}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {att.employee?.fullName}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {att.checkInTime || '-'} — {att.checkOutTime || 'Hozir ishda'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          att.status === 'KELDI'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : att.status === 'KECHIKDI'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                        }`}>
                          {att.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {att.lateMinutes > 0 ? (
                          <span className="font-bold text-rose-500">+{att.lateMinutes} daqiqa</span>
                        ) : (
                          <span className="text-slate-400">O'z vaqtida</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{att.approvedBy || 'HR'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Salary & Advances */}
      {activeTab === 'advances' && (
        <div className="card-3d rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="table-scroll-container custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="table-sticky-head bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold uppercase text-[10px] shadow-sm">
                <tr>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Sana</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Xodim</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Avans Summasi</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">To'lov Manbasi</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Sabab</th>
                  <th className="py-3 px-4 bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-200">
                {advances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Avanslar berilmagan. Yuqoridagi "Avans Berish" tugmasini bosing.
                    </td>
                  </tr>
                ) : (
                  advances.map((adv) => (
                    <tr key={adv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono">
                        {new Date(adv.date).toLocaleDateString('uz-UZ')}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        {adv.employee?.fullName}
                      </td>
                      <td className="py-3 px-4 font-black text-rose-600 dark:text-rose-400">
                        {formatNumber(adv.amount)} UZS
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {adv.accountType === 'BANK' ? 'Bank kartasi' : 'Naqd kassa'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">{adv.reason || 'Avans'}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                          To'landi
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Tasks & KPI */}
      {activeTab === 'tasks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="card-3d p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    task.priority === 'YUQORI'
                      ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                      : task.priority === 'ORTA'
                      ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                  }`}>
                    {task.priority} USTUVORLIK
                  </span>

                  <span className={`text-[10px] font-bold ${
                    task.status === 'BAJARILDI' ? 'text-emerald-600' : 'text-slate-500'
                  }`}>
                    {task.status}
                  </span>
                </div>

                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  {task.title}
                </h4>
                {task.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {task.description}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Mas'ul: {task.assigneeName || 'Umumiy'}
                </span>

                <div className="flex items-center gap-1.5">
                  {task.status !== 'BAJARILDI' ? (
                    <button
                      onClick={() => handleTaskStatusChange(task.id, 'BAJARILDI')}
                      className="py-1 px-2.5 rounded-lg text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition active:scale-95"
                    >
                      Bajarildi
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Yakunlangan</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: New Employee */}
      {isEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-rose-600 to-pink-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight">Yangi Xodim Qo'shish</h3>
                <p className="text-xs text-rose-100">HR kartochkasi va maosh sozlamalari</p>
              </div>
              <button onClick={() => setIsEmpModalOpen(false)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="p-5 overflow-y-auto space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Xodim F.I.Sh *</label>
                <input
                  type="text"
                  required
                  value={empForm.fullName}
                  onChange={(e) => setEmpForm({ ...empForm, fullName: e.target.value })}
                  placeholder="Misol: Karimov Jasur Baxtiyorovich"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Lavozim *</label>
                  <input
                    type="text"
                    required
                    value={empForm.position}
                    onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })}
                    placeholder="Masalan: Katta Sotuvchi"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Bo'lim</label>
                  <select
                    value={empForm.department}
                    onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="Operatsiyalar">Operatsiyalar</option>
                    <option value="Koll-markaz">Koll-markaz</option>
                    <option value="Logistika va Ombor">Logistika va Ombor</option>
                    <option value="Sotuv">Sotuv</option>
                    <option value="Buxgalteriya">Buxgalteriya</option>
                    <option value="Boshqaruv">Boshqaruv</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Asosiy Oylik Baza (UZS)</label>
                  <input
                    type="number"
                    value={empForm.baseSalary}
                    onChange={(e) => setEmpForm({ ...empForm, baseSalary: e.target.value })}
                    placeholder="6000000"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">KPI Bonusi (UZS)</label>
                  <input
                    type="number"
                    value={empForm.kpiBonus}
                    onChange={(e) => setEmpForm({ ...empForm, kpiBonus: e.target.value })}
                    placeholder="1500000"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEmpModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-3d py-2 px-5 rounded-xl font-bold bg-gradient-to-r from-rose-600 to-pink-600 text-white"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Salary Advance */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 bg-gradient-to-r from-amber-600 to-orange-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight">Avans Berish</h3>
                <p className="text-xs text-amber-100">Xodimga muddatidan oldin maosh berish</p>
              </div>
              <button onClick={() => setIsAdvanceModalOpen(false)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdvance} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Xodimni tanlang *</label>
                <select
                  required
                  value={advanceForm.employeeId}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, employeeId: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                >
                  <option value="">-- Xodimni tanlang --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.position})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Avans Summasi (UZS) *</label>
                <input
                  type="number"
                  required
                  value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                  placeholder="1000000"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-black text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">To'lov Manbasi</label>
                <select
                  value={advanceForm.accountType}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, accountType: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="CASH">Naqd pul (Kassa)</option>
                  <option value="BANK">Bank kartasi / Hisobvaraq</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Sabab / Izoh</label>
                <input
                  type="text"
                  value={advanceForm.reason}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, reason: e.target.value })}
                  placeholder="Oylik avansi"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="createDds"
                  checked={advanceForm.createDdsExpense}
                  onChange={(e) => setAdvanceForm({ ...advanceForm, createDdsExpense: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded"
                />
                <label htmlFor="createDds" className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                  DDS pul harakatiga xarajat (FOT) qilib avtomatik kiritilsin (TZ 12.3)
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdvanceModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-3d py-2 px-5 rounded-xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 text-white"
                >
                  Avansni Tasdiqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Task */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight">Yangi Vazifa Qo'shish</h3>
                <p className="text-xs text-indigo-100">Xodim yoki jamoa uchun vazifa va muddat</p>
              </div>
              <button onClick={() => setIsTaskModalOpen(false)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Vazifa Sarlavhasi *</label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="Misol: Angren filialiga tovar jo'natish"
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Batafsil Tavsif</label>
                <textarea
                  rows={2}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Qo'shimcha tafsilotlar..."
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Mas'ul Shaxs</label>
                  <input
                    type="text"
                    value={taskForm.assigneeName}
                    onChange={(e) => setTaskForm({ ...taskForm, assigneeName: e.target.value })}
                    placeholder="Xodim ismi"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ustuvorlik</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="YUQORI">Yuqori</option>
                    <option value="ORTA">O'rta</option>
                    <option value="PAST">Past</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-3d py-2 px-5 rounded-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                >
                  Vazifani Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Attendance */}
      {isAttendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black tracking-tight">Davomat Belgilash</h3>
                <p className="text-xs text-emerald-100">Xodim kelishi va ketish vaqti</p>
              </div>
              <button onClick={() => setIsAttendModalOpen(false)} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordAttendance} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Xodimni tanlang *</label>
                <select
                  required
                  value={attendForm.employeeId}
                  onChange={(e) => setAttendForm({ ...attendForm, employeeId: e.target.value })}
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                >
                  <option value="">-- Xodimni tanlang --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Sana</label>
                  <input
                    type="date"
                    value={attendForm.date}
                    onChange={(e) => setAttendForm({ ...attendForm, date: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Holati</label>
                  <select
                    value={attendForm.status}
                    onChange={(e) => setAttendForm({ ...attendForm, status: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="KELDI">Keldi (O'z vaqtida)</option>
                    <option value="KECHIKDI">Kechikdi</option>
                    <option value="SABABLI">Sababli (Ruxsat olgan)</option>
                    <option value="KELMADI">Kelmadi</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Kelgan vaqti</label>
                  <input
                    type="time"
                    value={attendForm.checkInTime}
                    onChange={(e) => setAttendForm({ ...attendForm, checkInTime: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Ketgan vaqti</label>
                  <input
                    type="time"
                    value={attendForm.checkOutTime}
                    onChange={(e) => setAttendForm({ ...attendForm, checkOutTime: e.target.value })}
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAttendModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-3d py-2 px-5 rounded-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
                >
                  Belgilash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HrManagementPage;
