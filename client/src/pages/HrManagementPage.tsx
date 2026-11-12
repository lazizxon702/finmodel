import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Users,
  CalendarCheck,
  Wallet,
  CheckSquare,
  UserPlus,
  DollarSign,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { formatNumber, formatDate, todayYmd } from '../utils/format';
import {
  Button, Card, Modal, PageHeader, StatCard, Badge, Field, Input, Select, Textarea,
  TableContainer, Table, Thead, Tbody, Tr, Th, Td, TableEmpty, EmptyState, LoadingBlock, Tabs, cn,
} from '../components/ui';
import type { Tone } from '../components/ui/StatCard';

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

// Server kodlari (API qiymatlari) — tarjima qilinmaydi, faqat yorliqlari tarjima qilinadi
const DEPARTMENTS = ['Operatsiyalar', 'Koll-markaz', 'Logistika va Ombor', 'Sotuv', 'Buxgalteriya', 'Boshqaruv'];
const PRIORITIES = ['YUQORI', 'ORTA', 'PAST'];
const ATTENDANCE_STATUSES = ['KELDI', 'KECHIKDI', 'SABABLI', 'KELMADI'];
const TASK_STATUSES = ['YANGI', 'JARAYONDA', 'BAJARILDI'];

const ATTENDANCE_TONE: Record<string, Tone> = { KELDI: 'success', KECHIKDI: 'warning' };
const PRIORITY_TONE: Record<string, Tone> = { YUQORI: 'danger', ORTA: 'warning', PAST: 'info' };

type HrTab = 'employees' | 'attendance' | 'advances' | 'tasks';

