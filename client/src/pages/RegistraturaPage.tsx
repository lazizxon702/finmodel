import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Ban, ClipboardPen, FileText, Hourglass, KeyRound, Pencil, Plus, RefreshCw, Search, UserCheck, UsersRound, Wallet } from 'lucide-react';
import { PasswordCell } from '../components/PasswordCell';
import { useTranslation } from '../context/LanguageContext';
import { useRealtime } from '../context/SocketContext';
import { formatNumber, todayYmd } from '../utils/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DateRangeFilter,
  type DateRangeValue,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  StatCard,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from '../components/ui';
import { OneTimePasswordModal, PASSWORD_MIN_LENGTH, USERNAME_PATTERN, type PasswordReveal } from './TeamPage';

// ---------------------------------------------------------------------------
// Registratura jamoasi (faqat ADMIN): kelgan mijozlarga chek kiritadigan xodimlar.
// API: /api/registratura/staff (GET ro'yxat + yig'ma, POST yaratish, PUT ism/holat/parol).
// Forma va parol oynasi Jamoa sahifasi (TeamPage) bilan bir xil ishlaydi.
// ---------------------------------------------------------------------------
interface StaffRow {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  visiblePassword: string | null;
  dealsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalWithdrawnLimit: number;
}

interface StaffSummary {
  staffCount: number;
  dealsCount: number;
  pendingCount: number;
  rejectedCount: number;
  approvedCount: number;
  totalWithdrawnLimit: number;
}

/** Standart davr: 01.11.2026 dan bugungacha (Jamoa sahifasi bilan bir xil) */
const START_YMD = '2026-11-01';
const defaultRange = (): DateRangeValue => ({ mode: 'custom', startDate: START_YMD, endDate: todayYmd() });

type FormErrors = { fullName?: string; username?: string; password?: string; form?: string };

const iconAction =
  'inline-flex h-11 w-11 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9';

export const RegistraturaPage: React.FC = () => {
  const { t } = useTranslation();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [summary, setSummary] = useState<StaffSummary | null>(null);
  const [range, setRange] = useState<DateRangeValue>(defaultRange);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Qo'shish / tahrirlash formasi
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [form, setForm] = useState({ fullName: '', username: '', password: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  // Parolni tiklash
  const [resetTarget, setResetTarget] = useState<StaffRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);

  const [reveal, setReveal] = useState<PasswordReveal | null>(null);

  // Qidiruv: yozishdan to'xtagach (350 ms) so'rov ketadi
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const loadStaff = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await axios.get('/api/registratura/staff', {
          params: { from: range.startDate || undefined, to: range.endDate || undefined, q: search || undefined },
        });
        setStaff(Array.isArray(res.data?.staff) ? res.data.staff : []);
        setSummary(res.data?.summary ?? null);
        setLoadError('');
      } catch (e: any) {
        // Fon yangilanishidagi xato mavjud ro'yxatni buzmaydi
        if (!silent) {
          setStaff([]);
          setSummary(null);
          setLoadError(e?.response?.data?.error || t('registratura.err_load'));
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [range.startDate, range.endDate, search, t]
  );

  useEffect(() => {
    void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.startDate, range.endDate, search]);

  // Cheklar soni o'zgarsa ro'yxat jimgina yangilanadi
  useRealtime('deals:updated', () => void loadStaff(true));

  const openAdd = () => {
    setEditing(null);
    setForm({ fullName: '', username: '', password: '' });
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (row: StaffRow) => {
    setEditing(row);
    setForm({ fullName: row.fullName, username: row.username, password: '' });
    setErrors({});
    setFormOpen(true);
  };

  const submitForm = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const fullName = form.fullName.trim();
    const username = form.username.trim();
    const password = form.password.trim();

    const next: FormErrors = {};
    if (!fullName) next.fullName = t('team.err_fullName');
    if (!editing) {
      if (!USERNAME_PATTERN.test(username)) next.username = t('team.err_username');
      if (password && password.length < PASSWORD_MIN_LENGTH) next.password = t('team.err_password');
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/api/registratura/staff/${editing.id}`, { fullName });
        setFormOpen(false);
      } else {
        const res = await axios.post('/api/registratura/staff', { fullName, username, ...(password ? { password } : {}) });
        setFormOpen(false);
        // Parol faqat shu yerda, bir marta ko'rsatiladi (server yaratgan yoki qo'lda kiritilgan)
        setReveal({ fullName, username, password: res.data?.generatedPassword || password });
      }
      await loadStaff(true);
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || t('team.err_save');
      if (status === 409) setErrors({ username: err?.response?.data?.error || t('team.err_username_taken') });
      else if (status === 400 && /parol/i.test(message)) setErrors({ password: message });
      else if (status === 400 && /login/i.test(message)) setErrors({ username: message });
      else setErrors({ form: message });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: StaffRow) => {
    if (row.isActive && !window.confirm(t('team.block_confirm', { name: row.fullName }))) return;
    setBusyId(row.id);
    setActionError('');
    try {
      const res = await axios.put(`/api/registratura/staff/${row.id}`, { isActive: !row.isActive });
      setStaff((prev) => prev.map((s) => (s.id === row.id ? { ...s, isActive: res.data?.isActive ?? !row.isActive } : s)));
    } catch (err: any) {
      setActionError(err?.response?.data?.error || t('team.err_status'));
    } finally {
      setBusyId(null);
    }
  };

  const openReset = (row: StaffRow) => {
    setResetTarget(row);
    setResetPassword('');
    setResetError('');
  };

  const submitReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!resetTarget || resetting) return;
    const password = resetPassword.trim();
    if (password && password.length < PASSWORD_MIN_LENGTH) {
      setResetError(t('team.err_password'));
      return;
    }
    setResetting(true);
    setResetError('');
    try {
      const res = await axios.put(`/api/registratura/staff/${resetTarget.id}`, { resetPassword: password || true });
      const target = resetTarget;
      setResetTarget(null);
      setReveal({ fullName: target.fullName, username: target.username, password: res.data?.generatedPassword || password });
      void loadStaff(true); // "Parol" ustuni yangilansin
    } catch (err: any) {
      setResetError(err?.response?.data?.error || t('team.err_save'));
    } finally {
      setResetting(false);
    }
  };

  const activeCount = staff.filter((s) => s.isActive).length;

  /** Cheklar: jami + kutilayotgan / rad etilganlar (bo'lsa) */
  const chequesCell = (row: StaffRow) => (
    <>
      {formatNumber(row.dealsCount)}
      {row.pendingCount > 0 && (
        <span className="block text-xs font-normal text-warning">{t('team.pending_short', { count: row.pendingCount })}</span>
      )}
      {row.rejectedCount > 0 && (
        <span className="block text-xs font-normal text-danger">{t('registratura.rejected_short', { count: row.rejectedCount })}</span>
      )}
    </>
  );

  const rowActions = (row: StaffRow) => (
    <div className="flex items-center justify-end gap-0.5">
      <button type="button" className={iconAction} onClick={() => openEdit(row)} aria-label={t('common.edit')} title={t('common.edit')}>
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={iconAction}
        onClick={() => openReset(row)}
        aria-label={t('team.reset_password')}
        title={t('team.reset_password')}
      >
        <KeyRound className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={iconAction}
        onClick={() => toggleActive(row)}
        disabled={busyId === row.id}
        aria-label={t(row.isActive ? 'team.block' : 'team.unblock')}
        title={t(row.isActive ? 'team.block' : 'team.unblock')}
      >
        {row.isActive ? <Ban className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
      </button>
    </div>
  );

  const statusBadge = (row: StaffRow) => (
    <Badge tone={row.isActive ? 'success' : 'danger'} dot>
      {t(row.isActive ? 'common.active' : 'team.blocked')}
    </Badge>
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={<ClipboardPen />}
        title={t('registratura.title')}
        description={t('registratura.subtitle')}
        actions={
          <>
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
              onClick={() => void loadStaff()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAdd}>
              {t('registratura.add')}
            </Button>
          </>
        }
      />

      {actionError && (
        <div role="alert" className="flex items-start gap-2 rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Davr va qidiruv filtri */}
      <Card className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('registratura.search_ph')}
              aria-label={t('registratura.search_ph')}
              className="pl-9"
              maxLength={80}
            />
          </div>
        </div>
        <p className="text-xs text-fg-muted">{t('registratura.period_note')}</p>
      </Card>

      {/* Yig'ma ko'rsatkichlar (server hisoblaydi) */}
      {!loading && !loadError && summary && (
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <StatCard title={t('registratura.stat_staff')} value={formatNumber(summary.staffCount)} icon={<UsersRound />} tone="violet" />
          <StatCard
            title={t('registratura.stat_cheques')}
            value={formatNumber(summary.dealsCount)}
            hint={t('registratura.stat_cheques_hint', { approved: summary.approvedCount, rejected: summary.rejectedCount })}
            icon={<FileText />}
            tone="info"
          />
          <StatCard
            title={t('registratura.stat_pending')}
            value={formatNumber(summary.pendingCount)}
            icon={<Hourglass />}
            tone={summary.pendingCount > 0 ? 'warning' : 'neutral'}
          />
          <StatCard title={t('registratura.stat_limit')} value={formatNumber(summary.totalWithdrawnLimit)} hint="UZS" icon={<Wallet />} tone="brand" />
        </div>
      )}

      <Card padding="none">
        <CardHeader
          bordered
          title={t('registratura.list')}
          description={!loading && !loadError ? t('registratura.summary', { count: staff.length, active: activeCount }) : undefined}
        />

        {loading ? (
          <LoadingBlock label={t('common.loading')} />
        ) : loadError ? (
          <EmptyState
            icon={<AlertTriangle />}
            title={t('registratura.err_load')}
            description={loadError}
            action={
              <Button variant="secondary" onClick={() => void loadStaff()}>
                {t('common.retry')}
              </Button>
            }
          />
        ) : staff.length === 0 && search ? (
          <EmptyState icon={<Search />} title={t('team.search_empty')} description={t('team.search_empty_hint')} />
        ) : staff.length === 0 ? (
          <EmptyState
            icon={<ClipboardPen />}
            title={t('registratura.empty')}
            description={t('registratura.empty_hint')}
            action={
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                {t('registratura.add')}
              </Button>
            }
          />
        ) : (
          <>
            {/* Jadval — keng ekran */}
            <TableContainer bare className="hidden md:block">
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('team.col_name')}</Th>
                    <Th>{t('team.col_username')}</Th>
                    <Th>{t('usersPage.col_password')}</Th>
                    <Th>{t('common.status')}</Th>
                    <Th align="right">{t('registratura.col_cheques')}</Th>
                    <Th align="right">{t('team.col_limit')}</Th>
                    <Th align="right">{t('common.actions')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {staff.map((row) => (
                    <Tr key={row.id}>
                      <Td className="min-w-[10rem] font-medium">{row.fullName}</Td>
                      <Td className="whitespace-nowrap font-mono text-xs text-fg-secondary">{row.username}</Td>
                      <Td className="whitespace-nowrap">
                        <PasswordCell value={row.visiblePassword} />
                      </Td>
                      <Td>{statusBadge(row)}</Td>
                      <Td align="right" numeric>
                        {chequesCell(row)}
                      </Td>
                      <Td align="right" numeric className="whitespace-nowrap">
                        {formatNumber(row.totalWithdrawnLimit)}
                      </Td>
                      <Td align="right">{rowActions(row)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>

            {/* Kartochkalar — telefon */}
            <ul className="divide-y divide-line md:hidden">
              {staff.map((row) => (
                <li key={row.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-fg">{row.fullName}</p>
                      <p className="mt-0.5 break-all font-mono text-xs text-fg-secondary">{row.username}</p>
                    </div>
                    <div className="shrink-0">{statusBadge(row)}</div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="col-span-2 min-w-0">
                      <dt className="text-xs text-fg-muted">{t('usersPage.col_password')}</dt>
                      <dd className="mt-0.5">
                        <PasswordCell value={row.visiblePassword} />
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-fg-muted">{t('registratura.col_cheques')}</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-fg">{chequesCell(row)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-fg-muted">{t('team.col_limit')}</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-fg">{formatNumber(row.totalWithdrawnLimit)}</dd>
                    </div>
                  </dl>
                  <div className="-mx-2 flex justify-end">{rowActions(row)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Qo'shish / tahrirlash */}
      <Modal
        open={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title={t(editing ? 'registratura.edit_title' : 'registratura.add_title')}
        description={editing ? editing.username : t('registratura.add_desc')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitForm()} loading={saving}>
              {t(editing ? 'common.save' : 'team.create')}
            </Button>
          </>
        }
      >
        <form onSubmit={submitForm} className="space-y-4" noValidate>
          {errors.form && (
            <div role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
              {errors.form}
            </div>
          )}
          <Field label={t('team.field_fullName')} required error={errors.fullName} htmlFor="reg-fullName">
            <Input
              id="reg-fullName"
              autoFocus
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder={t('team.field_fullName_ph')}
              maxLength={120}
              invalid={!!errors.fullName}
            />
          </Field>
          {!editing && (
            <>
              <Field label={t('team.field_username')} required error={errors.username} hint={t('team.field_username_hint')} htmlFor="reg-username">
                <Input
                  id="reg-username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder={t('team.field_username_ph')}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                  className="font-mono"
                  invalid={!!errors.username}
                />
              </Field>
              <Field
                label={`${t('team.field_password')} (${t('common.optional')})`}
                error={errors.password}
                hint={t('team.field_password_hint')}
                htmlFor="reg-password"
              >
                <Input
                  id="reg-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="new-password"
                  spellCheck={false}
                  maxLength={72}
                  className="font-mono"
                  invalid={!!errors.password}
                />
              </Field>
            </>
          )}
          {/* Enter bilan yuborish uchun yashirin tugma (asosiy tugma modal pastida) */}
          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>

      {/* Parolni tiklash */}
      <Modal
        open={!!resetTarget}
        onClose={() => !resetting && setResetTarget(null)}
        size="sm"
        title={t('team.reset_title')}
        description={resetTarget ? t('team.reset_desc', { name: resetTarget.fullName, username: resetTarget.username }) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)} disabled={resetting}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitReset()} loading={resetting}>
              {t('team.reset_submit')}
            </Button>
          </>
        }
      >
        <form onSubmit={submitReset} noValidate>
          <Field
            label={`${t('team.reset_new_password')} (${t('common.optional')})`}
            error={resetError}
            hint={t('team.field_password_hint')}
            htmlFor="reg-reset-password"
          >
            <Input
              id="reg-reset-password"
              autoFocus
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="new-password"
              spellCheck={false}
              maxLength={72}
              className="font-mono"
              invalid={!!resetError}
            />
          </Field>
          <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </Modal>

      <OneTimePasswordModal reveal={reveal} onClose={() => setReveal(null)} />
    </div>
  );
};
export default RegistraturaPage;