export const HrManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<HrTab>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Oynalar holati
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isAttendModalOpen, setIsAttendModalOpen] = useState(false);

  // Forma holatlari
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
    reason: t('hr.advance.defaultReason'),
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
    date: todayYmd(),
    checkInTime: '09:00',
    checkOutTime: '18:00',
    status: 'KELDI',
    lateMinutes: '0',
    overtimeMinutes: '0',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setLoadError('');
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
    } catch (err: any) {
      console.error('Error fetching HR data:', err);
      setLoadError(err.response?.data?.error || t('common.load_error'));
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
    } catch (err: any) {
      alert(err.response?.data?.error || t('hr.emp.saveError'));
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
        reason: t('hr.advance.defaultReason'),
        accountType: 'CASH',
        createDdsExpense: true,
      });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || t('hr.advance.error'));
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
    } catch (err: any) {
      alert(err.response?.data?.error || t('hr.task.error'));
    }
  };

  const handleRecordAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/hr/attendance', attendForm);
      setIsAttendModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || t('hr.attend.error'));
    }
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await axios.put(`/api/hr/tasks/${taskId}`, { status: newStatus });
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || t('hr.task.statusError'));
    }
  };

  // Ma'lum kodlar uchun tarjima, noma'lum kod bo'lsa o'zi
  const labelOf = (prefix: string, codes: string[], code: string): string =>
    codes.includes(code) ? t(`${prefix}.${code}`) : code;

  // Statistika
  const totalEmployees = employees.length;
  const totalBaseSalary = employees.reduce((acc, curr) => acc + Number(curr.baseSalary || 0), 0);
  const totalAdvancesPaid = advances.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const pendingTasks = tasks.filter((task) => task.status !== 'BAJARILDI').length;

  const headerAction = {
    employees: (
      <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setIsEmpModalOpen(true)}>
        {t('hr.action.newEmployee')}
      </Button>
    ),
    attendance: (
      <Button leftIcon={<CalendarCheck className="h-4 w-4" />} onClick={() => setIsAttendModalOpen(true)}>
        {t('hr.action.markAttendance')}
      </Button>
    ),
    advances: (
      <Button leftIcon={<DollarSign className="h-4 w-4" />} onClick={() => setIsAdvanceModalOpen(true)}>
        {t('hr.action.giveAdvance')}
      </Button>
    ),
    tasks: (
      <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setIsTaskModalOpen(true)}>
        {t('hr.action.newTask')}
      </Button>
    ),
  }[activeTab];

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title={t('hr.title')} description={t('hr.subtitle')} actions={headerAction} />

      {loadError && (
        <div role="alert" className="rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {loadError}
        </div>
      )}

      {/* KPI kartalar */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          title={t('hr.kpi.employees')}
          value={t('hr.kpi.employeesValue', { count: totalEmployees })}
          hint={t('hr.kpi.employeesHint')}
          tone="success"
        />
        <StatCard
          title={t('hr.kpi.payroll')}
          value={<span className="text-lg sm:text-xl">{formatNumber(totalBaseSalary)} <span className="text-xs font-normal">UZS</span></span>}
          hint={t('hr.kpi.payrollHint')}
          tone="danger"
        />
        <StatCard
          title={t('hr.kpi.advances')}
          value={<span className="text-lg sm:text-xl">{formatNumber(totalAdvancesPaid)} <span className="text-xs font-normal">UZS</span></span>}
          hint={t('hr.kpi.advancesHint')}
          tone="warning"
        />
        <StatCard title={t('hr.kpi.openTasks')} value={pendingTasks} hint={t('hr.kpi.openTasksHint')} tone="info" />
      </div>

      {/* Bo'limlar */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'employees', label: t('hr.tab.employees'), icon: <Users /> },
          { value: 'attendance', label: t('hr.tab.attendance'), icon: <CalendarCheck /> },
          { value: 'advances', label: t('hr.tab.advances'), icon: <Wallet /> },
          { value: 'tasks', label: t('hr.tab.tasks'), icon: <CheckSquare /> },
        ]}
      />

      {/* 1: Xodimlar */}
      {activeTab === 'employees' && (
        <Card padding="none">
          <TableContainer bare>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('hr.col.fullName')}</Th>
                  <Th>{t('hr.col.position')}</Th>
                  <Th>{t('hr.col.department')}</Th>
                  <Th align="right">{t('hr.col.baseSalary')}</Th>
                  <Th align="right">{t('hr.col.kpiBonus')}</Th>
                  <Th>{t('hr.col.schedule')}</Th>
                  <Th>{t('common.status')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <LoadingBlock label={t('common.loading')} />
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <TableEmpty colSpan={7} title={t('hr.employees.empty')} />
                ) : (
                  employees.map((emp) => (
                    <Tr key={emp.id}>
                      <Td className="font-semibold text-fg">
                        {emp.fullName}
                        {emp.phone && (
                          <span className="block font-mono text-[11px] font-normal tabular-nums text-fg-muted">{emp.phone}</span>
                        )}
                      </Td>
                      <Td className="font-medium text-accent">{emp.position}</Td>
                      <Td className="text-fg-secondary">{labelOf('hr.dept', DEPARTMENTS, emp.department)}</Td>
                      <Td align="right" numeric className="font-semibold text-fg">
                        {formatNumber(emp.baseSalary)} UZS
                      </Td>
                      <Td align="right" numeric className="font-medium text-success">
                        +{formatNumber(emp.kpiBonus)} UZS
                      </Td>
                      <Td numeric className="text-fg-muted">{emp.schedule || '09:00 - 18:00'}</Td>
                      <Td>
                        <Badge tone="success" size="sm">{t('common.active')}</Badge>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* 2: Davomat va tabel */}
      {activeTab === 'attendance' && (
        <Card padding="none">
          <TableContainer bare>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('hr.col.employee')}</Th>
                  <Th>{t('hr.col.checkInOut')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th>{t('hr.col.late')}</Th>
                  <Th>{t('hr.col.approvedBy')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {attendances.length === 0 ? (
                  <TableEmpty colSpan={6} title={t('hr.attendance.empty')} />
                ) : (
                  attendances.map((att) => (
                    <Tr key={att.id}>
                      <Td numeric className="font-mono">{formatDate(att.date)}</Td>
                      <Td className="font-semibold text-fg">{att.employee?.fullName}</Td>
                      <Td numeric className="font-mono">
                        {att.checkInTime || '-'} — {att.checkOutTime || t('hr.attendance.stillAtWork')}
                      </Td>
                      <Td>
                        <Badge tone={ATTENDANCE_TONE[att.status] || 'danger'} size="sm">
                          {labelOf('hr.attendance.status', ATTENDANCE_STATUSES, att.status)}
                        </Badge>
                      </Td>
                      <Td numeric>
                        {att.lateMinutes > 0 ? (
                          <span className="font-semibold text-danger">{t('hr.attendance.lateMinutes', { count: att.lateMinutes })}</span>
                        ) : (
                          <span className="text-fg-muted">{t('hr.attendance.onTime')}</span>
                        )}
                      </Td>
                      <Td className="text-fg-muted">{att.approvedBy || t('hr.attendance.defaultApprover')}</Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* 3: Avans va maosh */}
      {activeTab === 'advances' && (
        <Card padding="none">
          <TableContainer bare>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('hr.col.employee')}</Th>
                  <Th align="right">{t('hr.col.advanceAmount')}</Th>
                  <Th>{t('hr.col.source')}</Th>
                  <Th>{t('hr.col.reason')}</Th>
                  <Th>{t('common.status')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {advances.length === 0 ? (
                  <TableEmpty colSpan={6} title={t('hr.advances.empty')} />
                ) : (
                  advances.map((adv) => (
                    <Tr key={adv.id}>
                      <Td numeric className="font-mono">{formatDate(adv.date)}</Td>
                      <Td className="font-semibold text-fg">{adv.employee?.fullName}</Td>
                      <Td align="right" numeric className="font-semibold text-danger">
                        {formatNumber(adv.amount)} UZS
                      </Td>
                      <Td className="font-medium">
                        {adv.accountType === 'BANK' ? t('hr.account.BANK') : t('hr.account.CASH')}
                      </Td>
                      <Td className="text-fg-muted">{adv.reason || t('hr.advances.defaultReason')}</Td>
                      <Td>
                        <Badge tone="success" size="sm">{t('hr.advances.paid')}</Badge>
                      </Td>
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* 4: Vazifalar va KPI */}
      {activeTab === 'tasks' && (
        tasks.length === 0 ? (
          <Card>
            <EmptyState title={t('hr.tasks.empty')} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <Card key={task.id} className="flex flex-col justify-between space-y-3">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge tone={PRIORITY_TONE[task.priority] || 'neutral'} size="sm">
                      {t('hr.tasks.priority', { value: labelOf('hr.priority', PRIORITIES, task.priority) })}
                    </Badge>

                    <span
                      className={cn(
                        'text-[11px] font-semibold',
                        task.status === 'BAJARILDI' ? 'text-success' : 'text-fg-muted'
                      )}
                    >
                      {labelOf('hr.taskStatus', TASK_STATUSES, task.status)}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-fg">{task.title}</h4>
                  {task.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{task.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs">
                  <span className="font-medium text-fg-secondary">
                    {t('hr.tasks.assignee', { name: task.assigneeName || t('hr.tasks.everyone') })}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {task.status !== 'BAJARILDI' ? (
                      <Button size="sm" variant="success" onClick={() => handleTaskStatusChange(task.id, 'BAJARILDI')}>
                        {t('hr.tasks.done')}
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{t('hr.tasks.finished')}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Yangi xodim */}
      <Modal
        open={isEmpModalOpen}
        onClose={() => setIsEmpModalOpen(false)}
        size="md"
        title={t('hr.emp.title')}
        description={t('hr.emp.subtitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsEmpModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="hr-emp-form">
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form id="hr-emp-form" onSubmit={handleCreateEmployee} className="space-y-3.5">
          <Field label={t('hr.emp.fullName')} required>
            <Input
              type="text"
              required
              value={empForm.fullName}
              onChange={(e) => setEmpForm({ ...empForm, fullName: e.target.value })}
              placeholder={t('hr.emp.fullNamePlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('hr.emp.position')} required>
              <Input
                type="text"
                required
                value={empForm.position}
                onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })}
                placeholder={t('hr.emp.positionPlaceholder')}
              />
            </Field>
            <Field label={t('hr.col.department')}>
              <Select value={empForm.department} onChange={(e) => setEmpForm({ ...empForm, department: e.target.value })}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{t(`hr.dept.${d}`)}</option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('hr.emp.baseSalary')}>
              <Input
                type="number"
                inputMode="numeric"
                value={empForm.baseSalary}
                onChange={(e) => setEmpForm({ ...empForm, baseSalary: e.target.value })}
                placeholder="6000000"
                className="tabular-nums"
              />
            </Field>
            <Field label={t('hr.emp.kpiBonus')}>
              <Input
                type="number"
                inputMode="numeric"
                value={empForm.kpiBonus}
                onChange={(e) => setEmpForm({ ...empForm, kpiBonus: e.target.value })}
                placeholder="1500000"
                className="tabular-nums"
              />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Avans berish */}
      <Modal
        open={isAdvanceModalOpen}
        onClose={() => setIsAdvanceModalOpen(false)}
        size="md"
        title={t('hr.advance.title')}
        description={t('hr.advance.subtitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAdvanceModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="hr-advance-form">
              {t('hr.advance.confirm')}
            </Button>
          </>
        }
      >
        <form id="hr-advance-form" onSubmit={handleCreateAdvance} className="space-y-3.5">
          <Field label={t('hr.advance.employee')} required>
            <Select
              required
              value={advanceForm.employeeId}
              onChange={(e) => setAdvanceForm({ ...advanceForm, employeeId: e.target.value })}
            >
              <option value="">{t('hr.advance.selectEmployee')}</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.position})
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('hr.advance.amount')} required>
            <Input
              type="number"
              inputMode="numeric"
              required
              value={advanceForm.amount}
              onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
              placeholder="1000000"
              className="font-semibold tabular-nums"
            />
          </Field>

          <Field label={t('hr.advance.source')}>
            <Select
              value={advanceForm.accountType}
              onChange={(e) => setAdvanceForm({ ...advanceForm, accountType: e.target.value })}
            >
              <option value="CASH">{t('hr.account.CASH_OPTION')}</option>
              <option value="BANK">{t('hr.account.BANK_OPTION')}</option>
            </Select>
          </Field>

          <Field label={t('hr.advance.reason')}>
            <Input
              type="text"
              value={advanceForm.reason}
              onChange={(e) => setAdvanceForm({ ...advanceForm, reason: e.target.value })}
              placeholder={t('hr.advance.defaultReason')}
            />
          </Field>

          <label
            htmlFor="createDds"
            className="flex min-h-touch cursor-pointer items-center gap-2 rounded-control border border-warning/30 bg-warning-soft p-3 sm:min-h-0"
          >
            <input
              type="checkbox"
              id="createDds"
              checked={advanceForm.createDdsExpense}
              onChange={(e) => setAdvanceForm({ ...advanceForm, createDdsExpense: e.target.checked })}
              className="h-4 w-4 shrink-0 rounded border-line-strong accent-brand"
            />
            <span className="text-[11px] font-medium text-fg-secondary">{t('hr.advance.createDds')}</span>
          </label>
        </form>
      </Modal>

      {/* Yangi vazifa */}
      <Modal
        open={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        size="md"
        title={t('hr.task.title')}
        description={t('hr.task.subtitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsTaskModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="hr-task-form">
              {t('hr.task.save')}
            </Button>
          </>
        }
      >
        <form id="hr-task-form" onSubmit={handleCreateTask} className="space-y-3.5">
          <Field label={t('hr.task.name')} required>
            <Input
              type="text"
              required
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder={t('hr.task.namePlaceholder')}
            />
          </Field>

          <Field label={t('hr.task.description')}>
            <Textarea
              rows={2}
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              placeholder={t('hr.task.descriptionPlaceholder')}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('hr.task.assignee')}>
              <Input
                type="text"
                value={taskForm.assigneeName}
                onChange={(e) => setTaskForm({ ...taskForm, assigneeName: e.target.value })}
                placeholder={t('hr.task.assigneePlaceholder')}
              />
            </Field>
            <Field label={t('hr.task.priorityLabel')}>
              <Select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{t(`hr.priority.${p}`)}</option>
                ))}
              </Select>
            </Field>
          </div>
        </form>
      </Modal>

      {/* Davomat belgilash */}
      <Modal
        open={isAttendModalOpen}
        onClose={() => setIsAttendModalOpen(false)}
        size="md"
        title={t('hr.attend.title')}
        description={t('hr.attend.subtitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAttendModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="hr-attend-form">
              {t('hr.attend.mark')}
            </Button>
          </>
        }
      >
        <form id="hr-attend-form" onSubmit={handleRecordAttendance} className="space-y-3.5">
          <Field label={t('hr.advance.employee')} required>
            <Select
              required
              value={attendForm.employeeId}
              onChange={(e) => setAttendForm({ ...attendForm, employeeId: e.target.value })}
            >
              <option value="">{t('hr.advance.selectEmployee')}</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('common.date')}>
              <Input
                type="date"
                value={attendForm.date}
                onChange={(e) => setAttendForm({ ...attendForm, date: e.target.value })}
              />
            </Field>
            <Field label={t('common.status')}>
              <Select value={attendForm.status} onChange={(e) => setAttendForm({ ...attendForm, status: e.target.value })}>
                <option value="KELDI">{t('hr.attendance.statusOption.KELDI')}</option>
                <option value="KECHIKDI">{t('hr.attendance.status.KECHIKDI')}</option>
                <option value="SABABLI">{t('hr.attendance.statusOption.SABABLI')}</option>
                <option value="KELMADI">{t('hr.attendance.status.KELMADI')}</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('hr.attend.checkIn')}>
              <Input
                type="time"
                value={attendForm.checkInTime}
                onChange={(e) => setAttendForm({ ...attendForm, checkInTime: e.target.value })}
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label={t('hr.attend.checkOut')}>
              <Input
                type="time"
                value={attendForm.checkOutTime}
                onChange={(e) => setAttendForm({ ...attendForm, checkOutTime: e.target.value })}
                className="font-mono tabular-nums"
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default HrManagementPage;
